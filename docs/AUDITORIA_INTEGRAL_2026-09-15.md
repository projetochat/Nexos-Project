# Auditoria Integral de Funcionalidades e Qualidade do Sistema

**Data:** 15 de setembro de 2026  
**Escopo:** análise estática e validações automatizadas seguras do frontend, backend, banco, integrações, testes e implantação.  
**Regra aplicada:** nenhum código de produto, banco de dados ou configuração operacional foi modificado.

## Resumo executivo

O Trixus possui uma base funcional ampla, com 61 rotas de frontend, API NestJS modular, Prisma/PostgreSQL, filas Redis/BullMQ e integração Evolution/WhatsApp. Há controles positivos importantes: validação global de DTOs, separação de tenants em boa parte das consultas, RBAC de API, outbox transacional e testes focados em mensageria.

Foram confirmados **2 riscos críticos**, **4 riscos altos/prioridade P1** e **diversos problemas médios de segurança, comportamento, cobertura e qualidade**. A prioridade imediata é impedir tomada de conta entre tenants e bloquear anexos ativos/não verificados. Em seguida, devem ser corrigidos os fluxos que apresentam ações como concluídas sem efeito real e restaurada a confiabilidade da suíte de testes.

## Limites desta rodada

Esta é uma auditoria de código e testes locais. Não foram executadas ações destrutivas, migrações ou testes que gravem em banco. A validação visual/manual de cada campo em um ambiente homologado autenticado continua necessária para concluir a matriz “campo a campo”; os cenários recomendados estão ao final deste documento.

## Mapa funcional consolidado

| Área | Funcionalidades e ações identificadas | Regras e dependências principais |
|---|---|---|
| Acesso e perfil | Login multi-tenant, refresh, recuperação de senha, convite, perfil e alteração de credenciais | JWT, membership de tenant, senha com bcrypt, papéis e permissões |
| Usuários, perfis e departamentos | CRUD de usuários, memberships, funções, permissões e departamentos | limites do plano, vínculo por tenant, associação a departamentos |
| CRM | Clientes/contatos, etiquetas, campos personalizados, importação/exportação e preferências | normalização de telefone, escopo de tenant, etiquetas e catálogos |
| Inbox e mensagens | Conversas, atribuição, transferência, status, histórico, favoritos, mídia, reação, leitura e grupos | permissões, escopo de departamento, realtime e fila de envio |
| Instâncias e WhatsApp | Criar/editar/remover conexão, QR, status, logout, foto e grupos | Evolution API, webhook autenticado e armazenamento de mídia |
| Campanhas e automações | CRUD, público, prévia, agendar, iniciar, pausar, retomar, cancelar, duplicar e métricas | permissões específicas, filas e destinatários |
| Chamados | CRUD, protocolo, status, atribuição, comentários, anexos e histórico | permissões, sanitização de HTML e armazenamento privado |
| Operação | Dashboard, histórico, filas, relatórios, exportação e BI | dados de conversas, mensagens e chamados |
| Configurações | Empresa, financeiro, usuários, permissões, integrações, horários, filas, variáveis e campos | RBAC e dados do tenant |
| Plataforma SaaS | Tenants, planos, assinaturas, faturas, auditoria, logs, monitoramento, suporte e impersonação | permissões de plataforma e ciclo de vida do tenant |

Referências principais: `src/routes/*`, `src/lib/trixus-api.ts`, `backend/src/*`, `backend/prisma/schema.prisma` e `docs/USER_FLOW.md`.

## Achados confirmados

### Crítico — tomada de conta entre tenants

Ao criar um usuário, a API encontra qualquer identidade global com o mesmo e-mail e sobrescreve nome, senha e status antes de criar a membership no tenant atual. Ao editar uma membership, os mesmos campos globais também são atualizados. Portanto, um administrador de outro tenant pode redefinir a senha de uma pessoa já existente e afetar suas outras memberships.

**Evidência:** `backend/src/users/users.controller.ts:341-356` e `backend/src/users/users.controller.ts:402-411`; `User.email` é globalmente único em `backend/prisma/schema.prisma:357-359`.

**Recomendação:** não atualizar credenciais/estado globais de identidade já associada a outro tenant. Usar convite e aceite do titular para novo vínculo; decidir formalmente se nome/e-mail são globais ou por membership e modelar essa decisão.

### Crítico — anexos não verificados podem ser servidos inline

O scanner de anexos é um placeholder que retorna `NOT_SCANNED`, mas o arquivo é marcado como `READY`. Tipos MIME desconhecidos são aceitos; o endpoint inline devolve o MIME declarado pelo usuário. Isso permite, por exemplo, armazenar conteúdo HTML e servi-lo inline pelo domínio da API.

**Evidência:** `backend/src/tickets/attachment-security-scanner.ts:5-7`, `backend/src/tickets/tickets.service.ts:361-365`, `:764-777`, `backend/src/tickets/tickets.controller.ts:157-171`, `:186-194`.

