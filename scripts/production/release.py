"""Root-owned release runner. Receives images only, never remote commands/config."""
import copy
import gzip
import hashlib
import io
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

from preflight import APP, COMPOSE, ENV, PROJECT, STORAGE, CheckError, require, trusted_path, validate_config

STATE = Path('/var/lib/trixus-production')
GIB = 1024**3
MAX_ARCHIVE = 2 * GIB
MAX_EXPANDED = 5 * GIB
SERVICES = ('backend', 'frontend', 'migrate')
BASE = ['/usr/bin/docker', 'compose', '--project-directory', str(APP),
        '--env-file', str(ENV), '-f', str(COMPOSE), '--profile', 'release']


def command(args, *, output=None, timeout=120, input_file=None):
    # Do not send Compose configuration, database URLs or application logs to CI.
    result = subprocess.run(args, stdin=input_file, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        with (STATE / 'last-error.log').open('ab') as log:
            log.write(result.stderr + b'\n' + (result.stdout or b'') + b'\n')
    require(result.returncode == 0, 'Etapa falhou; consultar registro privado na VPS')
    return (result.stdout or b'').decode().strip()


def parse_request(args):
    require(len(args) == 4, 'Requisicao invalida')
    mode, sha, digest, length = args
    require(mode in ('plan', 'deploy'), 'Operacao invalida')
    require(re.fullmatch('[0-9a-f]{40}', sha), 'Commit invalido')
    require(re.fullmatch('[0-9a-f]{64}', digest), 'Checksum invalido')
    require(re.fullmatch('[0-9]{1,10}', length), 'Tamanho invalido')
    require(0 < int(length) <= MAX_ARCHIVE, 'Pacote excede limite de 2 GiB')
    return mode, sha, digest, int(length)


def receive(source, target, digest, length):
    hasher = hashlib.sha256()
    remaining = length
    with target.open('xb') as output:
        while remaining:
            block = source.read(min(1024**2, remaining))
            require(bool(block), 'Transferencia incompleta')
            output.write(block)
            hasher.update(block)
            remaining -= len(block)
        require(not source.read(1), 'Dados adicionais na transferencia')
    require(hasher.hexdigest() == digest, 'Checksum divergente')


def expand(source, target):
    total = 0
    with gzip.open(source, 'rb') as stream, target.open('xb') as output:
        while block := stream.read(1024**2):
            total += len(block)
            require(total <= MAX_EXPANDED, 'Pacote expandido excede 5 GiB')
            require(shutil.disk_usage(target.parent).free >= 2 * GIB + len(block),
                    'Reserva de disco insuficiente')
            output.write(block)
    return total


def normalize_archive(source, target, sha):
    """Rebuild a Docker legacy archive with ONLY the three authorized tags.

    No tar extraction. Ignore OCI index/repositories metadata so docker load
    cannot introduce additional names. Configs/layers are copied as opaque files.
    """
    expected = {f'trixus-release/{name}:{sha}' for name in SERVICES}
    with tarfile.open(source, 'r:') as archive:
        entries = {}
        for member in archive:
            require(len(entries) < 10000, 'Muitos arquivos no pacote')
            require(member.name not in entries, 'Entrada duplicada no pacote')
            require(member.isfile() or member.isdir(), 'Links/dispositivos no pacote')
            require(not member.name.startswith('/') and '\\' not in member.name
                    and '..' not in member.name.split('/'), 'Caminho invalido no pacote')
            entries[member.name] = member

        def read_json(name):
            require(name in entries and entries[name].isfile()
                    and entries[name].size <= 1024**2, 'Manifesto/config invalido')
            return json.load(archive.extractfile(entries[name]))

        manifest = read_json('manifest.json')
        require(isinstance(manifest, list) and len(manifest) == 3, 'Esperadas tres imagens')
        tags = []
        normalized = []
        copies = {}
        for index, item in enumerate(manifest):
            require(isinstance(item.get('RepoTags'), list) and len(item['RepoTags']) == 1,
                    'Esperada uma tag por imagem')
            tags.extend(item['RepoTags'])
            config = read_json(item['Config'])
            require(config.get('os') == 'linux' and config.get('architecture') == 'amd64',
                    'Arquitetura de imagem invalida')
            require(not config.get('config', {}).get('Volumes'), 'Volumes embutidos nao permitidos')
            layers = item['Layers']
            require(isinstance(layers, list) and 0 < len(layers) <= 200, 'Camadas invalidas')
            mapped = []
            for name in [item['Config'], *layers]:
                require(name in entries and entries[name].isfile(), 'Conteudo ausente')
                if name not in copies:
                    copies[name] = f'content/{len(copies)}'
                mapped.append(copies[name])
            normalized.append({'Config': mapped[0], 'RepoTags': item['RepoTags'], 'Layers': mapped[1:]})
        require(len(tags) == 3 and set(tags) == expected, 'Tags fora da release autorizada')
        with tarfile.open(target, 'w:gz', compresslevel=1) as output:
            payload = json.dumps(normalized).encode()
            info = tarfile.TarInfo('manifest.json')
            info.size = len(payload)
            output.addfile(info, io.BytesIO(payload))
            for original, name in copies.items():
                info = tarfile.TarInfo(name)
                info.size = entries[original].size
                output.addfile(info, archive.extractfile(entries[original]))


def compose_json(config):
    def escape(value, trail=()):
        # Compose already escapes shell dollar signs in command/healthcheck.
        # Resolved environment values, including passwords, need escaping once.
        if trail and (trail[-1] in ('command', 'entrypoint') or trail[-2:] == ('healthcheck', 'test')):
            return value
        if isinstance(value, dict):
            return {key: escape(item, (*trail, key)) for key, item in value.items()}
        if isinstance(value, list):
            return [escape(item, trail) for item in value]
        return value.replace('$', '$$') if isinstance(value, str) else value
    return json.dumps(escape(config))


def compose_file(config, images, path):
    value = copy.deepcopy(config)
    for name in SERVICES:
        service = value['services'][name]
        service.pop('build', None)
        service['image'] = images[name]
        service['pull_policy'] = 'never'
        service['cpus'] = 1.0
        service['mem_limit'] = '768m' if name == 'backend' else '512m'
        service['pids_limit'] = 256
        service['cap_drop'] = ['ALL']
        service['security_opt'] = ['no-new-privileges:true']
        service['logging'] = {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}}
    # config is already interpolated; Compose must not reinterpret secret '$'.
    path.write_text(compose_json(value))
    return ['/usr/bin/docker', 'compose', '--project-directory', str(APP),
            '-p', PROJECT, '-f', str(path), '--profile', 'release']


