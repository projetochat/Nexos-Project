#!/usr/bin/env bash
# Upgrade only the root-owned Trixus release runner from an administrator-reviewed checkout.
set -Eeuo pipefail
umask 077

[[ "$(id -u)" == 0 ]] || { echo 'Execute como root.' >&2; exit 1; }
cd "$(dirname "$0")"

state=/var/lib/trixus-production
backup_root="$state/runner-backups"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$backup_root/$stamp"
success=0
installed=0
staged_targets=()

[[ -d "$state" && ! -L "$state" ]] || {
  echo 'Diretorio de estado do runner invalido.' >&2
  exit 1
}
[[ "$(/usr/bin/stat -c '%U:%G:%a' "$state")" == root:root:700 ]] || {
  echo 'Diretorio de estado do runner deve pertencer ao root e usar modo 700.' >&2
  exit 1
}

exec 9>>"$state/release.lock"
/usr/bin/flock -n 9 || { echo 'Existe uma publicacao em andamento.' >&2; exit 1; }

files=(preflight.py release.py gateway.py entrypoint.py)
targets=(
  /usr/local/lib/trixus-production/preflight.py
  /usr/local/lib/trixus-production/release.py
  /usr/local/bin/trixus-actions-gateway
  /usr/local/sbin/trixus-release
)
modes=(644 644 755 755)

rollback() {
  local code=$?
  trap - EXIT HUP INT TERM
  if [[ "$success" != 1 && "$installed" == 1 ]]; then
    echo 'Falha na atualizacao; restaurando scripts anteriores.' >&2
    for index in "${!files[@]}"; do
      restore="${targets[$index]}.trixus-restore.$$"
      /usr/bin/install -o root -g root -m "${modes[$index]}" \
        "$backup/${files[$index]}" "$restore"
      /usr/bin/mv -f -- "$restore" "${targets[$index]}"
    done
  fi
  for staged in "${staged_targets[@]}"; do
    /usr/bin/rm -f -- "$staged"
  done
  if [[ "$success" != 1 && "$installed" != 1 && -d "$backup" ]]; then
    /usr/bin/rm -rf -- "$backup"
  fi
  exit "$code"
}
trap rollback EXIT HUP INT TERM

[[ -f INSTALL-SHA256SUMS && ! -L INSTALL-SHA256SUMS ]] || {
  echo 'Manifesto de checksums ausente ou invalido.' >&2
  exit 1
}
/usr/bin/sha256sum --check --strict INSTALL-SHA256SUMS

for file in "${files[@]}"; do
  [[ -f "$file" && ! -L "$file" ]] || { echo "Fonte invalida: $file" >&2; exit 1; }
  /usr/bin/python3 -I -B -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_bytes(), sys.argv[1], "exec")' "$file"
done

[[ -x /usr/sbin/visudo && -f /etc/sudoers.d/trixus-release ]] || {
  echo 'Instalacao atual do runner nao encontrada.' >&2
  exit 1
}
/usr/sbin/visudo -cf /etc/sudoers.d/trixus-release

/usr/bin/install -d -o root -g root -m 700 "$backup_root" "$backup"
for index in "${!files[@]}"; do
  target="${targets[$index]}"
  [[ -f "$target" && ! -L "$target" ]] || { echo "Destino invalido: $target" >&2; exit 1; }
  [[ "$(/usr/bin/stat -c '%U:%G:%a' "$target")" == "root:root:${modes[$index]}" ]] || {
    echo "Propriedade ou permissao invalida: $target" >&2
    exit 1
  }
  /usr/bin/cp -p -- "$target" "$backup/${files[$index]}"
  staged="${target}.trixus-new.$$"
  staged_targets+=("$staged")
  /usr/bin/install -o root -g root -m "${modes[$index]}" \
    "${files[$index]}" "$staged"
done

installed=1
for index in "${!files[@]}"; do
  /usr/bin/mv -f -- "${staged_targets[$index]}" "${targets[$index]}"
done

for index in "${!files[@]}"; do
  /usr/bin/cmp -s -- "${files[$index]}" "${targets[$index]}" || {
    echo "Validacao instalada falhou: ${files[$index]}" >&2
    exit 1
  }
done
/usr/bin/python3 -I -B -c \
  'import sys; sys.path.insert(0,"/usr/local/lib/trixus-production"); import preflight,release'
/usr/sbin/visudo -cf /etc/sudoers.d/trixus-release

success=1

# These backups contain only four small runner scripts. Keep the two newest.
mapfile -t old_backups < <(/usr/bin/find "$backup_root" -mindepth 1 -maxdepth 1 -type d \
  -name '????????T??????Z' -printf '%f\n' | /usr/bin/sort -r | /usr/bin/tail -n +3)
for name in "${old_backups[@]}"; do
  [[ "$name" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || continue
  /usr/bin/rm -rf -- "$backup_root/$name"
done

echo "Runner Trixus atualizado. Copia anterior: $backup"
echo 'Nenhum banco, anexo, container ou servico foi alterado.'
