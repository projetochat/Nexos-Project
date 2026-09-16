#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${DEPLOY_HOST:?}" "${DEPLOY_PORT:?}" "${DEPLOY_USER:?}"
: "${DEPLOY_SSH_KEY:?}" "${DEPLOY_KNOWN_HOSTS:?}" "${GITHUB_SHA:?}" "${RELEASE_MODE:?}"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ && "$DEPLOY_USER" == trixus-deploy ]]
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ && "$RELEASE_MODE" =~ ^(plan|deploy)$ ]]
[[ "$(cat release/commit.txt)" == "$GITHUB_SHA" ]]
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" > "$scratch/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$scratch/known_hosts"
unset DEPLOY_SSH_KEY DEPLOY_KNOWN_HOSTS
digest=$(sha256sum release/images.tar.gz | cut -d' ' -f1)
length=$(stat -c '%s' release/images.tar.gz)
ssh -T -i "$scratch/key" -p "$DEPLOY_PORT" \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$scratch/known_hosts" -o ConnectTimeout=20 \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=8 \
  "$DEPLOY_USER@$DEPLOY_HOST" "$RELEASE_MODE $GITHUB_SHA $digest $length" < release/images.tar.gz
