# PRC-01 - Baseline Freeze Final Report

Data: 2026-08-16
Status: COMPLETE

## Objetivo

Fechar a baseline tecnica apos a conclusao funcional da mensageria, corrigindo os bloqueios automatizados encontrados na auditoria PRC-01 e deixando o projeto pronto para iniciar a limpeza dos modulos legados no proximo ciclo.

## Resultado Oficial

```text
PRC-01 BASELINE FREEZE COMPLETE
VERIFY PASS
READY FOR PRC-02 LEGACY SURFACE CLEANUP
```

## Correcoes Aplicadas

1. Corrigido o lint baseline que bloqueava o `verify`:
   - formatacao Prettier em arquivos de conversations, messaging, roles e inbox;
   - dependencia `setTab` incluida no `useEffect` da lista do Inbox.

2. Isolado o ambiente do `scripts/verify.mjs`:
   - `SEED_MODE` agora roda como `test` durante o verify;
   - evita que um PowerShell de homologacao com `SEED_MODE=homologation` quebre os testes contra `nexos_1200`.

3. Atualizado banco de teste local:
   - aplicada migration `20260812180000_conversation_inbox_archive` no banco `nexos_1200`;
   - corrigido drift que causava erro em `conversations.inboxArchivedAt`.

4. Corrigido seed de roles de tenant:
   - `seedTenantRoles` agora garante o catalogo de permissions antes de criar `role_permissions`;
   - isso remove a FK quebrada quando novas permissoes entram no sistema.

5. Atualizado contrato e2e de envio de mensagem:
   - o teste agora espera o prefixo aprovado do atendente no conteudo outbound;
   - formato validado: `*Nome do Atendente:*` + linha em branco + mensagem.

## Evidencias De Validacao

### Backend isolado

```text
bun run backend:test
PASS
27 test files passed
189 tests passed
```

### Gate completo

```text
bun run verify
PASS
```

Etapas cobertas pelo verify:

- frontend typecheck: PASS
- frontend lint baseline: PASS
- frontend build: PASS
- inbox legacy runtime check: PASS
- ticket legacy runtime check: PASS
- campaign legacy runtime check: PASS
- platform admin legacy runtime check: PASS
- operational runtime tests: PASS
- backend build: PASS
- backend tests: PASS, 27 arquivos, 189 testes
- redis queue smoke: PASS
- security XSS: PASS, 3 testes

## Observacoes

O worktree continua contendo muitas alteracoes acumuladas do ciclo de mensageria, migrations e documentacao. A PRC-01 nao removeu esse historico nem fez refatoracao de modulos; ela apenas estabilizou a baseline automatizada.

Os modulos legados identificados na auditoria permanecem para a PRC-02:

- `/atendimento/clientes`
- `/atendimento/historico`
- `/atendimento/favoritos`
- `/atendimento/perfil`
- `/empresas`
- `src/lib/api/index.ts`

## Gate Final

```text
PRC-01 APPROVED
MESSAGING BASELINE TECHNICALLY STABILIZED
AUTOMATED GATE GREEN
NEXT SPRINT: PRC-02 LEGACY SURFACE CLEANUP
```
