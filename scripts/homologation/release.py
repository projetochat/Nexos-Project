#!/usr/bin/python3
"""Root-owned, HML-only release runner.

The runner accepts only an immutable three-image archive. Paths, project names,
URLs and operations are fixed here so a HML release cannot target production.
"""
import copy
import gzip
import hashlib
import io
import json
import os
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path
from urllib.parse import unquote, urlparse


APP = Path("/opt/trixus-hml/app")
ENV = APP / ".env.vps"
COMPOSE = APP / "docker-compose.vps.yml"
STORAGE = Path("/srv/trixus-hml-data")
STATE = Path("/var/lib/trixus-hml-release")
PROJECT = "trixus-hml"

PUBLIC_FRONTEND = "https://hom.trixus.com.br"
PUBLIC_BACKEND = "https://api-hom.trixus.com.br"
WEBHOOK_URL = PUBLIC_BACKEND + "/api/webhooks/evolution"
WEBHOOK_EVENTS = {
    "MESSAGES_UPSERT", "MESSAGES_EDITED", "MESSAGES_UPDATE",
    "MESSAGES_DELETE", "SEND_MESSAGE_UPDATE", "QRCODE_UPDATED",
    "CONNECTION_UPDATE",
}

SERVICES = ("backend", "migrate", "frontend")
INFRASTRUCTURE = ("postgres", "redis", "evolution-postgres", "evolution-redis")
APPLICATION = ("backend", "frontend")
GIB = 1024**3
MAX_ARCHIVE = 2 * GIB
MAX_EXPANDED = 5 * GIB
BASE = [
    "/usr/bin/docker", "compose", "--project-name", PROJECT,
    "--project-directory", str(APP),
    "--env-file", str(ENV), "-f", str(COMPOSE), "--profile", "release",
]


class CheckError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise CheckError(message)


def command(args, *, output=None, input_file=None, timeout=120):
    result = subprocess.run(
        args,
        stdin=input_file if input_file is not None else subprocess.DEVNULL,
        stdout=output or subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )
    if result.returncode:
        with (STATE / "last-error.log").open("ab") as log:
            log.write(result.stderr + b"\n" + (result.stdout or b"") + b"\n")
    require(result.returncode == 0, "Etapa falhou; consultar registro privado da HML")
    return (result.stdout or b"").decode(errors="replace").strip()


def parse_request(args):
    require(len(args) == 4, "Requisicao invalida")
    mode, sha, digest, length = args
    require(mode in ("plan", "deploy"), "Operacao invalida")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", sha)), "Commit invalido")
    require(bool(re.fullmatch(r"[0-9a-f]{64}", digest)), "Checksum invalido")
    require(bool(re.fullmatch(r"[0-9]{1,10}", length)), "Tamanho invalido")
    require(0 < int(length) <= MAX_ARCHIVE, "Pacote excede 2 GiB")
    return mode, sha, digest, int(length)


def receive(source, target, digest, length):
    hasher = hashlib.sha256()
    remaining = length
    with target.open("xb") as stream:
        while remaining:
            block = source.read(min(1024**2, remaining))
            require(bool(block), "Transferencia incompleta")
            stream.write(block)
            hasher.update(block)
            remaining -= len(block)
        require(not source.read(1), "Dados adicionais na transferencia")
    require(hasher.hexdigest() == digest, "Checksum divergente")


def expand(source, target):
    total = 0
    with gzip.open(source, "rb") as compressed, target.open("xb") as raw:
        while block := compressed.read(1024**2):
            total += len(block)
            require(total <= MAX_EXPANDED, "Pacote expandido excede 5 GiB")
            require(shutil.disk_usage(target.parent).free >= 2 * GIB + len(block),
                    "Reserva de disco insuficiente")
            raw.write(block)
    return total


def normalize_archive(source, target, sha):
    """Rebuild a Docker archive containing only the three HML tags."""
    expected = {f"trixus-hml-release/{name}:{sha}" for name in SERVICES}
    with tarfile.open(source, "r:") as archive:
        entries = {}
        for member in archive:
            require(len(entries) < 10000, "Muitos arquivos no pacote")
            require(member.name not in entries, "Entrada duplicada no pacote")
            require(member.isfile() or member.isdir(), "Links/dispositivos no pacote")
            require(not member.name.startswith("/") and "\\" not in member.name
                    and ".." not in member.name.split("/"), "Caminho invalido no pacote")
            entries[member.name] = member

        def read_json(name):
            require(name in entries and entries[name].isfile() and entries[name].size <= 1024**2,
                    "Manifesto/config invalido")
            return json.load(archive.extractfile(entries[name]))

        manifest = read_json("manifest.json")
        require(isinstance(manifest, list) and len(manifest) == 3, "Esperadas tres imagens")
        tags, normalized, copies = [], [], {}
        for item in manifest:
            require(isinstance(item.get("RepoTags"), list) and len(item["RepoTags"]) == 1,
                    "Esperada uma tag por imagem")
            tags.extend(item["RepoTags"])
            config = read_json(item["Config"])
            require(config.get("os") == "linux" and config.get("architecture") == "amd64",
                    "Arquitetura de imagem invalida")
            require(not config.get("config", {}).get("Volumes"), "Volumes embutidos proibidos")
            layers = item.get("Layers")
            require(isinstance(layers, list) and 0 < len(layers) <= 200, "Camadas invalidas")
            mapped = []
            for name in [item["Config"], *layers]:
                require(name in entries and entries[name].isfile(), "Conteudo ausente")
                if name not in copies:
                    copies[name] = f"content/{len(copies)}"
                mapped.append(copies[name])
            normalized.append({"Config": mapped[0], "RepoTags": item["RepoTags"],
                               "Layers": mapped[1:]})
        require(len(tags) == 3 and set(tags) == expected, "Tags fora da HML autorizada")
        with tarfile.open(target, "w:gz", compresslevel=1) as clean:
            payload = json.dumps(normalized).encode()
            info = tarfile.TarInfo("manifest.json")
            info.size = len(payload)
            clean.addfile(info, io.BytesIO(payload))
            for original, name in copies.items():
                info = tarfile.TarInfo(name)
                info.size = entries[original].size
                clean.addfile(info, archive.extractfile(entries[original]))


