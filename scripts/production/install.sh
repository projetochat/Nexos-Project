#!/bin/sh
# Run only from an administrator-reviewed checkout/archive, never via Actions.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Execute como root.' >&2; exit 1; }
cd "$(dirname "$0")"
for file in preflight.py release.py gateway.py entrypoint.py; do
  [ -f "$file" ] && [ ! -L "$file" ] || exit 1
done
test -x /usr/bin/python3
test -x /usr/bin/docker
test -x /usr/bin/curl
test -x /usr/bin/ionice
test -x /usr/bin/sudo
test -x /usr/sbin/visudo
id trixus-deploy >/dev/null
# Installation is deliberately one-time; upgrades require a separate review.
for path in /usr/local/lib/trixus-production /var/lib/trixus-production /usr/local/sbin/trixus-release /etc/sudoers.d/trixus-release; do
  [ ! -e "$path" ] && [ ! -L "$path" ] || { echo "Ja existe: $path. Revisar antes de instalar." >&2; exit 1; }
done
install -d -o root -g root -m 755 /usr/local/lib/trixus-production
install -o root -g root -m 644 preflight.py release.py /usr/local/lib/trixus-production/
install -o root -g root -m 755 entrypoint.py /usr/local/sbin/trixus-release
install -d -o root -g root -m 700 /var/lib/trixus-production /var/lib/trixus-production/releases
cp -p /usr/local/bin/trixus-actions-gateway /var/lib/trixus-production/gateway.previous
printf '%s\n' 'trixus-deploy ALL=(root) NOPASSWD: /usr/local/sbin/trixus-release *' > /var/lib/trixus-production/sudoers.candidate
/usr/sbin/visudo -cf /var/lib/trixus-production/sudoers.candidate
install -o root -g root -m 440 /var/lib/trixus-production/sudoers.candidate /etc/sudoers.d/trixus-release
install -o root -g root -m 755 gateway.py /usr/local/bin/trixus-actions-gateway
printf '%s\n' 'Instalacao concluida. Simulacao disponivel; deploy permanece desabilitado.'