def shared_health():
    for service in ('apache2', 'mariadb'):
        require(command(['/usr/bin/systemctl', 'is-active', service]) == 'active',
                'Servico compartilhado indisponivel')
    command(['/usr/bin/curl', '--fail', '--silent', '--show-error', '--location',
             '--max-time', '20', '--resolve', 'glpi.flowid.com.br:443:127.0.0.1',
             '--output', '/dev/null', 'https://glpi.flowid.com.br/'])


def healthy_apps():
    for url in ('http://127.0.0.1:3001/api/health', 'http://127.0.0.1:4173/',
                'https://api-nexos.nexxos.tech/api/health', 'https://nexos.nexxos.tech/'):
        command(['/usr/bin/curl', '--fail', '--silent', '--show-error', '--location',
                 '--max-time', '20', '--output', '/dev/null', url])


def inventory():
    trusted_path(COMPOSE)
    trusted_path(ENV)
    trusted_path(STATE)
    require(STORAGE.is_dir() and not STORAGE.is_symlink(), 'Storage invalido')
    config = json.loads(command(BASE + ['config', '--format', 'json']))
    validate_config(config)
    protected = {}
    old = {}
    for name in config['services']:
        if name == 'migrate':
            continue
        container = command(BASE + ['ps', '-q', name])
        require(bool(re.fullmatch('[0-9a-f]{12,64}', container)), 'Container ausente: ' + name)
        data = json.loads(command(['/usr/bin/docker', 'inspect', container]))[0]
        require(data['State']['Running'] and data['Config']['Labels']['com.docker.compose.project'] == PROJECT,
                'Container fora do projeto')
        if name in ('backend', 'frontend'):
            old[name] = data['Image']
        else:
            protected[name] = (container, data['State']['StartedAt'])
    shared_health()
    memory = Path('/proc/meminfo').read_text()
    require(int(re.search(r'MemAvailable:\s+(\d+)', memory)[1]) * 1024 >= GIB,
            'Menos de 1 GiB de memoria disponivel')
    size = int(command(BASE + ['exec', '-T', 'postgres', 'sh', '-c',
               'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT pg_database_size(current_database());"']))
    storage_size = sum(p.lstat().st_size for p in STORAGE.rglob('*') if p.is_file() and not p.is_symlink())
    return config, old, protected, 2 * (size + storage_size) + 256 * 1024**2