def trusted_path(path):
    for entry in (path, *path.parents):
        info = entry.lstat()
        require(not stat.S_ISLNK(info.st_mode), "Link simbolico inesperado")
        require(info.st_uid == 0 and not info.st_mode & 0o022, "Caminho sem protecao root")


def compose_json(config):
    def escape(value, trail=()):
        literal = trail and (trail[-1] in ("command", "entrypoint")
                             or trail[-2:] == ("healthcheck", "test"))
        if literal and isinstance(value, str):
            # `docker compose config` emits literal container-side dollars as
            # `$$`. A second Compose pass must preserve that pair. A single
            # dollar would be re-interpolated with the runner's intentionally
            # empty environment and corrupt recovery config.
            require(not re.search(r"(?<!\$)\$(?!\$)", value),
                    "Dollar nao escapado em command/entrypoint/healthcheck")
            return value
        if isinstance(value, dict):
            return {key: escape(item, (*trail, key)) for key, item in value.items()}
        if isinstance(value, list):
            return [escape(item, trail) for item in value]
        return value.replace("$", "$$") if isinstance(value, str) else value
    return json.dumps(escape(config))


def _published_port(service, target):
    ports = service.get("ports", [])
    candidates = [item for item in ports if str(item.get("target")) == str(target)]
    require(len(candidates) == 1 and candidates[0].get("host_ip") == "127.0.0.1",
            "Porta da HML deve permanecer somente em loopback")
    published = str(candidates[0].get("published", ""))
    require(bool(re.fullmatch(r"[0-9]{2,5}", published)) and int(published) <= 65535,
            "Porta publicada invalida")
    return published


def validate_config(config):
    require(config.get("name") == PROJECT, "Projeto Compose nao e homologacao")
    services = config.get("services", {})
    required = (*SERVICES, *INFRASTRUCTURE, "evolution-api")
    require(all(name in services for name in required), "Servicos obrigatorios ausentes")
    database = services["postgres"]["environment"]
    backend_env = services["backend"]["environment"]
    migration_url = services["migrate"]["environment"]["DATABASE_URL"]
    require(backend_env.get("DATABASE_URL") == migration_url,
            "Backend e migration apontam para bancos diferentes")
    url = urlparse(migration_url)
    require(url.scheme in ("postgres", "postgresql") and url.hostname == "postgres"
            and url.port in (None, 5432), "Banco principal externo ao projeto HML")
    require(unquote(url.path.lstrip("/")) == database["POSTGRES_DB"], "Database divergente")
    require(unquote(url.username or "") == database["POSTGRES_USER"], "Usuario divergente")
    require(unquote(url.password or "") == database["POSTGRES_PASSWORD"], "Senha divergente")
    require(backend_env.get("EVOLUTION_WEBHOOK_PUBLIC_URL") == WEBHOOK_URL,
            "Webhook HML deve usar api-hom.trixus.com.br")
    evolution_base = urlparse(backend_env.get("EVOLUTION_BASE_URL", ""))
    require(evolution_base.scheme == "http" and evolution_base.hostname == "evolution-api"
            and evolution_base.port == 8080, "Evolution deve permanecer na rede interna HML")
    require(str(backend_env.get("TRIXUS_HISTORY_IMPORT_WORKER_ENABLED", "false")).lower() == "false",
            "Importacao historica deve permanecer desativada")
    require(str(backend_env.get("TRIXUS_DEFERRED_REPLAY_WORKER_ENABLED", "false")).lower() == "false",
            "Replay diferido deve permanecer desativado")
    for name in SERVICES:
        item = services[name]
        require(not item.get("privileged") and item.get("network_mode") != "host"
                and item.get("pid") != "host" and not item.get("devices")
                and not item.get("cap_add"), "Privilegio inesperado: " + name)
    mounts = services["backend"].get("volumes", [])
    require(len(mounts) == 1 and mounts[0].get("type") == "bind"
            and mounts[0].get("source") == STORAGE.as_posix()
            and mounts[0].get("target") == "/var/lib/trixus/storage",
            "Storage da HML divergente")
    require(not services["migrate"].get("ports"), "Migration nao pode publicar porta")
    ports = {
        "backend": _published_port(services["backend"], 3001),
        "frontend": _published_port(services["frontend"], 4173),
        "evolution": _published_port(services["evolution-api"], 8080),
    }
    require(len(set(ports.values())) == 3, "Portas HML repetidas")
    require(ports["backend"] != "3001" and ports["frontend"] != "4173"
            and ports["evolution"] != "8080", "HML nao pode usar portas publicadas da producao")
    return {"backend": ports["backend"], "frontend": ports["frontend"]}


