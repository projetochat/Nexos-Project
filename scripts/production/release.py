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
    # SSH stdin belongs exclusively to receive(). In particular, compose exec
    # forwards stdin by default and could drain the archive during inventory.
    # Only backup verification explicitly receives a separate input file.
    result = subprocess.run(args, stdin=input_file if input_file is not None else subprocess.DEVNULL,
                            stdout=output or subprocess.PIPE,
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


def harden_release_service(service, name):
    service['cpus'] = 1.0
    service['mem_limit'] = '768m' if name == 'backend' else '512m'
    # Do not let application containers consume host swap beyond their RAM
    # budget. This keeps a failing Trixus process from pressuring shared GLPI.
    service['memswap_limit'] = service['mem_limit']
    service['pids_limit'] = 256
    service['cap_drop'] = ['ALL']
    service['security_opt'] = ['no-new-privileges:true']
    service['logging'] = {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}}
    if name == 'backend':
        # The current history importer retains very large provider pages in
        # memory. Keep the worker paused in generated production releases until
        # it is rewritten with bounded pagination and global concurrency.
        service.setdefault('environment', {})['TRIXUS_HISTORY_IMPORT_WORKER_ENABLED'] = 'false'
        # Deferred media can contain large inline payloads. Preserve it in the
        # outbox, but do not replay automatically until memory use is bounded.
        service['environment']['TRIXUS_DEFERRED_REPLAY_WORKER_ENABLED'] = 'false'
    if name == 'frontend':
        # The base Compose historically had no frontend healthcheck. Define one
        # in every generated release so stabilization can distinguish a running
        # process from a frontend that is actually serving the Trixus page.
        service['healthcheck'] = {
            'test': ['CMD', 'bun', '-e',
                     "fetch('http://127.0.0.1:4173/').then(r => { if (!r.ok) process.exit(1) })"],
            'interval': '15s',
            'timeout': '5s',
            'retries': 10,
            'start_period': '20s',
        }


def compose_file(config, images, path):
    value = copy.deepcopy(config)
    for name in SERVICES:
        service = value['services'][name]
        service.pop('build', None)
        service['image'] = images[name]
        service['pull_policy'] = 'never'
        harden_release_service(service, name)
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


def app_container_state(compose):
    state = {}
    for name in ('backend', 'frontend'):
        container = command(compose + ['ps', '-q', name])
        require(bool(re.fullmatch('[0-9a-f]{12,64}', container)),
                'Container da aplicacao ausente: ' + name)
        data = json.loads(command(['/usr/bin/docker', 'inspect', container]))[0]
        health = data['State'].get('Health', {}).get('Status')
        require(data['State']['Running'] and health == 'healthy'
                and data.get('RestartCount') == 0
                and data['Config']['Labels'].get('com.docker.compose.project') == PROJECT,
                'Container da aplicacao instavel: ' + name)
        state[name] = container
    return state


def healthy_apps(compose, stabilization_seconds=30):
    # Public routing is owned by the host configuration and must not be
    # guessed here. Verify the two loopback-only ports declared and validated
    # by validate_config(), including enough response identity to reject a
    # healthy but unrelated process bound to the same port.
    require(isinstance(stabilization_seconds, (int, float)) and stabilization_seconds >= 0,
            'Janela de estabilizacao invalida')

    def check_identity():
        backend = command(['/usr/bin/curl', '--fail', '--silent', '--show-error',
                           '--max-time', '20', 'http://127.0.0.1:3001/api/health'])
        try:
            payload = json.loads(backend)
        except (json.JSONDecodeError, TypeError):
            raise CheckError('Resposta de saude da API Trixus invalida') from None
        require(isinstance(payload, dict) and payload.get('ok') is True
                and payload.get('service') == 'trixus-api'
                and all(payload.get(name) == 'up'
                        for name in ('database', 'redis', 'queue', 'storage')),
                'API local nao confirmou identidade e saude do Trixus')

        frontend = command(['/usr/bin/curl', '--fail', '--silent', '--show-error',
                            '--max-time', '20', 'http://127.0.0.1:4173/'])
        require(bool(re.search(r'<title[^>]*>\s*Trixus\s*</title>', frontend,
                               flags=re.IGNORECASE)),
                'Frontend local nao confirmou identidade do Trixus')

    initial = app_container_state(compose)
    check_identity()
    time.sleep(stabilization_seconds)
    final = app_container_state(compose)
    require(final == initial, 'Containers da aplicacao mudaram durante estabilizacao')
    check_identity()