def check_protected(protected):
    shared_health()
    for name, (container, started) in protected.items():
        data = json.loads(command(['/usr/bin/docker', 'inspect', container]))[0]
        require(data['State']['Running'] and data['State']['StartedAt'] == started,
                'Servico de infraestrutura mudou: ' + name)


def publish(config, old, protected, sha, release_dir):
    def stage(name):
        (release_dir / 'status.txt').write_text(name + '\n')
        try:
            print(name, flush=True)
        except BrokenPipeError:
            # Completed transfer is sufficient to finish a transaction even
            # when SSH disconnects. Status remains available on the VPS.
            sys.stdout = open(os.devnull, 'w')

    images = {name: f'trixus-release/{name}:{sha}' for name in SERVICES}
    # Preserve old images by their immutable IDs, and save the old deployment.
    (release_dir / 'previous-images.json').write_text(json.dumps(old))
    for name, image in old.items():
        command(['/usr/bin/docker', 'tag', image, f'trixus-previous/{name}:{release_dir.name}'])
    previous = copy.deepcopy(config)
    for name, image in old.items():
        previous['services'][name].pop('build', None)
        previous['services'][name]['image'] = image
    (release_dir / 'previous-compose.json').write_text(compose_json(previous))
    current = compose_file(config, images, release_dir / 'compose.json')
    command(current + ['config', '--quiet'])
    migration_started = False
    stop_attempted = False
    try:
        stage('PARANDO_APENAS_APLICACAO_TRIXUS')
        stop_attempted = True
        command(BASE + ['stop', '-t', '45', 'frontend', 'backend'])
        stage('BACKUP_BANCO_E_ANEXOS')
        dump = release_dir / 'database.dump'
        with dump.open('xb') as output:
            command(BASE + ['exec', '-T', 'postgres', 'sh', '-c',
                    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], output=output, timeout=600)
        require(dump.stat().st_size > 0, 'Backup vazio')
        with dump.open('rb') as source:
            command(BASE + ['exec', '-T', 'postgres', 'pg_restore', '--list'], input_file=source)
        storage = release_dir / 'storage.tar'
        command(['/usr/bin/tar', '--one-file-system', '-cf', str(storage), '-C', str(STORAGE), '.'], timeout=600)
        command(['/usr/bin/tar', '-tf', str(storage)], timeout=600)
        checksums = {}
        for path in (dump, storage):
            with path.open('rb') as source:
                checksums[path.name] = hashlib.file_digest(source, 'sha256').hexdigest()
        (release_dir / 'backup-checksums.json').write_text(json.dumps(checksums))
        check_protected(protected)
        stage('MIGRACAO_INICIADA_SEM_ROLLBACK_AUTOMATICO')
        migration_started = True
        # Fixed command: no seed, reset, db push or remote-provided command.
        command(current + ['run', '--rm', '--no-deps', '--pull', 'never',
                '--name', 'trixus-production-migrate', 'migrate',
                'bun', 'run', 'prisma:migrate:deploy'], timeout=600)
        stage('PUBLICANDO_APLICACAO_TRIXUS')
        command(current + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never',
                '--wait', '--wait-timeout', '180', 'backend', 'frontend'], timeout=240)
        healthy_apps()
        check_protected(protected)
        (STATE / 'current.txt').write_text(str(release_dir) + '\n')
        stage('DEPLOY_OK')
    except Exception:
        if not migration_started and stop_attempted:
            command(BASE + ['start', 'backend', 'frontend'])
            stage('FALHA_ANTES_DA_MIGRACAO_APLICACAO_ANTERIOR_REINICIADA')
        elif migration_started:
            # A failed migration may have partially changed the schema. Do not
            # automatically run old code or restore a database over new writes.
            pending = subprocess.run(['/usr/bin/docker', 'inspect', 'trixus-production-migrate'],
                                     capture_output=True, timeout=30)
            if pending.returncode == 0:
                info = json.loads(pending.stdout)[0]
                if info['Config']['Labels'].get('com.docker.compose.project') == PROJECT:
                    command(['/usr/bin/docker', 'stop', '-t', '30', info['Id']])
            command(current + ['stop', '-t', '30', 'frontend', 'backend'])
            stage('RECUPERACAO_MANUAL_NECESSARIA')
        raise


