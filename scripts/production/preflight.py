#!/usr/bin/python3
"""Read-only inventory of the existing Trixus VPS. Never prints secrets."""

import json
import os
import platform
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

APP = Path("/opt/trixus/app")
ENV = APP / ".env.vps"
COMPOSE = APP / "docker-compose.vps.yml"
STORAGE = Path("/srv/trixus-data")
PROJECT = "trixus-vps"


class CheckError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise CheckError(message)


def run(args):
    # Compose output contains credentials. Never echo stdout/stderr on errors.
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    require(result.returncode == 0, "Consulta falhou: " + args[0])
    return result.stdout.strip()


def trusted_path(path):
    for entry in (path, *path.parents):
        info = entry.lstat()
        require(not stat.S_ISLNK(info.st_mode), "Revisar link simbolico: " + str(entry))
        require(info.st_uid == 0, "Revisar proprietario: " + str(entry))
        require(not info.st_mode & 0o022, "Revisar permissao de escrita: " + str(entry))


def validate_config(config):
    require(config.get("name") == PROJECT, "Projeto Compose inesperado")
    services = config["services"]
    for name in ("backend", "frontend", "migrate", "postgres", "redis"):
        require(name in services, "Servico ausente: " + name)
    database = services["postgres"]["environment"]
    migration_url = services["migrate"]["environment"]["DATABASE_URL"]
    require(services["backend"]["environment"]["DATABASE_URL"] == migration_url,
            "API e migrations apontam para bancos diferentes")
    url = urlparse(migration_url)
    require(url.scheme in ("postgres", "postgresql") and url.hostname == "postgres"
            and url.port in (None, 5432), "Banco externo ao projeto; revisar backup")
    require(unquote(url.path.lstrip("/")) == database["POSTGRES_DB"], "Banco de backup divergente")
    require(unquote(url.username or "") == database["POSTGRES_USER"], "Usuario do banco divergente")
    require(unquote(url.password or "") == database["POSTGRES_PASSWORD"], "Credencial do banco divergente")
    for service in ("backend", "frontend", "migrate"):
        item = services[service]
        require(not item.get("privileged"), "Container privilegiado: " + service)
        require(item.get("network_mode") != "host", "Rede do host: " + service)
        require(item.get("pid") != "host", "Processos do host: " + service)
        require(not item.get("devices") and not item.get("cap_add"), "Privilegios adicionais: " + service)
        for volume in item.get("volumes", []):
            require(service == "backend" and volume.get("type") == "bind"
                    and volume.get("source") == STORAGE.as_posix()
                    and volume.get("target") == "/var/lib/trixus/storage",
                    "Montagem inesperada: " + service)
    mounts = services["backend"].get("volumes", [])
    require(len(mounts) == 1, "Armazenamento do backend divergente")
    for service, port in (("backend", "3001"), ("frontend", "4173")):
        ports = services[service].get("ports", [])
        require(len(ports) == 1 and ports[0].get("host_ip") == "127.0.0.1"
                and str(ports[0].get("published")) == port,
                "Porta/proxy divergente: " + service)
    require(not services["migrate"].get("ports"), "Migration com porta publicada")


def main():
    require(len(sys.argv) == 1, "Este programa nao aceita argumentos")
    require(os.geteuid() == 0, "Execute como root para consultar a configuracao privada")
    require(platform.machine() in ("x86_64", "amd64"), "Arquitetura inesperada")
    trusted_path(COMPOSE)
    trusted_path(ENV)
    require(STORAGE.is_dir() and not STORAGE.is_symlink(), "Storage ausente ou com link simbolico")
    require(stat.S_ISREG(ENV.stat().st_mode), "Arquivo de ambiente invalido")
    docker = shutil.which("docker")
    require(bool(docker), "Docker nao encontrado")
    base = [docker, "compose", "--project-directory", str(APP), "--env-file", str(ENV),
            "-f", str(COMPOSE), "--profile", "release"]
    config = json.loads(run(base + ["config", "--format", "json"]))
    validate_config(config)
    for service in ("backend", "frontend", "postgres", "redis"):
        container = run(base + ["ps", "-q", service])
        require(bool(container) and "\n" not in container, "Revisar container: " + service)
        identity = run([docker, "inspect", "--format",
                        '{{index .Config.Labels "com.docker.compose.project"}} {{.State.Running}}', container])
        require(identity == PROJECT + " true", "Container fora do projeto ou parado: " + service)
    for service in ("apache2", "mariadb"):
        require(run(["systemctl", "is-active", service]) == "active", "Servico compartilhado inativo")
    db_size = run(base + ["exec", "-T", "postgres", "sh", "-c",
                          'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc '
                          '"SELECT pg_database_size(current_database());"'])
    require(db_size.isdigit(), "Nao foi possivel medir o banco")
    available = shutil.disk_usage(APP).free
    memory = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, value = line.split(":", 1)
        memory[key] = int(value.strip().split()[0]) * 1024
    # These are conservative preflight floors, not a guarantee that an arbitrary
    # future image archive fits. Deployment must check actual expanded sizes.
    require(available >= 6 * 1024**3, "Menos de 6 GiB livres; revisar espaco antes do deploy")
    require(memory.get("MemAvailable", 0) >= 1024**3, "Menos de 1 GiB de memoria disponivel")
    print(json.dumps({
        "resultado": "PRECHECK_OK_DEPLOY_DESABILITADO",
        "projeto": PROJECT,
        "configuracao": str(COMPOSE),
        "storage": str(STORAGE),
        "disco_livre_gib": round(available / 1024**3, 2),
        "memoria_disponivel_gib": round(memory["MemAvailable"] / 1024**3, 2),
        "banco_mib": round(int(db_size) / 1024**2, 2),
        "apache": "active",
        "mariadb": "active",
        "alteracoes_realizadas": False,
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except CheckError as error:
        print("PRECHECK_BLOQUEADO: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        print("PRECHECK_BLOQUEADO: consulta incompleta; revisar configuracao local", file=sys.stderr)
        sys.exit(1)
