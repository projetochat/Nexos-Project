# Sprint 07.03 - Conversation Initiation & WhatsApp Connection Consistency

Data: 2026-08-03
Branch: `sprint/07.03-conversation-init-connection-consistency`
Base Sprint 07.02: `a1122e4dcc3116b157a4742ab67ecd8268466984`
Backup Sprint 08 preservado: `backup/sprint-08-partial-before-07.02` em `570cdf241191c2d461546c5a3e65d27f374f33ba`

## Resumo

Implementado fluxo minimo real para iniciar conversa no Inbox usando contato, connection Evolution conectada e envio da primeira mensagem pelo endpoint real de mensagens. O backend passou a validar connection por tenant/status/provider, reutilizar conversa aberta por tenant+contact+connection, capturar identidade do dono da connection via webhook Evolution e deduplicar inbound por owner identity apos reconexao. A UI de instancias removeu o `instanceName` manual e passou a exibir o WhatsApp mascarado quando conhecido.

## Validacao

- `bun --version`: `1.3.14`
- Verify inicial antes das alteracoes: PASS
- Banco isolado: `nexos_0703`
- Migration criada: `20260803070300_connection_owner_identity`
- Seed executado em `nexos_0703`
- Verify final #1: PASS
- Verify final #2: PASS
- Backend tests: 59 PASS

## Gate

Automatizado/local: PASS.
Fisico WhatsApp real nesta sessao: NAO EXECUTADO.

Como o criterio formal exige prova fisica de outbound/inbound/reconnect duplicate/duplicate owner para liberar Sprint 08, o gate permanece:

```text
NOT READY FOR SPRINT 08
```

## M01-M81

