# RC Sprint 15 - Testes

## Automatizados

- Backend build: `bun run --cwd backend build`.
- Backend E2E/unit: `bun run --cwd backend test`.
- Frontend typecheck: `bun run typecheck`.
- Verificacao completa: `bun run verify` executado duas vezes com PASS.

## Cobertura adicionada

`backend/test/app.e2e-spec.ts` cobre:

- `/api/operations/dashboard?period=30d`;
- `/api/operations/history/conversations` com paginacao, busca e status;
- `/api/operations/history/conversations/:id/timeline`;
- `/api/operations/queues`;
- `/api/operations/reports/attendance/export`;
- rejeicao de status de conversa invalido.

`src/lib/operational-connection-sources.test.ts` agora valida que `src/routes/simulador.tsx` nao existe e
que AppShell/routeTree nao referenciam `simulador`.

## Pendente manual

- Teste fisico de mensagem WhatsApp real ate Inbox sem F5.
- Encerramento da conversa e conferencia em Historico.
- Conferencia de KPIs em Dashboard/Relatorios com dados criados durante a homologacao.
- Verificacao visual mobile/desktop das telas migradas.
