-- Compatibilidade da reorganização de permissões do Chat.
-- Primeiro copia concessões antigas para as permissões canônicas; nenhuma
-- concessão existente é removida nesta migração.

INSERT INTO "permissions" ("id", "description") VALUES
  ('messages.send', 'Enviar mensagens e executar ações de envio da conversa'),
  ('contacts.create', 'Criar contatos'),
  ('contacts.update', 'Editar contatos'),
  ('contacts.read', 'Visualizar contatos'),
  ('tickets.create', 'Criar chamados'),
  ('tickets.read', 'Visualizar chamados'),
  ('chat.tags.read', 'Visualizar etiquetas'),
  ('conversations.assign', 'Transferir conversas')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT source."roleId", mapping.target
FROM "role_permissions" source
JOIN (VALUES
  ('chat.audio.send', 'messages.send'),
  ('conversations.manage', 'messages.send'),
  ('conversations.manage', 'conversations.assign'),
  ('chat.contacts.create', 'contacts.create'),
  ('chat.contacts.create', 'contacts.read'),
  ('chat.contacts.edit', 'contacts.update'),
  ('chat.contacts.edit', 'contacts.read'),
  ('chat.customer_link.edit', 'contacts.read'),
  ('chat.contacts.block', 'contacts.read'),
  ('chat.tickets.create', 'tickets.create'),
  ('chat.tickets.create', 'tickets.read'),
  ('chat.tags.use', 'chat.tags.read')
) AS mapping(source, target) ON mapping.source = source."permissionId"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