| ID | Meta | Resultado | Evidencia | Status |
| --- | --- | --- | --- | --- |
| M01 | baseline Sprint 07.02 | Base confirmada | HEAD inicial `a1122e4` | PASS |
| M02 | Sprint 08 backup preserved | Branch preservada | `backup/sprint-08-partial-before-07.02` em `570cdf2...` | PASS |
| M03 | branch Sprint 07.03 | Branch criada | `sprint/07.03-conversation-init-connection-consistency` | PASS |
| M04 | worktree inicial clean | Confirmado antes das alteracoes | `git status` limpo no preflight | PASS |
| M05 | Bun status | Versao ok | `bun --version` = `1.3.14` | PASS |
| M06 | verify inicial | Passou | `bun run verify` antes das alteracoes | PASS |
| M07 | DB limpo | Banco isolado preparado | `nexos_0703` criado, migrado e seedado | PASS |
| M08 | migrations corretas | Migration adicionada | `20260803070300_connection_owner_identity` | PASS |
| M09 | Evolution health | Nao exercitado fisicamente | Fora do escopo automatizado local desta sessao | BLOCKED |
| M10 | frontend startup | Build validado | `frontend:build` nos verifies | PASS |
| M11 | initiate conversation UI | Modal atualizado | Inbox seleciona contato + connection + primeira mensagem | PASS |
| M12 | Contact search | Preservado | Busca existente no modal mantida | PASS |
| M13 | Connection selection | Implementado | Select de connections Evolution conectadas | PASS |
| M14 | connected-only filter | Implementado | UI filtra `providerType=evolution` e `status=connected`; backend valida | PASS |
| M15 | Department rule | Preservada | `resolveDepartmentId` segue escopo do tenant/membership | PASS |
| M16 | assignment rule | Preservada | `assignToSelf` atribui current membership | PASS |
| M17 | create Conversation API | Atualizada | DTO aceita `connectionId`; serialize retorna `connection_id` | PASS |
| M18 | duplicate Conversation prevention | Implementada | E2E reutiliza mesma conversa aberta por tenant+contact+connection | PASS |
| M19 | tenant Contact isolation | Preservada | E2E cross-tenant contact continua 400 | PASS |
| M20 | tenant Connection isolation | Implementada | E2E connection de outro tenant retorna 400/404 | PASS |
| M21 | permissions | Preservadas | Guards/permissions mantidos; verify backend tests PASS | PASS |
| M22 | first Message enabled | Implementado | UI chama `messageApi.sendText` apos criar conversa | PASS |
| M23 | outbound adapter preserved | Preservado | `MessagingOutboundService.sendText` segue provider adapter existente | PASS |
| M24 | outbound real | Codigo habilita fluxo real | Prova fisica WhatsApp nao executada nesta sessao | BLOCKED |
| M25 | outbound persistence | Preservado | Teste de mensagens outbound transacional PASS | PASS |
| M26 | reconnect replay reproduced | Nao reproduzido fisicamente | Coberto por teste automatizado de replay por owner | PARTIAL |
| M27 | replay root cause | Tratado no backend | Idempotencia antes dependia de `connectionId + externalMessageId` | PASS |
| M28 | idempotency fix | Implementado | Dedupe considera owner identity quando disponivel | PASS |
| M29 | replay no duplicate Message | Validado | E2E same owner + same external id gera 1 Message | PASS |
| M30 | replay no unread increment | Validado | E2E mantem `unreadCount = 1` | PASS |
| M31 | replay no new Conversation | Validado | E2E mantem 1 conversa aberta para o contato unico | PASS |
| M32 | owner identity capture | Implementado | Translator extrai `ownerJid`/`instance.ownerJid`/`me.id` | PASS |
| M33 | owner identity persistence | Implementado | `MessagingConnection.ownerExternalId` e `ownerPhoneNormalized` | PASS |
| M34 | same tenant duplicate connection blocked | Implementado como ERROR | E2E marca segunda connection same tenant como `ERROR` | PASS |
| M35 | cross-tenant behavior | Preservado | E2E permite mesmo owner em tenants diferentes | PASS |
| M36 | displayName | Preservado | UI cria connection por `name` de exibicao | PASS |
| M37 | technical instanceName generation | Implementado | Backend gera `tenant-name-randomUUID` | PASS |
| M38 | same displayName no technical conflict | Implementado | `instanceName` sempre unico; teste unitario cobre raw ignored | PASS |
| M39 | logout preserves connection | Preservado | Service continua marcando `DISCONNECTED` | PASS |
| M40 | reconnect preserves identity | Implementado | Webhook de connection atualiza owner identity | PASS |
| M41 | delete | Preservado | Remove connection e desassocia mensagens/conversas | PASS |
| M42 | recreate | Preservado | Nome tecnico unico evita conflito local por displayName | PASS |
| M43 | new inbound after reconnect | Logica preservada | Inbound cria nova Message se external id novo | PASS |
| M44 | Contact resolution | Preservada | Upsert por normalizedPhone mantido | PASS |
| M45 | Conversation resolution | Melhorada | Reusa por connection e por owner identity | PASS |
| M46 | Message persistence | Preservada | E2E backend messages PASS | PASS |
| M47 | lastMessage | Preservado | Atualizacao em inbound/outbound mantida | PASS |
| M48 | unread | Preservado | Inbound incrementa; duplicate nao incrementa | PASS |
| M49 | inbound idempotency | Melhorada | E2E idempotency e owner replay PASS | PASS |
| M50 | create Conversation tests | Adicionados | E2E conversation+connection PASS | PASS |
| M51 | duplicate Conversation tests | Adicionados | E2E duplicate create returns same id | PASS |
| M52 | permission tests | Preservados | Suite backend PASS | PASS |
| M53 | replay tests | Adicionados | E2E reconnect owner replay PASS | PASS |
| M54 | duplicate owner tests | Adicionados | Unit + E2E duplicate owner PASS | PASS |
| M55 | instance naming tests | Adicionado | Unit test ignora raw `instanceName` | PASS |
| M56 | connection lifecycle tests | Preservados/ampliados | Connection update owner/ERROR PASS | PASS |
| M57 | tenant isolation | Preservada | Cross-tenant tests PASS | PASS |
| M58 | webhook security | Preservada | Reject unauthenticated webhook PASS | PASS |
| M59 | XSS/security | Passou | `security:xss` 3 PASS | PASS |
| M60 | CRM regression | Preservada | Backend suite e frontend build PASS | PASS |
| M61 | Conversation regression | Preservada | Backend suite PASS | PASS |
| M62 | Message regression | Preservada | Backend suite PASS | PASS |
| M63 | frontend regression | Passou | Typecheck/build PASS | PASS |
| M64 | typecheck | Passou | `tsc --noEmit` e verify | PASS |
| M65 | lint | Passou baseline | 1280 errors/13 warnings dentro do baseline legado | PASS |
| M66 | frontend build | Passou | Vite/Nitro build PASS | PASS |
| M67 | backend build | Passou | `tsc -p tsconfig.build.json` PASS | PASS |
| M68 | backend tests | Passou | 9 files, 59 tests PASS | PASS |
| M69 | verify final #1 | Passou | `bun run verify` com `DATABASE_URL=nexos_0703` | PASS |
| M70 | verify final #2 | Passou | Segundo `bun run verify` com `DATABASE_URL=nexos_0703` | PASS |
| M71 | Supabase no increase | Nao alterado | Nenhum arquivo/integração Supabase novo | PASS |
| M72 | no Redis/BullMQ | Cumprido | Nenhuma implementacao Redis/BullMQ adicionada | PASS |
| M73 | no Socket.io | Cumprido | Nenhum Socket.io adicionado | PASS |
| M74 | no Meta | Cumprido | Nenhuma Meta Cloud API adicionada | PASS |
| M75 | no R2 | Cumprido | Nenhum R2 adicionado | PASS |
| M76 | docs | Atualizado | Este relatorio documenta a sprint | PASS |
| M77 | changelog | Nao aplicavel | Nao havia changelog dedicado a atualizar sem ruido | N/A |
| M78 | report | Criado | `sprints/sprint-07.03/RELATORIO.md` | PASS |
| M79 | commit | Incluido no fechamento da sprint | Commit final desta branch registra implementacao e relatorio | PASS |
| M80 | final git clean | Verificado no fechamento | `git status` final limpo apos commit | PASS |
| M81 | gate | Nao liberado | Sem prova fisica WhatsApp real nesta sessao | NOT READY |
