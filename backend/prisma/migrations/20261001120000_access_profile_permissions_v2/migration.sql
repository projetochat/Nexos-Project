-- Re-enable per-profile authorization with the approved CRUD-oriented catalog.
WITH permission_ids("id") AS (
  VALUES
    ('dashboard.create'), ('dashboard.update'),
    ('users.create'), ('users.update'),
    ('departments.create'), ('departments.update'),
    ('roles.create'), ('roles.update'),
    ('contacts.create'), ('contacts.update'), ('contacts.additional_fields.read'),
    ('connections.create'), ('connections.update'),
    ('groups.create'), ('groups.update'),
    ('chat.tickets.create'),
    ('chat.tags.create'), ('chat.tags.update'),
    ('chat.quick_replies.create'), ('chat.quick_replies.update'),
    ('automations.create'), ('automations.update'),
    ('schedules.create'), ('schedules.update'),
    ('bot_flows.create'), ('bot_flows.update'),
    ('ai_agents.create'), ('ai_agents.update')
)
INSERT INTO "permissions" ("id", "description")
SELECT "id", "id" FROM permission_ids
ON CONFLICT ("id") DO NOTHING;

WITH permission_map("newId", "sourceId") AS (
  VALUES
    ('dashboard.create', 'dashboard.manage'), ('dashboard.update', 'dashboard.manage'),
    ('users.create', 'users.manage'), ('users.update', 'users.manage'),
    ('departments.create', 'departments.manage'), ('departments.update', 'departments.manage'),
    ('roles.create', 'roles.manage'), ('roles.update', 'roles.manage'),
    ('contacts.read', 'crm.read'),
    ('contacts.additional_fields.read', 'crm.read'),
    ('contacts.create', 'crm.manage'), ('contacts.update', 'crm.manage'),
    ('contacts.delete', 'crm.manage'),
    ('contacts.create', 'contacts.manage'), ('contacts.update', 'contacts.manage'),
    ('connections.create', 'connections.manage'), ('connections.update', 'connections.manage'),
    ('groups.create', 'groups.manage'), ('groups.update', 'groups.manage'),
    ('conversations.read', 'chat.leads.read'), ('conversations.manage', 'leads.manage'),
    ('chat.tickets.create', 'tickets.create'), ('chat.tickets.create', 'tickets.manage'),
    ('chat.tags.create', 'chat.tags.manage'), ('chat.tags.update', 'chat.tags.manage'),
    ('chat.quick_replies.create', 'chat.quick_replies.manage'),
    ('chat.quick_replies.update', 'chat.quick_replies.manage'),
    ('automations.create', 'automations.manage'), ('automations.update', 'automations.manage'),
    ('schedules.create', 'schedules.manage'), ('schedules.update', 'schedules.manage'),
    ('bot_flows.create', 'bot_flows.manage'), ('bot_flows.update', 'bot_flows.manage'),
    ('ai_agents.create', 'ai_agents.manage'), ('ai_agents.update', 'ai_agents.manage'),
    ('settings.manage', 'settings.read'), ('settings.manage', 'settings.delete'),
    ('campaigns.update', 'campaigns.schedule'), ('campaigns.update', 'campaigns.start'),
    ('campaigns.update', 'campaigns.pause'), ('campaigns.update', 'campaigns.cancel'),
    ('campaigns.update', 'campaigns.duplicate'), ('campaigns.read', 'campaigns.recipients.read'),
    ('campaigns.create', 'campaigns.manage'), ('campaigns.update', 'campaigns.manage'),
    ('campaigns.delete', 'campaigns.manage'),
    ('tickets.update', 'tickets.assign'), ('tickets.update', 'tickets.status.update'),
    ('tickets.update', 'tickets.comment'), ('tickets.update', 'tickets.attachments.upload'),
    ('tickets.update', 'tickets.attachments.delete'),
    ('tickets.create', 'tickets.manage'), ('tickets.update', 'tickets.manage'),
    ('tickets.delete', 'tickets.manage')
)
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT existing."roleId", permission_map."newId"
FROM permission_map
JOIN "role_permissions" existing ON existing."permissionId" = permission_map."sourceId"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Every tenant receives the idempotent initial department used by the Atendente profile.
INSERT INTO "departments" (
  "id", "tenantId", "name", "description", "color", "active", "createdAt", "updatedAt"
)
SELECT
  tenant."id" || ':atendimento', tenant."id", 'Atendimento',
  'Departamento padrão de atendimento.', '#3B82F6', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" tenant
ON CONFLICT ("tenantId", "name") DO UPDATE SET "active" = true;

-- Existing system Atendente profiles receive the same minimal seed as new tenants.
DELETE FROM "role_permissions"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "key" = 'agent');

WITH agent_permissions("id") AS (
  VALUES
    ('dashboard.read'), ('conversations.read'), ('chat.contacts.edit'),
    ('chat.contacts.create'), ('messages.send'), ('chat.messages.edit'),
    ('chat.messages.delete'), ('chat.agent_name.show'), ('chat.audio.send'),
    ('chat.tickets.create'), ('conversations.assign'), ('conversations.manage'),
    ('chat.contacts.read'), ('chat.phone.read'), ('chat.customer_link.edit'),
    ('chat.tags.use'), ('chat.contacts.block'), ('chat.conversations.view_all_active'),
    ('history.read')
)
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", agent_permissions."id"
FROM "roles" role
CROSS JOIN agent_permissions
WHERE role."key" = 'agent'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

UPDATE "roles" role
SET "metadata" = COALESCE(role."metadata", '{}'::jsonb) || jsonb_build_object(
  'departmentIds', jsonb_build_array(department."id")
)
FROM "departments" department
WHERE role."key" = 'agent'
  AND department."tenantId" = role."tenantId"
  AND department."name" = 'Atendimento';

-- Administrators retain the complete approved catalog.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."key" = 'tenant_admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Remove only superseded catalog rows after all grants have been translated.
DELETE FROM "permissions"
WHERE "id" IN (
  'dashboard.manage', 'users.manage', 'departments.manage', 'roles.manage',
  'crm.read', 'crm.manage', 'contacts.manage', 'connections.manage', 'groups.manage',
  'chat.leads.read', 'leads.manage', 'notifications.read', 'notifications.manage',
  'chat.tags.manage', 'chat.quick_replies.manage', 'automations.manage',
  'schedules.manage', 'bot_flows.manage', 'ai_agents.manage',
  'settings.read', 'settings.delete',
  'campaigns.schedule', 'campaigns.start', 'campaigns.pause', 'campaigns.cancel',
  'campaigns.duplicate', 'campaigns.recipients.read', 'campaigns.manage',
  'tickets.assign', 'tickets.status.update', 'tickets.comment',
  'tickets.attachments.upload', 'tickets.attachments.delete', 'tickets.manage'
);
