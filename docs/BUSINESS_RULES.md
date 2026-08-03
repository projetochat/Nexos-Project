# Regras de Negocio

Somente regras comprovadas no codigo.

## Filas

- Ativas: conversa atribuida a agente, nao fechada e nao em standby.
- Stand By: `status = 'aguardando'`.
- Fila: `status = 'aberta'`, sem agente, mais de uma mensagem.
- Leads: sem agente, nao fechada, ate uma mensagem.
- Fechadas: `status = 'fechada'`.

## Conversas e mensagens

- Assumir conversa define agente e `em_andamento`.
- Encerrar define `fechada`.
- Mensagem de contato em conversa fechada reabre via trigger.
- `last_message_at` e atualizado por trigger.
- Protocolo e gerado por `assign_conversation_protocolo` no formato anual.
- Nao lidas sao mensagens de contato com `read_at` nulo.

## Contatos e clientes

- Cliente removido desvincula contatos.
- Contato pode ter cliente, email, departamento, nivel de gerencia, instancia e tags.
- Nivel de gerencia aceito no schema atual: `Colaborador`, `Supervisor`, `Gerente`, `Diretoria`.

## Perfis e permissoes

- Perfil possui flags de chat, escopos de instancia/departamento e jornada.
- Algumas flags controlam UI; enforcement server-side definitivo e gap para Sprint futura.

## Midia

- Chat aceita imagem colada/upload e audio gravado.
- Chamado aceita imagem no editor HTML.
- Armazenamento atual e inline/data URL ou HTML, nao bucket.

## Simulacoes

- Campanhas, Super Admin, chatbot, automacoes, monitoramento e varias configuracoes exibem comportamento de MVP sem integracao real.

## Sprint 01 - Regras Multi-Tenant

- Todo acesso a entidades novas do backend deve carregar `tenantId` a partir da membership autenticada.
- O cliente pode informar `tenantSlug` no login para escolher uma membership existente, mas nao pode escolher `tenantId` arbitrario.
- `/api/tenant-records/:id` retorna 404 quando o registro existe em outro tenant, evitando enumeracao.
- Roles persistidas no backend: `SUPER_ADMIN`, `ADMIN`, `SUPERVISOR`, `OPERATOR`.
- Permissoes retornadas em `/api/me` sao derivadas de role e tenant no servidor.
- Provisionamento automatico de usuarios demo por service role fica desabilitado por padrao.

## Sprint 02 - Regras Organizacionais e RBAC

- `User` e identidade global e pode participar de mais de um tenant via memberships.
- `TenantMembership` ativa e obrigatoria para operar em um tenant.
- Membership inativa bloqueia requests protegidos mesmo com JWT emitido anteriormente.
- `Role` pertence a um tenant; role de Tenant A nao pode ser atribuida a membership de Tenant B.
- `Permission` e catalogada pelo backend; keys arbitrarias sao rejeitadas.
- `Department` pertence a um tenant.
- Membership de Tenant A nao pode ser associada a Department de Tenant B.
- `PlatformRole.ADMIN` nao equivale a `tenant_admin`.
- Toda autorizacao de users, departments e roles ocorre no backend via permission guard.
- Frontend pode esconder acoes por UX, mas nao substitui autorizacao server-side.

## Sprint 06 - Messaging Adapter

- Provider resolution nunca vem do payload publico de envio. O provider e resolvido pela Conversation/Connection tenant-scoped.
- O core de Message e Conversation nao conhece payloads Evolution, Meta, QR Code ou webhook externo.
- Development provider so aceita TEXT, retorna `accepted_by_development_provider` e nao simula DELIVERED/READ.
- Development provider e bloqueado quando `NODE_ENV=production`.
- Falha de provider nao apaga Message. A intencao fica persistida como FAILED com erro canonico sanitizado.
- Inbound reutiliza Contact por telefone normalizado antes de criar novo contato.
- Inbound cria ou reutiliza Conversation aberta por tenant, connection e contato.
- Inbound duplicado por `tenantId + connectionId + externalMessageId` retorna o Message existente.
- Status e monotonicamente protegido: READ nao volta para SENT/DELIVERED; FAILED e terminal salvo repeticao de FAILED.
- Media permanece como boundary de capability. Storage real e URLs assinadas continuam fora de escopo.