def main(args):
    import fcntl
    mode, sha, digest, length = parse_request(args)
    require(os.geteuid() == 0, 'Executor exige root')
    os.umask(0o077)
    os.environ.clear()
    os.environ.update(PATH='/usr/sbin:/usr/bin:/sbin:/bin', HOME='/root', LANG='C.UTF-8')
    trusted_path(STATE)
    if mode == 'deploy':
        trusted_path(STATE / 'enabled')
        require((STATE / 'enabled').read_text().strip() == 'approved', 'Deploy desabilitado')
    with (STATE / 'release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(not (STATE / 'recovery-required').exists(), 'Recuperacao anterior pendente')
        config, old, protected, backup_size = inventory()
        require(shutil.disk_usage(STATE).free >= length + MAX_EXPANDED + 2 * GIB,
                'Espaco insuficiente para receber e conferir pacote')
        # No release continues after a broken SSH stream; after complete receive
        # ignore SIGHUP so the transaction finishes even if the client disconnects.
        signal.alarm(900)
        with tempfile.TemporaryDirectory(prefix='incoming-', dir=STATE) as scratch:
            scratch = Path(scratch)
            compressed, raw, clean = (scratch / name for name in ('images.gz', 'raw.tar', 'clean.tar.gz'))
            receive(sys.stdin.buffer, compressed, digest, length)
            signal.alarm(0)
            signal.signal(signal.SIGHUP, signal.SIG_IGN)
            expanded = expand(compressed, raw)
            # Repack compressed, then remove both original copies before loading.
            # Allow a full extra copy even if compression provides no savings.
            require(shutil.disk_usage(STATE).free >= expanded + 2 * GIB,
                    'Espaco insuficiente para conferir pacote; nenhuma parada realizada')
            normalize_archive(raw, clean, sha)
            raw.unlink()
            compressed.unlink()
            docker_root = Path(command(['/usr/bin/docker', 'info', '--format', '{{.DockerRootDir}}']))
            require(shutil.disk_usage(docker_root).free >= 2 * expanded + backup_size + 2 * GIB,
                    'Disco Docker insuficiente para importacao e backup')
            require(shutil.disk_usage(STATE).free >= backup_size + 2 * GIB,
                    'Disco de backup insuficiente')
            if mode == 'plan':
                print(json.dumps({'resultado': 'SIMULACAO_OK_SEM_DEPLOY', 'commit': sha,
                                  'pacote_expandido_bytes': expanded,
                                  'backup_estimado_bytes': backup_size,
                                  'reserva_minima_bytes': 2 * GIB}))
                return
            command(['/usr/bin/nice', '-n', '10', '/usr/bin/ionice', '-c', '2', '-n', '7',
                     '/usr/bin/docker', 'load', '--input', str(clean)], timeout=900)
            clean.unlink()
            config, old, protected, backup_size = inventory()
            require(shutil.disk_usage(STATE).free >= backup_size + 2 * GIB, 'Disco insuficiente para backup')
            release_dir = STATE / 'releases' / (time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + sha)
            release_dir.mkdir(mode=0o700)
            (STATE / 'recovery-required').write_text(str(release_dir) + '\n')
            publish(config, old, protected, sha, release_dir)
            (STATE / 'recovery-required').unlink()


def cli():
    try:
        main(sys.argv[1:])
    except Exception as error:
        # Never echo unexpected exceptions: they can contain parsed credentials.
        message = str(error) if isinstance(error, CheckError) else 'Falha interna; revisar VPS antes de repetir'
        print('RELEASE_BLOQUEADA: ' + message, file=sys.stderr)
        sys.exit(1)