def harden_release_service(service, name):
    service["cpus"] = 1.0
    service["mem_limit"] = "768m" if name == "backend" else "512m"
    service["memswap_limit"] = service["mem_limit"]
    service["pids_limit"] = 256
    service["cap_drop"] = ["ALL"]
    service["security_opt"] = ["no-new-privileges:true"]
    service["logging"] = {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}
    if name == "frontend":
        service["healthcheck"] = {
            "test": ["CMD", "bun", "-e",
                     "fetch('http://127.0.0.1:4173/').then(r => { if (!r.ok) process.exit(1) })"],
            "interval": "15s", "timeout": "5s", "retries": 10, "start_period": "20s",
        }


def compose_file(config, images, path):
    value = copy.deepcopy(config)
    for name in SERVICES:
        service = value["services"][name]
        service.pop("build", None)
        service["image"] = images[name]
        service["pull_policy"] = "never"
        harden_release_service(service, name)
    path.write_text(compose_json(value))
    return ["/usr/bin/docker", "compose", "--project-directory", str(APP),
            "-p", PROJECT, "-f", str(path), "--profile", "release"]


def _container(compose, service):
    value = command(compose + ["ps", "-q", service])
    require(bool(re.fullmatch(r"[0-9a-f]{12,64}", value)), "Container ausente: " + service)
    return value


def _inspect(container):
    return json.loads(command(["/usr/bin/docker", "inspect", container]))[0]


def shared_health():
    for service in ("apache2", "mariadb"):
        require(command(["/usr/bin/systemctl", "is-active", service]) == "active",
                "Servico compartilhado inativo")
    for url in ("https://app.trixus.com.br/", "https://api.trixus.com.br/api/health",
                "https://glpi.flowid.com.br/"):
        command(["/usr/bin/curl", "--fail", "--silent", "--show-error", "--location",
                 "--max-time", "20", "--output", "/dev/null", url])


def production_fingerprint():
    names = ("trixus-vps-backend-1", "trixus-vps-frontend-1", "trixus-vps-postgres-1",
             "trixus-vps-evolution-api-1", "trixus-vps-evolution-postgres-1",
             "trixus-vps-redis-1", "trixus-vps-evolution-redis-1")
    result = {}
    for name in names:
        data = _inspect(name)
        require(data["State"]["Running"], "Container de producao indisponivel")
        result[name] = (data["Id"], data["Image"], data["State"]["StartedAt"])
    shared_health()
    return result


