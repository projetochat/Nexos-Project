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
