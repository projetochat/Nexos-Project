# Roadmap

## Sprint 00 concluida

- Baseline estatica do frontend realizada.
- Rotas, dados, mocks, persistencia local, auth, entidades candidatas e gaps mapeados.
- Validacoes automatizadas tentadas, bloqueadas pela ausencia de Bun no PATH.
- Nenhuma alteracao funcional executada.

## Principais gaps

- Instalar Bun no ambiente para reproducibilidade.
- Definir decisao de auth futura.
- Projetar backend NestJS sem copiar cegamente a estrutura Supabase atual.
- Definir multi-tenancy real.
- Substituir mocks por APIs reais.
- Externalizar midia para Cloudflare R2.
- Definir eventos Socket.io e jobs BullMQ.
- Criar testes e CI/CD.

## Sprint 01 executada

Entregue:

- Foundation backend NestJS + Prisma + PostgreSQL.
- Auth/tenant minimo.
- `/api/me` e rota protegida por tenant.
- Testes e2e da API.
- Hardening XSS de chamados.
- Hardening de `ensureDemoUsers`.

Nao entregue nesta sprint:

- API real de conversas e mensagens.
- Eventos realtime Socket.io.
- Jobs Redis/BullMQ.
- R2 para midia.
- Adaptadores Evolution/Meta.

## Sprint 06 concluida

Universal Messaging Adapter implementado como fronteira provider-neutral. Sprint 07 deve implementar Evolution API exclusivamente como adapter sobre o contrato criado nesta sprint: lifecycle de connection, QR Code, outbound real, webhook inbound e status delivery/read.

## Sprint 07 concluida

Evolution API Provider implementado como adapter real. Foram entregues lifecycle de connection, QR Code, outbound textual real, webhook inbound/status e tela `/instancias` pela Nexos API.

Continuam fora de escopo:

- Meta Cloud API.
- Redis/BullMQ do Nexos.
- Socket.io/realtime proprio.
- Cloudflare R2 e midia real.
- Campanhas, bots, IA, billing e automacoes.

Proxima sprint sugerida:

- Consolidar realtime/filas para mensagens e conexoes, ou migrar o proximo fluxo operacional ainda dependente de Supabase.

## Sprint 07.01 - Evolution E2E Hardening

Hardening corretivo da Sprint 07:

- env real do backend corrigido para `.env` da raiz;
- webhook registration explicito;
- reconciliação de instance ausente;
- cleanup/delete de connections;
- mocks operacionais removidos de `/instancias`;
- testes de bootstrap, lifecycle, webhook e payload realista ampliados.

Sprint 08 permanece bloqueada ate aceite manual do fluxo WhatsApp real inbound/outbound.

## Sprint 07.02 - Real WhatsApp Acceptance Closure

Executada preservacao formal do WIP parcial da Sprint 08 em `backup/sprint-08-partial-before-07.02` e criada branch limpa `sprint/07.02-real-whatsapp-acceptance` a partir da baseline 07.01.

Entregue nesta sprint:

- QR endpoint corrigido para o formato real retornado por `/instance/connect/:instanceName`.
- Orphan handling corrigido para `INSTANCE_NOT_FOUND` canonico sem 500 generico.
- Create, webhook registration, QR, delete, recreate, orphan cleanup, health, builds, testes e verify validados localmente.

Gate final:

- `NOT READY FOR SPRINT 08` ate reproducao fisica de CONNECTED, outbound real para WhatsApp B, inbound real de WhatsApp B, persistencia e lifecycle conectado.

Sprint 08 Redis/BullMQ permanece congelada como WIP preservado, nao aprovado.

## Sprint 01.1 concluida

Entregue:

- frontend build reproduzivel;
- lint baseline com bloqueio de regressao;
- `bun run verify`;
- documentacao da decisao de auth;
- smoke HTTP das principais rotas.

Com o gate aprovado, a Sprint 02 pode iniciar com foco em Organizacao + Users + Departments + RBAC, sem implementar essa etapa dentro da Sprint 01.1.

## Sprint 02 concluida

Entregue:

- camada organizacional NestJS/PostgreSQL/Prisma;
- users, memberships, departments, department memberships, roles e permissions;
- RBAC server-side por permission;
- Platform Admin separado de Tenant Admin;
- telas administrativas migradas para Nexos API;
- Supabase removido das superficies migradas.

Proxima sprint:

- Sprint 03 - Contacts / CRM.