def retain_release_history(keep=2):
    """Remove only old, unprotected release directories after a confirmed deploy."""
    require(isinstance(keep, int) and keep >= 2, 'Retencao de releases invalida')
    releases = STATE / 'releases'
    require(releases.is_dir() and not releases.is_symlink(), 'Diretorio de releases invalido')

    def marker_target(name):
        marker = STATE / name
        if not marker.exists():
            return None
        value = Path(marker.read_text().strip())
        require(value.parent == releases and value.name, 'Marcador de release invalido: ' + name)
        return value

    protected = {path for path in (marker_target('current.txt'),
                                    marker_target('recovery-required')) if path is not None}
    candidates = []
    for path in releases.iterdir():
        # Never follow or delete a link, file, or nested/unexpected target.
        if (path.is_symlink() or not path.is_dir() or path.parent != releases
                or not re.fullmatch(r'\d{8}T\d{6}Z-[0-9a-f]{40}', path.name)):
            continue
        candidates.append(path)
    candidates.sort(key=lambda path: path.name, reverse=True)
    protected.update(candidates[:keep])

    removed = []
    for path in candidates:
        if path in protected:
            continue
        shutil.rmtree(path)
        sha = path.name.rsplit('-', 1)[1]
        tags = [f'trixus-release/{name}:{sha}' for name in SERVICES]
        tags.extend(f'trixus-previous/{name}:{path.name}' for name in ('backend', 'frontend'))
        # Remove only exact, executor-owned tags. Never prune globally and
        # never force-delete an image that Docker still considers in use.
        subprocess.run(['/usr/bin/docker', 'image', 'rm', *tags],
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=120, check=False)
        removed.append(path.name)
    return removed


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