**Recomendação:** manter arquivo inacessível até resultado `CLEAN`; implementar scanner real; adotar allowlist estrita de MIME; forçar download para tipos ativos/desconhecidos e enviar `X-Content-Type-Options: nosniff`.

### Alto — reset de senha e logout não revogam sessões

O refresh token dura sete dias e é JWT sem registro de revogação. Reset de senha altera somente hash da senha e token de reset; logout apenas retorna `{ ok: true }`. Tokens anteriores permanecem utilizáveis até expirar.

**Evidência:** `backend/src/auth/auth.service.ts:68-72`, `:168-236`, `:267-285`; `backend/src/auth/auth.controller.ts:72-74`.

**Recomendação:** introduzir sessões persistidas ou versão/revogação de credenciais por usuário; revogar todos os refresh tokens em reset, troca administrativa e logout.

### Alto — funcionalidades apresentadas como operacionais, mas sem ação

- Horários: campos estáticos e botões Salvar/Cancelar sem handler; nenhuma alteração persiste. `src/routes/configuracoes.horarios.tsx:18,33-46`.
- Integrações: dados fixos; CTAs sem ação; WhatsApp aparece conectado incondicionalmente. `src/routes/configuracoes.integracoes.tsx:9-15,32-34`.
- Usuários e permissões nas configurações: CTAs Convidar/Editar não executam ação. `src/routes/configuracoes.usuarios.tsx:25-27,46-48`, `src/routes/configuracoes.permissoes.tsx:33-36`.
- Ajuda: busca, links e CTAs de contato não são operacionais. `src/routes/ajuda.tsx:11-22,44-49,78-82,93-98`.
- Agente IA: CTA informa que a criação estará disponível no futuro; não há CRUD/API. `src/routes/agente-ia.tsx:17-26`.

**Recomendação:** implementar a integração correspondente ou ocultar/desabilitar explicitamente cada recurso até sua entrega, sem representar dados estáticos como estado real.

### Alto — suíte backend não está verde

O teste backend falha: oito cenários de inbound falham antes da lógica devido a fixtures com assinante repetido, rejeitado pela normalização de telefone; há também uma expectativa de texto divergente em teste de conexão. O E2E declara 67 casos, mas todos estão skipped e houve tentativa de Redis sem conexão.

**Evidência:** `backend/src/messaging/messaging-inbound.service.spec.ts:31-32`, `backend/src/crm/phone-normalization.ts:67-70`, `backend/src/messaging/messaging-connections.service.spec.ts:315`, `backend/test/app.e2e-spec.ts`.

**Recomendação:** corrigir fixtures/expectativas, remover o skip do E2E em ambiente isolado com Postgres e Redis e tornar a suíte verde requisito de release.

### Médio — autorização e exposição de dados

- Faturas do tenant podem ser lidas por qualquer usuário autenticado, sem permissão financeira. `backend/src/users/users.controller.ts:265-282`.
- Realtime ignora a origem configurada e aceita qualquer origem com credenciais. `backend/src/realtime/realtime.config.ts:19`, `backend/src/realtime/realtime.gateway.ts:35`.
- Tokens de acesso e refresh ficam em `localStorage`, elevando o impacto de um XSS. `src/lib/trixus-api.ts:823,865-866,2025-2026,2198,2210,2220-2221`.
- Healthcheck público revela estados de banco, Redis, realtime e storage. `backend/src/health/health.controller.ts:8-43`.
- Proteção contra tentativa de login é somente um `Map` em memória por e-mail, sem IP/Redis/limite global. `backend/src/auth/auth.service.ts:21,490-514`.

**Recomendação:** criar permissão financeira; aplicar allowlist de CORS também ao Socket.IO; mover refresh para cookie HttpOnly/SameSite/Secure; separar liveness público de readiness protegida; usar rate limit distribuído.

### Médio — efeitos inesperados e documentação divergente

- `GET /company` grava `technicalEmail`, tornando uma leitura mutável. `backend/src/users/users.controller.ts:243-251`.
- `/clientes` e `/empresas` redirecionam a `/contatos`; `/atendimento/clientes` provoca mais um redirecionamento, embora o fluxo documentado os descreva como telas próprias. `src/routes/clientes.tsx:3-6`, `src/routes/empresas.tsx:3-6`, `src/routes/atendimento.clientes.tsx:3-7`, `docs/USER_FLOW.md:11,22`.
- `mensagens` e `segurança` nas configurações são somente redirecionamentos e não aparecem nas abas. `src/routes/configuracoes.mensagens.tsx:3-5`, `src/routes/configuracoes.seguranca.tsx:3-5`, `src/routes/configuracoes.tsx:15-25`.
- Falhas de API podem ser exibidas como listas vazias em usuários, permissões e chatbot. `src/routes/configuracoes.usuarios.tsx:13,30-49`, `src/routes/configuracoes.permissoes.tsx:12-18`, `src/routes/chatbot.tsx:15-20,75-80`.

