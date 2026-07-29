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

## Proxima sprint sugerida

P0: migrar um fluxo operacional real para a Nexos API, preferencialmente conversas/mensagens ou chamados com anexos externos, mantendo Supabase legado ate o recorte estar validado.