def inventory():
    trusted_path(COMPOSE)
    trusted_path(ENV)
    trusted_path(STATE)
    require(STORAGE.is_dir() and not STORAGE.is_symlink(), "Storage HML invalido")
    config = json.loads(command(BASE + ["config", "--format", "json"]))
    ports = validate_config(config)
    apps, protected = {}, {}
    for name in (*APPLICATION, *INFRASTRUCTURE, "evolution-api"):
        container = _container(BASE, name)
        data = _inspect(container)
        require(data["State"]["Running"]
                and data["Config"]["Labels"].get("com.docker.compose.project") == PROJECT,
                "Container fora da HML: " + name)
        item = (container, data["Image"], data["State"]["StartedAt"])
        (apps if name in APPLICATION or name == "evolution-api" else protected)[name] = item
    main_size = int(command(BASE + ["exec", "-T", "postgres", "sh", "-c",
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT pg_database_size(current_database());"']))
    evo_size = int(command(BASE + ["exec", "-T", "evolution-postgres", "sh", "-c",
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT pg_database_size(current_database());"']))
    storage_size = sum(item.lstat().st_size for item in STORAGE.rglob("*")
                       if item.is_file() and not item.is_symlink())

    def mounted_size(container, destination):
        data = _inspect(container)
        mounts = [item for item in data.get("Mounts", []) if item.get("Destination") == destination]
        require(len(mounts) == 1, "Montagem HML inesperada: " + destination)
        source = Path(mounts[0]["Source"])
        require(source.is_dir() and not source.is_symlink(), "Volume HML invalido")
        return sum(item.lstat().st_size for item in source.rglob("*")
                   if item.is_file() and not item.is_symlink())

    redis_size = mounted_size(protected["redis"][0], "/data")
    evo_redis_size = mounted_size(protected["evolution-redis"][0], "/data")
    instances_size = mounted_size(apps["evolution-api"][0], "/evolution/instances")
    total = main_size + evo_size + storage_size + redis_size + evo_redis_size + instances_size
    return config, ports, apps, protected, 2 * total + GIB


def check_protected(protected):
    for name, (container, image, started) in protected.items():
        data = _inspect(container)
        require(data["State"]["Running"] and data["Image"] == image
                and data["State"]["StartedAt"] == started, "Infraestrutura HML mudou: " + name)


def migration_preflight(compose, name):
    output = command(compose + ["run", "--rm", "--no-deps", "--pull", "never",
        "--name", name, "migrate", "bun", "run", "prisma:migrate:deploy", "--preflight-only"],
        timeout=600)
    try:
        result = json.loads(output)
    except (TypeError, ValueError) as error:
        raise CheckError("Resposta invalida do preflight") from error
    require(result.get("code") == "CONTACT_CUSTOM_FIELD_IDENTITY_PREFLIGHT_OK"
            and isinstance(result.get("reconciliationRequired"), bool),
            "Preflight de migration inesperado")
    return result["reconciliationRequired"]


def _dump(compose, service, target):
    with target.open("xb") as output:
        command(compose + ["exec", "-T", service, "sh", "-c",
            'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], output=output, timeout=600)
    require(target.stat().st_size > 0, "Backup vazio: " + service)
    with target.open("rb") as source:
        command(compose + ["exec", "-T", service, "pg_restore", "--list"],
                input_file=source, timeout=300)


def _container_archive(container, source, target):
    with target.open("xb") as output:
        command(["/usr/bin/docker", "cp", f"{container}:{source}/.", "-"],
                output=output, timeout=600)
    require(target.stat().st_size > 0, "Arquivo de container vazio")
    command(["/usr/bin/tar", "-tf", str(target)], timeout=300)


def _verify_dump_restore_once(image, dump, schema, prefix):
    name = prefix + "-postgres"
    restore_password = secrets.token_urlsafe(24)
    check = subprocess.run(["/usr/bin/docker", "inspect", name], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=30)
    require(check.returncode != 0, "Container descartavel ja existe")
    try:
        command(["/usr/bin/docker", "run", "--detach", "--rm", "--pull", "never",
                 "--network", "none", "--name", name, "--cpus", "1",
                 "--memory", "512m", "--memory-swap", "512m", "--pids-limit", "256",
                 "--label", "io.trixus.purpose=hml-backup-restore",
                 "--env", f"POSTGRES_PASSWORD={restore_password}",
                 "--env", "POSTGRES_DB=restored", image], timeout=120)
        for _ in range(60):
            ready = subprocess.run(["/usr/bin/docker", "exec", name, "pg_isready",
                                    "-U", "postgres", "-d", "restored"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   timeout=10)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise CheckError("Postgres descartavel nao iniciou")
        command(["/usr/bin/docker", "cp", str(dump), f"{name}:/tmp/backup.dump"], timeout=300)
        command(["/usr/bin/docker", "exec", name, "pg_restore", "--exit-on-error", "--no-owner",
                 "-U", "postgres", "-d", "restored", "/tmp/backup.dump"], timeout=600)
        table = f'{schema}."_prisma_migrations"'
        count = command(["/usr/bin/docker", "exec", name, "psql", "-X", "-At",
                         "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "restored",
                         "-c", f"SELECT count(*) FROM {table};"])
        require(count.isdigit() and int(count) > 0, "Restauracao descartavel sem migrations")
    finally:
        subprocess.run(["/usr/bin/docker", "rm", "-f", name], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=60, check=False)


def _verify_dump_restore(image, dump, schema, prefix):
    for attempt in range(1, 4):
        try:
            _verify_dump_restore_once(image, dump, schema, prefix)
            return
        except CheckError:
            if attempt == 3:
                raise
            print(f"HML_REPETINDO_RESTAURACAO_DESCARTAVEL tentativa={attempt + 1}",
                  flush=True)
            time.sleep(2)


def _safe_extract(archive, folder):
    with tarfile.open(archive, "r:") as stream:
        members = stream.getmembers()
        require(bool(members), "Arquivo tar vazio")
        for member in members:
            require(member.isfile() or member.isdir(), "Link/dispositivo em backup")
            require(not member.name.startswith("/") and "\\" not in member.name
                    and ".." not in member.name.split("/"), "Caminho invalido em backup")
    command(["/usr/bin/tar", "-xf", str(archive), "-C", str(folder)], timeout=600)


def _stable_redis_signature(output):
    """Compare only persistent keys; expiring keys may vanish during restore checks."""
    result = []
    for line in output.splitlines():
        if not line.startswith("db"):
            continue
        match = re.fullmatch(r"(db\d+):keys=(\d+),expires=(\d+)(?:,.*)?", line.strip())
        require(match is not None, "Fingerprint Redis invalido")
        keys = int(match.group(2))
        expires = int(match.group(3))
        require(expires <= keys, "Fingerprint Redis invalido")
        persistent = keys - expires
        if persistent:
            result.append((match.group(1), persistent))
    return sorted(result)


def _redis_signature(compose, service):
    output = command(compose + ["exec", "-T", service, "redis-cli", "--raw", "INFO", "keyspace"])
    return _stable_redis_signature(output)


def _verify_redis_restore(image, archive, expected, prefix):
    name = prefix + "-redis"
    check = subprocess.run(["/usr/bin/docker", "inspect", name], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=30)
    require(check.returncode != 0, "Redis descartavel ja existe")
    with tempfile.TemporaryDirectory(prefix="redis-restore-", dir=STATE) as folder:
        folder = Path(folder)
        _safe_extract(archive, folder)
        try:
            command(["/usr/bin/docker", "run", "--detach", "--rm", "--pull", "never",
                     "--network", "none", "--name", name, "--user", "0:0", "--cpus", "1",
                     "--memory", "512m", "--memory-swap", "512m", "--pids-limit", "256",
                     "--label", "io.trixus.purpose=hml-backup-restore",
                     "--volume", f"{folder}:/data", image,
                     "redis-server", "--appendonly", "yes"], timeout=120)
            for _ in range(60):
                ping = subprocess.run(["/usr/bin/docker", "exec", name, "redis-cli", "ping"],
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
                if ping.returncode == 0 and ping.stdout.strip() == b"PONG":
                    break
                time.sleep(1)
            else:
                raise CheckError("Redis descartavel nao iniciou")
            output = command(["/usr/bin/docker", "exec", name, "redis-cli", "--raw",
                              "INFO", "keyspace"])
            actual = _stable_redis_signature(output)
            require(actual == expected, "Fingerprint Redis restaurado divergente")
        finally:
            subprocess.run(["/usr/bin/docker", "rm", "-f", name], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=60, check=False)


def backup_state(compose, config, apps, release_dir):
    print("HML_BACKUP_BANCOS", flush=True)
    main_dump = release_dir / "trixus-database.dump"
    evo_dump = release_dir / "evolution-database.dump"
    _dump(compose, "postgres", main_dump)
    _dump(compose, "evolution-postgres", evo_dump)
    print("HML_BACKUP_REDIS", flush=True)
    for service in ("redis", "evolution-redis"):
        require(command(compose + ["exec", "-T", service, "redis-cli", "SAVE"]) == "OK",
                "Redis nao confirmou snapshot")
    main_redis = release_dir / "trixus-redis-data.tar"
    evo_redis = release_dir / "evolution-redis-data.tar"
    instances = release_dir / "evolution-instances.tar"
    main_redis_signature = _redis_signature(compose, "redis")
    evo_redis_signature = _redis_signature(compose, "evolution-redis")
    _container_archive(_container(compose, "redis"), "/data", main_redis)
    _container_archive(_container(compose, "evolution-redis"), "/data", evo_redis)
    print("HML_BACKUP_STORAGES", flush=True)
    _container_archive(apps["evolution-api"][0], "/evolution/instances", instances)
    storage = release_dir / "trixus-storage.tar"
    command(["/usr/bin/tar", "--one-file-system", "-cf", str(storage), "-C", str(STORAGE), "."],
            timeout=600)
    command(["/usr/bin/tar", "-tf", str(storage)], timeout=300)
    restore_prefix = "trixus-hml-restore-" + release_dir.name[:15].lower()
    print("HML_VALIDANDO_RESTAURACAO_BANCO_PRINCIPAL", flush=True)
    _verify_dump_restore(config["services"]["postgres"]["image"], main_dump,
                         "public", restore_prefix + "-main")
    print("HML_VALIDANDO_RESTAURACAO_EVOLUTION", flush=True)
    _verify_dump_restore(config["services"]["evolution-postgres"]["image"], evo_dump,
                         "evolution_api", restore_prefix + "-evo")
    print("HML_VALIDANDO_RESTAURACAO_REDIS_PRINCIPAL", flush=True)
    _verify_redis_restore(config["services"]["redis"]["image"], main_redis,
                          main_redis_signature, restore_prefix + "-main")
    print("HML_VALIDANDO_RESTAURACAO_REDIS_EVOLUTION", flush=True)
    _verify_redis_restore(config["services"]["evolution-redis"]["image"], evo_redis,
                          evo_redis_signature, restore_prefix + "-evo")
    print("HML_VALIDANDO_RESTAURACAO_STORAGES", flush=True)
    with tempfile.TemporaryDirectory(prefix="tar-restore-", dir=STATE) as folder:
        _safe_extract(storage, Path(folder))
    with tempfile.TemporaryDirectory(prefix="tar-restore-", dir=STATE) as folder:
        _safe_extract(instances, Path(folder))
    checksums = {}
    for path in (*release_dir.glob("*.dump"), *release_dir.glob("*.tar")):
        with path.open("rb") as stream:
            checksums[path.name] = hashlib.file_digest(stream, "sha256").hexdigest()
    (release_dir / "backup-checksums.json").write_text(json.dumps(checksums, sort_keys=True))


def _webhook_audit_is_valid(result):
    expected = sorted(WEBHOOK_EVENTS)
    return (
        isinstance(result, dict)
        and result.get("ok") is True
        and result.get("enabled") is True
        and result.get("urlCorrect") is True
        and result.get("eventsCorrect") is True
        and result.get("eventCount") == len(expected)
        and result.get("events") == expected
        and result.get("byEventsDisabled") is True
        and result.get("base64Disabled") is True
        and result.get("secretBackendConfigured") is True
        and result.get("secretEvolutionConfigured") is True
        and result.get("secretMatch") is True
        and result.get("headerJwtKeyPresent") is True
    )


def configure_webhooks(compose):
    instances = command(compose + ["exec", "-T", "evolution-postgres", "sh", "-c",
        'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" '
        "-c 'SELECT \"name\" FROM evolution_api.\"Instance\" ORDER BY \"name\";'"], timeout=120)
    names = [line for line in instances.splitlines() if line]
    for index, name in enumerate(names):
        require("\n" not in name and len(name) <= 200, "Nome de instancia invalido")
        output = None
        for attempt in range(1, 6):
            try:
                output = command(compose + ["run", "--rm", "--no-deps", "--pull", "never",
                    "--name", f"trixus-hml-webhook-{index}-{attempt}", "migrate", "bun",
                    "scripts/audit-evolution-webhook.mjs", "--ensure", f"--instance={name}"],
                    timeout=180)
                break
            except CheckError:
                if attempt == 5:
                    raise
                time.sleep(3)
        require(output is not None, "Evolution HML nao ficou pronta")
        try:
            result = json.loads(output)
        except (TypeError, ValueError) as error:
            raise CheckError("Auditoria de webhook invalida") from error
        require(_webhook_audit_is_valid(result), "Webhook HML nao foi certificado")
        verification = command(compose + ["run", "--rm", "--no-deps", "--pull", "never",
            "--name", f"trixus-hml-webhook-verify-{index}",
            "-e", f"EVOLUTION_INSTANCE_NAME={name}", "migrate", "bun", "-e", r"""
const base=(process.env.EVOLUTION_BASE_URL||'').replace(/\/$/,'');
const key=(process.env.EVOLUTION_API_KEY||'').trim();
const expectedUrl='https://api-hom.trixus.com.br/api/webhooks/evolution';
const expected=['CONNECTION_UPDATE','MESSAGES_DELETE','MESSAGES_EDITED','MESSAGES_UPDATE','MESSAGES_UPSERT','QRCODE_UPDATED','SEND_MESSAGE_UPDATE'];
const instance=process.env.EVOLUTION_INSTANCE_NAME;
const response=await fetch(`${base}/webhook/find/${encodeURIComponent(instance)}`,{headers:{apikey:key}});
if(!response.ok) process.exit(2);
const value=await response.json();
const events=[...(value.events||[])].sort();
const secret=(process.env.EVOLUTION_WEBHOOK_SECRET||'').trim().replace(/^(['\"])(.*)\1$/,'$2').trim();
const actual=(value.headers?.jwt_key||'').trim().replace(/^(['\"])(.*)\1$/,'$2').trim();
const byEvents=value.byEvents ?? value.webhookByEvents;
const base64=value.base64 ?? value.webhookBase64;
const audit={
  enabled:value.enabled===true,
  urlCorrect:value.url===expectedUrl,
  eventsCorrect:JSON.stringify(events)===JSON.stringify(expected),
  eventCount:events.length,
  events,
  byEventsDisabled:byEvents===false,
  base64Disabled:base64===false,
  secretBackendConfigured:!!secret,
  secretEvolutionConfigured:!!actual,
  secretMatch:!!secret && !!actual && actual===secret,
  headerJwtKeyPresent:!!actual,
};
audit.ok=audit.enabled && audit.urlCorrect && audit.eventsCorrect &&
  audit.eventCount===expected.length && audit.byEventsDisabled && audit.base64Disabled &&
  audit.secretBackendConfigured && audit.secretEvolutionConfigured &&
  audit.secretMatch && audit.headerJwtKeyPresent;
console.log(JSON.stringify(audit));
if(!audit.ok) process.exit(3);
"""], timeout=180)
        try:
            verified = json.loads(verification)
        except (TypeError, ValueError) as error:
            raise CheckError("Resposta final do webhook invalida") from error
        require(_webhook_audit_is_valid(verified), "Eventos do webhook HML divergentes")
    return len(names)


def evolution_health(compose, expected_instances):
    container = _container(compose, "evolution-api")
    data = _inspect(container)
    require(data["State"]["Running"] and data.get("RestartCount") == 0,
            "Evolution HML instavel")
    output = None
    for attempt in range(1, 11):
        try:
            output = command(compose + ["run", "--rm", "--no-deps", "--pull", "never",
                "--name", f"trixus-hml-evolution-health-{attempt}", "migrate", "bun", "-e", r"""
const base=(process.env.EVOLUTION_BASE_URL||'').replace(/\/$/,'');
const key=(process.env.EVOLUTION_API_KEY||'').trim();
const response=await fetch(`${base}/instance/fetchInstances`,{headers:{apikey:key}});
if(!response.ok) process.exit(2);
const value=await response.json();
const items=Array.isArray(value)?value:(value?.value||[]);
console.log(JSON.stringify({ok:true,instances:items.length}));
"""], timeout=120)
            break
        except CheckError:
            if attempt == 10:
                raise
            time.sleep(3)
    try:
        result = json.loads(output)
    except (TypeError, ValueError) as error:
        raise CheckError("Saude da Evolution retornou resposta invalida") from error
    require(result == {"ok": True, "instances": expected_instances},
            "Inventario da Evolution diverge do banco")


def healthy_apps(compose, ports, stabilization=30, require_healthcheck=True):
    identities = {}
    for name in APPLICATION:
        container = _container(compose, name)
        data = _inspect(container)
        health = data["State"].get("Health", {}).get("Status")
        require(data["State"]["Running"] and data.get("RestartCount") == 0
                and (health == "healthy" or (not require_healthcheck and health is None)),
                "Aplicacao HML instavel: " + name)
        identities[name] = container
    backend = command(["/usr/bin/curl", "--fail", "--silent", "--show-error", "--max-time", "20",
                       f"http://127.0.0.1:{ports['backend']}/api/health/ready"])
    payload = json.loads(backend)
    require(payload.get("ok") is True and payload.get("service") == "trixus-api",
            "API HML nao confirmou identidade")
    frontend = command(["/usr/bin/curl", "--fail", "--silent", "--show-error", "--max-time", "20",
                        f"http://127.0.0.1:{ports['frontend']}/"])
    require(bool(re.search(r"<title[^>]*>\s*Trixus(?:\s*\|\s*App)?\s*</title>", frontend, re.I)),
            "Frontend HML nao confirmou identidade")
    if stabilization:
        time.sleep(stabilization)
        for name, identity in identities.items():
            require(_container(compose, name) == identity,
                    "Container HML mudou durante estabilizacao: " + name)
            data = _inspect(identity)
            health = data["State"].get("Health", {}).get("Status")
            require(data["State"]["Running"] and data.get("RestartCount") == 0
                    and (health == "healthy" or (not require_healthcheck and health is None)),
                    "Aplicacao HML degradou durante estabilizacao: " + name)


def public_hml_health():
    for url in (PUBLIC_FRONTEND + "/", PUBLIC_BACKEND + "/api/health"):
        command(["/usr/bin/curl", "--fail", "--silent", "--show-error", "--location",
                 "--max-time", "20", "--output", "/dev/null", url])
    status = command(["/usr/bin/curl", "--silent", "--show-error", "--max-time", "20",
                      "--request", "POST", "--header", "Content-Type: application/json",
                      "--data", "{}", "--output", "/dev/null", "--write-out", "%{http_code}",
                      WEBHOOK_URL])
    require(status == "401", "Webhook HML sem segredo nao foi rejeitado")


def publish(config, ports, apps, protected, production_before, sha, release_dir):
    images = {name: f"trixus-hml-release/{name}:{sha}" for name in SERVICES}
    old = {name: apps[name][1] for name in APPLICATION}
    (release_dir / "previous-images.json").write_text(json.dumps(old))
    previous = copy.deepcopy(config)
    for name, image in old.items():
        previous["services"][name].pop("build", None)
        previous["services"][name]["image"] = image
    (release_dir / "previous-compose.json").write_text(compose_json(previous))
    current = compose_file(config, images, release_dir / "compose.json")
    command(current + ["config", "--quiet"])

    marker = STATE / "recovery-required"
    migration_started = False
    writers_stop_attempted = False

    def stage(value):
        (release_dir / "status.txt").write_text(value + "\n")
        print(value, flush=True)

    try:
        stage("HML_PREFLIGHT_SEM_INDISPONIBILIDADE")
        reconciliation = migration_preflight(current, "trixus-hml-migrate-preflight")
        require(not marker.exists(), "Recuperacao HML anterior pendente")
        marker.write_text(str(release_dir) + "\n")
        stage("HML_PARANDO_APENAS_ESCRITORES")
        writers_stop_attempted = True
        for name in ("frontend", "backend", "evolution-api"):
            command(["/usr/bin/docker", "stop", "-t", "45", apps[name][0]])
        stage("HML_BACKUP_COMPLETO")
        backup_state(BASE, config, apps, release_dir)
        stage("HML_REVALIDANDO_MIGRACAO")
        require(migration_preflight(current, "trixus-hml-migrate-revalidate") == reconciliation,
                "Estado do preflight mudou durante backup")
        check_protected(protected)
        require(production_fingerprint() == production_before, "Producao ou GLPI mudou")
        stage("HML_MIGRACAO_INICIADA_SEM_ROLLBACK_AUTOMATICO")
        migration_started = True
        migration_args = ["--apply-reviewed-reconciliation"] if reconciliation else []
        command(current + ["run", "--rm", "--no-deps", "--pull", "never",
            "--name", "trixus-hml-migrate", "migrate", "bun", "run",
            "prisma:migrate:deploy", *migration_args], timeout=600)
        stage("HML_PUBLICANDO_SOMENTE_APLICACAO")
        command(current + ["up", "-d", "--no-deps", "--no-build", "--pull", "never",
                         "--wait", "--wait-timeout", "180", "backend", "frontend"], timeout=240)
        healthy_apps(current, ports)
        # Keep Evolution stopped until the new backend is ready. Otherwise an
        # inbound event can arrive while both replay mechanisms are disabled.
        command(["/usr/bin/docker", "start", apps["evolution-api"][0]])
        evolution_rows = command(current + ["exec", "-T", "evolution-postgres", "sh", "-c",
            'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" '
            "-c 'SELECT count(*) FROM evolution_api.\"Instance\";'"], timeout=120)
        require(evolution_rows.isdigit(), "Inventario da Evolution invalido")
        evolution_health(current, int(evolution_rows))
        stage("HML_CONFIGURANDO_WEBHOOKS")
        webhook_count = configure_webhooks(current)
        (release_dir / "webhook-result.json").write_text(json.dumps({
            "url": WEBHOOK_URL,
            "instances": webhook_count,
            "result": "WEBHOOK_SKIPPED_ZERO_INSTANCES" if webhook_count == 0 else "WEBHOOKS_OK",
        }))
        public_hml_health()
        check_protected(protected)
        require(production_fingerprint() == production_before, "Producao ou GLPI mudou")
        (STATE / "current.txt").write_text(str(release_dir) + "\n")
        stage("DEPLOY_OK")
        require(marker.read_text().strip() == str(release_dir), "Marcador pertence a outra release")
        marker.unlink()
    except Exception:
        if not migration_started and writers_stop_attempted:
            for name in ("evolution-api", "backend", "frontend"):
                subprocess.run(["/usr/bin/docker", "start", apps[name][0]],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            # A release HML antiga pode preceder a adicao do healthcheck do
            # frontend. A identidade HTTP ainda e obrigatoria no retorno.
            rollback_health_error = None
            for attempt in range(30):
                try:
                    healthy_apps(BASE, ports, stabilization=0, require_healthcheck=False)
                    break
                except CheckError as error:
                    rollback_health_error = error
                    if attempt == 29:
                        raise CheckError(
                            "Aplicacao anterior nao ficou saudavel durante retorno"
                        ) from rollback_health_error
                    time.sleep(2)
            check_protected(protected)
            require(production_fingerprint() == production_before,
                    "Producao ou GLPI mudou durante retorno")
            stage("HML_FALHA_ANTES_DA_MIGRACAO_APLICACAO_ANTERIOR_REINICIADA")
            if marker.exists() and marker.read_text().strip() == str(release_dir):
                marker.unlink()
        elif migration_started:
            subprocess.run(["/usr/bin/docker", "stop", "-t", "30", apps["evolution-api"][0]],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            subprocess.run(current + ["stop", "-t", "30", "frontend", "backend"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            stage("HML_RECUPERACAO_MANUAL_NECESSARIA")
        else:
            stage("HML_PREFLIGHT_REPROVADO_SEM_INDISPONIBILIDADE")
        raise


def main(args):
    import fcntl
    mode, sha, digest, length = parse_request(args)
    require(os.geteuid() == 0, "Executor exige root")
    os.umask(0o077)
    os.environ.clear()
    os.environ.update(PATH="/usr/sbin:/usr/bin:/sbin:/bin", HOME="/root", LANG="C.UTF-8")
    trusted_path(STATE)
    with (STATE / "release.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(not (STATE / "recovery-required").exists(), "Recuperacao HML pendente")
        config, ports, apps, protected, backup_size = inventory()
        production_before = production_fingerprint()
        require(shutil.disk_usage(STATE).free >= length + MAX_EXPANDED + 2 * GIB,
                "Espaco insuficiente para conferir pacote")
        signal.alarm(900)
        with tempfile.TemporaryDirectory(prefix="incoming-", dir=STATE) as folder:
            scratch = Path(folder)
            compressed, raw, clean = (scratch / name for name in ("images.gz", "raw.tar", "clean.tar.gz"))
            receive(sys.stdin.buffer, compressed, digest, length)
            signal.alarm(0)
            signal.signal(signal.SIGHUP, signal.SIG_IGN)
            expanded = expand(compressed, raw)
            normalize_archive(raw, clean, sha)
            raw.unlink()
            compressed.unlink()
            docker_root = Path(command(["/usr/bin/docker", "info", "--format", "{{.DockerRootDir}}"]))
            require(shutil.disk_usage(docker_root).free >= 2 * expanded + backup_size + 2 * GIB,
                    "Disco Docker insuficiente para imagens e restauracoes descartaveis")
            require(shutil.disk_usage(STATE).free >= backup_size + 2 * GIB,
                    "Disco insuficiente para backup HML")
            if mode == "plan":
                print(json.dumps({"resultado": "HML_SIMULACAO_OK_SEM_DEPLOY", "commit": sha,
                                  "pacote_expandido_bytes": expanded,
                                  "backup_estimado_bytes": backup_size,
                                  "webhook": WEBHOOK_URL}))
                return
            gate = STATE / "enabled"
            trusted_path(gate)
            gate_info = gate.stat()
            require(stat.S_ISREG(gate_info.st_mode) and stat.S_IMODE(gate_info.st_mode) == 0o600,
                    "Aprovacao HML deve ser arquivo root:root 0600")
            require(gate.read_text().strip() == "approved", "Deploy HML desabilitado")
            command(["/usr/bin/nice", "-n", "10", "/usr/bin/ionice", "-c", "2", "-n", "7",
                     "/usr/bin/docker", "load", "--input", str(clean)], timeout=900)
            clean.unlink()
            stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
            release_dir = STATE / "releases" / f"{stamp}-{sha}"
            release_dir.mkdir(mode=0o700)
            gate.replace(release_dir / "approval.txt")
            publish(config, ports, apps, protected, production_before, sha, release_dir)


def cli():
    try:
        main(sys.argv[1:])
    except Exception as error:
        message = str(error) if isinstance(error, CheckError) else "Falha interna; revisar HML antes de repetir"
        print("HML_RELEASE_BLOQUEADA: " + message, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    cli()
