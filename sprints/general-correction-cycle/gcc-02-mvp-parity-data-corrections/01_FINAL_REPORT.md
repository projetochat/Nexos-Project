# GCC-02 — MVP Parity & Data Corrections

Data: 20.AGO.2026

## Objetivo

Corrigir diferenças entre o MVP inicial e o projeto atual nos módulos de perfis, departamentos, etiquetas, mensagens rápidas, campanhas, instâncias, cadastros e chat.

## Status

GCC-02 VERIFY PASS

As correções funcionais foram implementadas e a verificação geral foi executada com Docker/Postgres/Redis disponíveis.

## Entregas

- Perfis de acesso reorganizados por abas Chat e Chamados.
- Jornada de trabalho adicionada ao perfil via metadados do role.
- Navegação administrativa filtrada por permissões de módulo.
- Grupo de navegação GLPI renomeado para Chamados.
- Departamentos passam a exibir contagem real de conversas abertas.
- Etiquetas passam a exibir contagem de conversas e clientes.
- Mensagens rápidas restauraram o comportamento do MVP: atalho de 1 caractere e opção Encerrar conversa.
- Backend passou a persistir `closeOnSend` em `quick_replies`.
- Campanhas passam a aparecer imediatamente na lista após criação, mesmo antes do refetch concluir.
- Instâncias passam a exibir tipo visual de conexão e número real quando disponível.
- Chat removeu a duplicidade visual do nome do atendente dentro da bolha enviada pelo Nexos.
- Clientes voltaram a expor telefone e e-mail no cadastro.
- Máscaras adicionadas para telefone e CNPJ nos pontos principais de entrada.
- Validação padronizada de e-mail nos cadastros ajustados.

## Banco de Dados

Nova migration criada:

```text
backend/prisma/migrations/20260820093000_quick_reply_close_on_send/migration.sql
```

Alteração:

```sql
ALTER TABLE "quick_replies"
ADD COLUMN IF NOT EXISTS "closeOnSend" BOOLEAN NOT NULL DEFAULT false;
```

## Validação

Executado com sucesso:

```text
bun run backend:prisma:generate
bun run typecheck
bun run backend:build
bun run build
```

Verificação geral:

```text
bun run verify
```

Resultado final:

- frontend:typecheck: PASS
- frontend:lint-baseline: PASS
- frontend:build: PASS
- contracts PRC-02/04/05/06/07: PASS
- operational runtime: PASS
- backend:build: PASS
- backend:test-db:migrate: PASS
- backend tests: 27 files PASS, 191 tests PASS
- redis:queue-smoke: PASS
- security:xss: PASS

Resultado consolidado:

```text
verify passed
```

## Gate

GCC-02 IMPLEMENTATION COMPLETE

GCC-02 APPROVED FOR NEXT OPERATIONAL TEST CYCLE

O gate automatizado está aprovado. Próximo passo: validar manualmente os fluxos operacionais alterados no navegador.
