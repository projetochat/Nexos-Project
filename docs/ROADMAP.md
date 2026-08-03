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

# Sprint 08

Status: implementada localmente com Redis + BullMQ + Transactional Outbox.

Proximo bloco planejado apos gate fisico completo:

- Sprint 09: Socket.io/realtime operacional.

# Sprint 08.01

Status: corretiva de inbound/reconnect implementada localmente.

Entregue:

- Contact/Conversation inbound por identidade remota canonica;
- reconnect com ensure idempotente de webhook Evolution;
- idempotencia preservando replay sem bloquear mensagem nova;
- seed minimo por padrao e demo opt-in;
- cleanup de homologacao tenant-scoped e dry-run por padrao.

Sprint 09 permanece condicionada ao gate fisico completo.

# Sprint 08.02

Status: corretiva de ambiente de homologacao e Contact lifecycle implementada localmente.

Entregue:

- reset oficial de homologacao para `nexos_0802`;
- seed minimo idempotente e operacionalmente vazio;
- audit de contagens/orfaos;
- Contact soft delete + restore no create;
- erro canonico para telefone ativo duplicado.

Proxima etapa: aprovar ambiente e retomar a homologacao fisica da Sprint 08.01. Sprint 09 continua bloqueada.

# Sprint 08.03

Status: corretiva de autenticacao e acesso implementada localmente.

Entregue:

- login real sem fallback mock/demo;
- `/api/auth/me`;
- mensagens de erro especificas;
- seed admin configuravel;
- smoke API real no `nexos_0802`;
- sessao com refresh e logout local sincronizado entre abas.

Proxima etapa: executar validacao UI fisica em navegador disponivel. Sprint 09 continua bloqueada.

# Sprint 08.04

Status: corretiva operacional implementada localmente, gate fisico ainda nao liberado nesta sessao.

Entregue:

- dropdown operacional sem mock/exemplo/fallback;
- filtro por Connections Evolution conectadas;
- webhook Evolution autenticado por `jwt_key`;
- motivos canonicos para eventos ignorados;
- testes automatizados de dropdown, translator, inbound e webhook `jwt_key`;
- regressao completa aprovada em `nexos_0801`.

Sprint 09 continua bloqueada. Rework II atualizou Evolution para `v2.3.7`, preservou `nexos_0802` e
confirmou a instancia conectada `26293569-whatsapp-nata-cffd5f5c`, mas o inbound fisico ainda falha antes
do webhook por decriptacao Signal/Baileys. A liberacao exige `MESSAGES_UPSERT` real chegando ao backend,
mesma Conversation, reconnect, zero replay, Redis down/recovery e exactly-once.

# Sprint 09

Realtime oficial implementado em codigo com Socket.io autenticado, rooms tenant-scoped, eventos de Message,
Conversation, Connection, presença, typing, Redis adapter e fallback REST no frontend. Gate fisico ainda
depende de validacao browser/WhatsApp/Redis down-recovery ponta a ponta antes de liberar Sprint 10.

Rework Sprint 09 recuperou o bootstrap backend fisico em `nexos_0802`, adicionou teste real de DI do
`AppModule`, validou health `realtime=up` com Redis adapter e confirmou sockets admin/agente em homologacao.
Sprint 10 continua bloqueada ate homologacao fisica completa de inbound, outbound/status, presence visual,
typing visual, reconnect/F5 com reconcile REST e queda/retorno de Redis.