def publish(config, old, protected, sha, release_dir, recovery_marker):
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
    for name in SERVICES:
        harden_release_service(previous['services'][name], name)
    (release_dir / 'previous-compose.json').write_text(compose_json(previous))
    current = compose_file(config, images, release_dir / 'compose.json')
    command(current + ['config', '--quiet'])

    def migrate_command(container_name, *wrapper_args):
        return current + ['run', '--rm', '--no-deps', '--pull', 'never',
                          '--name', container_name, 'migrate',
                          'bun', 'run', 'prisma:migrate:deploy', *wrapper_args]

    def migration_preflight(container_name):
        output = command(migrate_command(container_name, '--preflight-only'), timeout=600)
        try:
            result = json.loads(output)
        except (TypeError, ValueError) as error:
            raise CheckError('Resposta invalida do preflight de migracao') from error
        require(result.get('code') == 'CONTACT_CUSTOM_FIELD_IDENTITY_PREFLIGHT_OK',
                'Resposta inesperada do preflight de migracao')
        require(isinstance(result.get('reconciliationRequired'), bool),
                'Preflight sem decisao de reconciliacao')
        return result['reconciliationRequired']

    def create_recovery_marker():
        require(not recovery_marker.exists(), 'Recuperacao anterior pendente')
        recovery_marker.write_text(str(release_dir) + '\n')

    def clear_recovery_marker():
        if not recovery_marker.exists():
            return
        require(recovery_marker.read_text().strip() == str(release_dir),
                'Marcador de recuperacao pertence a outra release')
        recovery_marker.unlink()

    def remove_owned_migration_container(name):
        pending = subprocess.run(['/usr/bin/docker', 'inspect', name],
                                 capture_output=True, timeout=30)
        if pending.returncode != 0:
            return
        info = json.loads(pending.stdout)[0]
        labels = info['Config']['Labels']
        require(labels.get('com.docker.compose.project') == PROJECT and
                labels.get('com.docker.compose.service') == 'migrate',
                'Container de migracao inesperado: ' + name)
        if info['State']['Running']:
            command(['/usr/bin/docker', 'stop', '-t', '30', info['Id']])
        else:
            command(['/usr/bin/docker', 'rm', info['Id']])

    migration_started = False
    stop_attempted = False
    try:
        stage('PREFLIGHT_MIGRACAO_SEM_INDISPONIBILIDADE')
        reconciliation_required = migration_preflight('trixus-production-migrate-preflight')
        create_recovery_marker()
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
        stage('REVALIDANDO_MIGRACAO_ANTES_DA_APLICACAO')
        revalidated_reconciliation = migration_preflight('trixus-production-migrate-revalidate')
        require(revalidated_reconciliation == reconciliation_required,
                'Estado de reconciliacao mudou durante a manutencao')
        stage('MIGRACAO_INICIADA_SEM_ROLLBACK_AUTOMATICO')
        migration_started = True
        # Fixed command: no seed, reset, db push or remote-provided command.
        migration_args = ('--apply-reviewed-reconciliation',) if reconciliation_required else ()
        command(migrate_command('trixus-production-migrate', *migration_args), timeout=600)
        stage('PUBLICANDO_APLICACAO_TRIXUS')
        command(current + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never',
                '--wait', '--wait-timeout', '180', 'backend', 'frontend'], timeout=240)
        healthy_apps(current)
        check_protected(protected)
        (STATE / 'current.txt').write_text(str(release_dir) + '\n')
        stage('DEPLOY_OK')
        clear_recovery_marker()
    except Exception:
        if not migration_started and stop_attempted:
            command(BASE + ['start', 'backend', 'frontend'])
            healthy_apps(BASE)
            check_protected(protected)
            try:
                remove_owned_migration_container('trixus-production-migrate-preflight')
                remove_owned_migration_container('trixus-production-migrate-revalidate')
            except Exception:
                stage('APLICACAO_ANTERIOR_SAUDAVEL_LIMPEZA_MANUAL_NECESSARIA')
                raise
            clear_recovery_marker()
            stage('FALHA_ANTES_DA_MIGRACAO_APLICACAO_ANTERIOR_REINICIADA')
        elif not migration_started:
            remove_owned_migration_container('trixus-production-migrate-preflight')
            remove_owned_migration_container('trixus-production-migrate-revalidate')
            clear_recovery_marker()
            stage('PREFLIGHT_REPROVADO_SEM_INDISPONIBILIDADE')
        elif migration_started:
            # A failed migration may have partially changed the schema. Do not
            # automatically run old code or restore a database over new writes.
            command(current + ['stop', '-t', '30', 'frontend', 'backend'])
            stage('RECUPERACAO_MANUAL_NECESSARIA')
            remove_owned_migration_container('trixus-production-migrate')
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
            publish(config, old, protected, sha, release_dir,
                    recovery_marker=STATE / 'recovery-required')
            # Cleanup is deliberately post-commit: never delete recovery data
            # while a deploy or migration is pending. A cleanup failure must
            # not turn an already confirmed deploy into a false rollback case.
            try:
                removed = retain_release_history()
                print(json.dumps({'retencao_releases_removidas': removed}))
            except Exception:
                with (STATE / 'last-error.log').open('ab') as log:
                    log.write(b'Retencao de releases falhou apos DEPLOY_OK; revisar disco.\n')
                print('AVISO_RETENCAO: deploy confirmado; revisar releases antigas na VPS',
                      file=sys.stderr)


def cli():
    try:
        main(sys.argv[1:])
    except Exception as error:
        # Never echo unexpected exceptions: they can contain parsed credentials.
        message = str(error) if isinstance(error, CheckError) else 'Falha interna; revisar VPS antes de repetir'
        print('RELEASE_BLOQUEADA: ' + message, file=sys.stderr)
        sys.exit(1)