## Sprint 07 - Evolution Provider

- Evolution API e apenas provider adapter; o core continua provider-neutral.
- `instanceName` externo fica em `MessagingConnection.externalReference`, sem secrets.
- Criacao, QR, status e logout de instancias exigem escopo do tenant e permissao de connections.
- Outbound nao usa provider fallback. Conversa sem `connectionId` configurado nao envia.
- Webhook Evolution exige JWT proprio assinado por `EVOLUTION_WEBHOOK_SECRET`.
- Eventos `fromMe` recebidos no webhook inbound sao ignorados para evitar duplicacao do outbound local.
- Eventos desconhecidos ou payloads incompletos sao descartados sem vazar erro de provider para o dominio.
- QR Code e status de conexao sao dados operacionais temporarios; mensagens continuam no modelo canonico.

## Sprint 07.01 - Evolution hardening

- Uma connection Evolution so deve aparecer como instancia operacional se for provider `EVOLUTION`.
- Connections locais sem instance correspondente na Evolution sao orfas; QR deve falhar com `INSTANCE_NOT_FOUND`.
- Remover connection e uma acao explicita: se a instance existe, remove na Evolution; se nao existe, limpa apenas o registro local.
- Mensagens de grupos (`@g.us`) continuam fora de escopo e sao ignoradas pelo translator inbound.
- Webhook inbound deve responder rapido e usar idempotencia por message id.
- Historico anterior a conexao WhatsApp nao e importado nesta etapa.

# Sprint 08 - Regras de fila e envio

- HTTP nunca chama provider diretamente para outbound.
- Message outbound nasce `QUEUED`.
- Message e OutboxEvent sao persistidos na mesma transacao.
- Redis nao e fonte da verdade; jobs podem ser reconstruidos a partir do PostgreSQL.
- Worker nao conhece Evolution diretamente; envio passa pelo `MessagingProviderRegistry`.
- Development Provider nao e fallback silencioso.
- Mensagens `SENT`, `DELIVERED` e `READ` nao sao reenviadas por job duplicado.
- Mensagens `SENDING` antigas nao sao reenviadas automaticamente; exigem reconciliacao ou regra explicita futura.
- Mensagens da mesma Conversation respeitam predecessor guard: posterior aguarda anterior sair de `QUEUED`/`SENDING`.
- Conversas diferentes podem ser processadas em paralelo.
- Erros retryable usam BullMQ attempts/backoff; erros terminais marcam `FAILED`.
- Logs nao devem conter corpo da mensagem, telefone completo, QR, API key, JWT ou secrets.

## Sprint 08.01 - Regras inbound/reconnect

- Resposta inbound de um contato ja conhecido reutiliza o Contact canonico do tenant.
- Resposta inbound em Conversation aberta compativel reutiliza a mesma Conversation.
- Conversation fechada nao e reaberta silenciosamente; uma nova Conversation aberta e criada.
- `externalMessageId` repetido e replay e nao cria Message, nao incrementa unread e nao altera lastMessage.
- `externalMessageId` novo apos reconnect persiste normalmente.
- Reconnect deve preservar `MessagingConnection.id`, `externalReference` e owner identity.
- Webhook Evolution e registrado novamente de forma idempotente quando a connection volta a `CONNECTED`.
- Seed demo e opt-in via `SEED_DEMO_DATA=true`; seed padrao de homologacao nao cria contatos, conversas, mensagens ou connections fake.

## Sprint 08.02 - Homologacao e Contact lifecycle

- Homologacao nao deve continuar em banco inconsistente; reset completo e o fluxo oficial.
- Banco demo e banco de homologacao nao devem se misturar.
- Seed de homologacao e operacionalmente vazio: zero Contacts, Conversations, Messages, Connections e OutboxEvents.
- Contact uniqueness e tenant-scoped por telefone normalizado.
- DELETE de Contact e soft delete para preservar historico.
- Criar Contact com telefone de Contact arquivado restaura o registro existente.
- Criar Contact com telefone de Contact ativo retorna erro canonico claro.
- Mesmo telefone em tenants diferentes e permitido.
