#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

environment="__ENVIRONMENT__"
sha="__SHA__"
short_sha="__SHORT_SHA__"
state_dir="__STATE_DIR__"
runner="__RUNNER__"
env_file="__ENV_FILE__"
expected_app="__EXPECTED_APP__"
expected_api="__EXPECTED_API__"
expected_mode="__EXPECTED_MODE__"
deploy_token="__DEPLOY_TOKEN__"

package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
archive="$package_dir/images.tar.gz"
gate="$state_dir/enabled"
gate_created=0

cleanup_gate() {
  code=$?
  trap - EXIT HUP INT TERM
  if [ "$gate_created" = 1 ] && [ -f "$gate" ] && [ ! -L "$gate" ]; then
    if [ "$(tr -d '\r\n' < "$gate")" = approved ]; then
      disabled="$state_dir/enabled.disabled-after-$(date -u +%Y%m%dT%H%M%SZ)-$short_sha"
      mv -T -- "$gate" "$disabled"
      chmod 600 "$disabled"
      echo "DEPLOY_GATE=DESABILITADO"
      echo "DEPLOY_GATE_REGISTRO=$disabled"
    fi
  fi
  exit "$code"
}
trap cleanup_gate EXIT HUP INT TERM

fail() {
  echo "PACOTE_${environment^^}_BLOQUEADO: $*" >&2
  exit 1
}

[ "$(id -u)" = 0 ] || fail "execute como root"
[ "$#" = 1 ] || fail "use PLAN ou o token de deploy exibido pelo plano"
[ -d "$state_dir" ] && [ ! -L "$state_dir" ] || fail "diretorio de estado invalido"
[ -x "$runner" ] && [ ! -L "$runner" ] || fail "runner canonico ausente"
[ -f "$env_file" ] && [ ! -L "$env_file" ] || fail "arquivo de ambiente invalido"
[ ! -e "$state_dir/recovery-required" ] || fail "existe recuperacao pendente"
[ ! -e "$gate" ] || fail "deploy gate ja existe; diagnostique antes de continuar"

(cd "$package_dir" && sha256sum --check --strict SHA256SUMS)
[ "$(tr -d '\r\n' < "$package_dir/commit.txt")" = "$sha" ] || fail "commit divergente"

python3 - "$env_file" "$environment" "$expected_app" "$expected_api" "$expected_mode" <<'PY'
import base64
import binascii
import pathlib
import re
import sys

path, environment, expected_app, expected_api, expected_mode = sys.argv[1:]
values = {}
for raw in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    if line.startswith("export "):
        line = line[7:].lstrip()
    if "=" not in line:
        continue
    name, value = line.split("=", 1)
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    values[name.strip()] = value

expected = {
    "TRIXUS_ENVIRONMENT": environment,
    "FRONTEND_ORIGIN": expected_app,
    "TRIXUS_REALTIME_CORS_ORIGIN": expected_app,
    "TRIXUS_PLATFORM_APP_URL": expected_app,
    "TRIXUS_TENANT_APP_URL": expected_app,
    "TRIXUS_PUBLIC_APP_URL": expected_app,
    "EVOLUTION_WEBHOOK_PUBLIC_URL": expected_api + "/webhooks/evolution",
    "VITE_TRIXUS_API_URL": expected_api,
    "VITE_TRIXUS_PLATFORM_APP_URL": expected_app,
    "VITE_TRIXUS_TENANT_APP_URL": expected_app,
    "VITE_APP_MODE": expected_mode,
}
errors = [name for name, expected_value in expected.items() if values.get(name) != expected_value]
raw_key = values.get("AI_CREDENTIALS_ENCRYPTION_KEY", "").strip()
try:
    decoded = bytes.fromhex(raw_key) if re.fullmatch(r"[0-9a-fA-F]{64}", raw_key) else base64.b64decode(raw_key, validate=True)
except (ValueError, binascii.Error):
    decoded = b""
if len(decoded) != 32:
    errors.append("AI_CREDENTIALS_ENCRYPTION_KEY")
if errors:
    raise SystemExit("CONFIGURACAO_BLOQUEADA: " + ",".join(sorted(set(errors))))
print("CONFIGURACAO_PUBLICA_E_CHAVE=VALIDAS")
PY

digest=$(sha256sum "$archive" | cut -d' ' -f1)
length=$(stat -c '%s' "$archive")

if [ "$1" = PLAN ]; then
  "$runner" plan "$sha" "$digest" "$length" < "$archive"
  echo "PLANO_${environment^^}_APROVADO"
  echo "TOKEN_PARA_DEPLOY=$deploy_token"
  exit 0
fi

[ "$1" = "$deploy_token" ] || fail "token de deploy invalido"

if [ "$environment" = production ]; then
  hml_current=/var/lib/trixus-hml-release/current.txt
  [ -f "$hml_current" ] && [ ! -L "$hml_current" ] || fail "release atual da HML ausente"
  hml_release=$(tr -d '\r\n' < "$hml_current")
  case "$hml_release" in
    *-"$sha") ;;
    *) fail "HML nao esta no mesmo commit" ;;
  esac
  [ -f "$hml_release/status.txt" ] || fail "status da HML ausente"
  [ "$(tr -d '\r\n' < "$hml_release/status.txt")" = DEPLOY_OK ] || fail "HML sem DEPLOY_OK"
  echo "HML_MESMO_COMMIT=APROVADA"
fi

gate_tmp="$state_dir/.enabled.$$.tmp"
printf 'approved\n' > "$gate_tmp"
chown root:root "$gate_tmp"
chmod 600 "$gate_tmp"
mv -T -- "$gate_tmp" "$gate"
gate_created=1
echo "DEPLOY_GATE=HABILITADO_PARA_UMA_EXECUCAO"

"$runner" deploy "$sha" "$digest" "$length" < "$archive"

[ ! -e "$state_dir/recovery-required" ] || fail "deploy terminou com recuperacao pendente"
[ -f "$state_dir/current.txt" ] && [ ! -L "$state_dir/current.txt" ] || fail "registro da release ausente"
current_release=$(tr -d '\r\n' < "$state_dir/current.txt")
case "$current_release" in
  *-"$sha") ;;
  *) fail "release registrada com commit divergente" ;;
esac
[ -f "$current_release/status.txt" ] || fail "status final ausente"
[ "$(tr -d '\r\n' < "$current_release/status.txt")" = DEPLOY_OK ] || fail "status final nao aprovado"

echo "PUBLICACAO_${environment^^}_CONCLUIDA_OK"
echo "CURRENT_RELEASE=$current_release"
