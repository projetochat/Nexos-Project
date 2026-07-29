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
