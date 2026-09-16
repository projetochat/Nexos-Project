#!/usr/bin/python3 -I
"""Root-owned forced SSH command; no shell interpretation."""
import os
import re
import sys

request = os.environ.get('SSH_ORIGINAL_COMMAND', '')
if request == 'check':
    print('Conexao Trixus OK. Acesso restrito.')
elif re.fullmatch(r'(plan|deploy) [0-9a-f]{40} [0-9a-f]{64} [0-9]{1,10}', request):
    os.execv('/usr/bin/sudo', ['sudo', '-n', '/usr/local/sbin/trixus-release', *request.split(' ')])
else:
    print('Comando nao autorizado.', file=sys.stderr)
    sys.exit(1)
