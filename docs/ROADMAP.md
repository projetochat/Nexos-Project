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

## Sprint 01 sugerida

P0: desenho do primeiro vertical slice real.

Escopo recomendado:

- Auth/tenant minimo.
- API de conversas e mensagens.
- Persistencia PostgreSQL/Prisma inicial.
- Eventos realtime minimos.
- Contrato de dados ainda sem endpoints definitivos ate decisao arquitetural.
