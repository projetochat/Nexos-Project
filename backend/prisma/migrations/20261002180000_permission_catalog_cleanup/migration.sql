-- Migra as concessões das permissões legadas do Perfil de Acesso.
-- As linhas antigas permanecem no catálogo durante a janela de compatibilidade
-- para permitir rollback da aplicação sem perda de autorização. Elas não são
-- expostas pela API, que usa o catálogo canônico definido em código.

INSERT INTO "permissions" ("id", "description") VALUES
  ('messages.send', 'Enviar mensagens e executar ações de envio da conversa'),
  ('conversations.read', 'Visualizar conversas'),
  ('conversations.assign', 'Transferir conversas'),
  ('contacts.read', 'Visualizar contatos'),
  ('contacts.create', 'Criar contatos'),
  ('contacts.update', 'Editar contatos'),
  ('tickets.read', 'Visualizar chamados'),
  ('tickets.create', 'Criar chamados'),
  ('groups.leave', 'Sair de grupos do WhatsApp')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT source."roleId", mapping.target
FROM "role_permissions" source
JOIN (VALUES
  ('chat.audio.send', 'messages.send'),
  ('chat.contacts.create', 'contacts.read'),
  ('chat.contacts.create', 'contacts.create'),
  ('chat.contacts.edit', 'contacts.read'),
  ('chat.contacts.edit', 'contacts.update'),
  ('chat.tickets.create', 'tickets.read'),
  ('chat.tickets.create', 'tickets.create'),
  ('chat.contacts.read', 'contacts.read'),
  ('chat.customer_link.edit', 'contacts.read'),
  ('chat.customer_link.edit', 'contacts.update'),
  ('chat.contacts.block', 'conversations.read'),
  ('chat.contacts.block', 'contacts.read'),
  ('chat.contacts.block', 'contacts.update'),
  ('conversations.manage', 'messages.send'),
  ('conversations.manage', 'conversations.assign'),
  ('groups.update', 'groups.leave')
) AS mapping(source, target) ON mapping.source = source."permissionId"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", 'groups.leave'
FROM "roles" role
WHERE role."key" = 'tenant_admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