### Médio — qualidade, cobertura e entrega

- Lint falha por regressões em mais de 30 arquivos; o baseline aceita 4.648 erros históricos, tornando o gate pouco confiável. `scripts/eslint-baseline.json:4-13`.
- Há 61 rotas, mas somente um teste específico de rota; não há cobertura de componente/E2E dos CRUDs, CTAs, redirects, RBAC visual e estados de erro. `src/routes/-instancias.test.ts`.
- Não existe pipeline CI versionada; `scripts/verify.mjs` é candidato a gate, mas deve separar testes unitários dos que exigem Postgres/Redis isolados. `docs/DEPLOY.md`, `scripts/verify.mjs:15-65`.
- Imagens de container usam tags sem digest e os containers não têm hardening de usuário/capabilities/read-only filesystem. `docker-compose.vps.yml:5,20,32,47,54`.

### Baixo — melhorias sem mudança de regra de negócio

- `Button` não define `type="button"` como padrão. `src/components/ui-kit.tsx:132-160`.
- `vite-tsconfig-paths` é redundante nas versões atuais do Vite; a própria execução de testes emite aviso.
- Webhook compara segredo com `===`; trocar por comparação em tempo constante. `backend/src/messaging/evolution/evolution-webhook.controller.ts:167`.

## Validações executadas

| Verificação | Resultado |
|---|---|
| TypeScript (`bunx tsc --noEmit`) | Aprovado |
| Regras operacionais (`bun run test:operational-runtime`) | 5 testes aprovados |
| Sanitização XSS (`bun run test:security`) | 3 testes aprovados |
| Dependência legada do Inbox | Aprovada |
| Dependência legada de Chamados | Falhou por `contentEditable` e uso de HTML; requer decisão/ajuste de regra ou implementação |
| Lint | Falhou; 1.339 erros atuais, majoritariamente Prettier, com regressões em relação ao baseline |
| Backend/E2E | Não aprovado: falhas de unitário e E2E integralmente skipped |

## Aspectos positivos confirmados

- `ValidationPipe` global com whitelist, bloqueio de propriedades extras e transformação de DTOs (`backend/src/main.ts:33-40`).
- Helmet e allowlist de CORS HTTP (`backend/src/main.ts:15-31`).
- RBAC por tenant e permissões específicas em áreas como campanhas, tickets, conexões e plataforma.
- Chaves compostas/escopo de tenant em grande parte do Prisma, outbox transacional e processamento serial por conversa.
- Sanitização DOMPurify com teste automatizado para rich text.

## Plano de correção sugerido

1. **Bloqueio imediato:** corrigir isolamento de identidade entre tenants e suspender inline/upload de anexos até haver allowlist e scanner.
2. **Segurança de sessão:** revogar refresh tokens após reset/logout/troca de senha; corrigir CORS realtime, autorização financeira e exposição de tokens de ambiente.
3. **Confiabilidade funcional:** retirar/rotular CTAs sem implementação ou conectá-los à API; diferenciar erro de estado vazio; resolver rotas que só redirecionam.
4. **Qualidade de release:** tornar backend test verde, habilitar E2E com serviços efêmeros, criar CI e reduzir o baseline de lint gradualmente.
5. **Validação manual homologada:** executar os roteiros abaixo por papel de usuário e registrar evidência.

## Roteiro para validação manual campo a campo

Para cada CRUD, registrar tela, usuário/papel, campo, tipo, obrigatoriedade, valor limite, mensagem de erro, salvar/editar/cancelar/excluir, efeito no banco/API e atualização realtime. Cobrir ao menos:

1. Administração de tenant: criar/editar/suspender tenant, plano, assinatura, fatura e impersonação.
2. Tenant admin: criar/editar/desativar usuário, papel e departamento; tentar operar com e sem cada permissão.
3. CRM: criar, editar, importar, exportar, mesclar/excluir contato, etiquetas e campos personalizados.
4. Conexões: criar, QR, reconectar, trocar foto, remover e validar impacto nas conversas.
5. Inbox: receber/enviar texto, mídia e reação; atribuir, transferir, fechar, reabrir, favoritar e tratar grupo.
6. Campanhas/automações: criar, validar público, agendar, iniciar, pausar, retomar, cancelar e duplicar.
7. Chamados: criar, alterar status/atribuição, comentar, anexar tipos permitidos e excluir anexo.
8. Operação e relatórios: aplicar cada filtro, estados vazios, erro, exportação e escopo de permissão.

Cada divergência deve informar a expectativa de negócio, o resultado observado, passos de reprodução, evidência e prioridade. Nenhuma correção deve ser aplicada sem aprovar a regra de negócio correspondente.
