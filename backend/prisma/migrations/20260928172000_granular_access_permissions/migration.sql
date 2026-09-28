WITH permission_ids("id") AS (
  VALUES
    ('dashboard.read'), ('dashboard.manage'), ('dashboard.delete'),
    ('users.delete'), ('departments.delete'), ('roles.delete'),
    ('contacts.read'), ('contacts.manage'), ('contacts.delete'),
    ('connections.delete'), ('groups.read'), ('groups.manage'), ('history.read'),
    ('chat.contacts.create'), ('chat.tags.read'), ('chat.tags.delete'),
    ('chat.quick_replies.delete'),
    ('automations.delete'),
    ('schedules.read'), ('schedules.manage'), ('schedules.delete'),
    ('campaigns.delete'),
    ('bot_flows.read'), ('bot_flows.manage'), ('bot_flows.delete'),
    ('ai_agents.read'), ('ai_agents.manage'), ('ai_agents.delete'),
    ('settings.read'), ('settings.manage'), ('settings.delete'),
    ('tickets.read'), ('tickets.create'), ('tickets.delete'),
    ('chat.conversations.view_all_active')
)
INSERT INTO "permissions" ("id", "description")
SELECT "id", "id" FROM permission_ids
ON CONFLICT ("id") DO NOTHING;

WITH permission_map("newId", "sourceId") AS (
  VALUES
    ('dashboard.read', 'conversations.read'),
    ('dashboard.manage', 'crm.manage'),
    ('dashboard.delete', 'crm.manage'),
    ('users.delete', 'users.manage'),
    ('departments.delete', 'departments.manage'),
    ('roles.delete', 'roles.manage'),
    ('contacts.read', 'crm.read'),
    ('contacts.manage', 'crm.manage'),
    ('contacts.delete', 'crm.manage'),
    ('connections.delete', 'connections.manage'),
    ('groups.read', 'conversations.read'),
    ('groups.manage', 'conversations.manage'),
    ('history.read', 'conversations.read'),
    ('chat.contacts.create', 'crm.manage'),
    ('chat.tags.read', 'chat.tags.use'),
    ('chat.tags.delete', 'chat.tags.manage'),
    ('chat.quick_replies.delete', 'chat.quick_replies.manage'),
    ('automations.delete', 'automations.manage'),
    ('schedules.read', 'automations.read'),
    ('schedules.manage', 'automations.manage'),
    ('schedules.delete', 'automations.manage'),
    ('campaigns.delete', 'campaigns.manage'),
    ('bot_flows.read', 'automations.read'),
    ('bot_flows.manage', 'automations.manage'),
    ('bot_flows.delete', 'automations.manage'),
    ('ai_agents.read', 'automations.read'),
    ('ai_agents.manage', 'automations.manage'),
    ('ai_agents.delete', 'automations.manage'),
    ('settings.read', 'roles.read'),
    ('settings.manage', 'roles.manage'),
    ('settings.delete', 'roles.manage'),
    ('tickets.read', 'tickets.manage'),
    ('tickets.create', 'tickets.manage'),
    ('chat.conversations.view_all_active', 'conversations.read'),
    ('tickets.delete', 'tickets.manage')
)
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT existing."roleId", permission_map."newId"
FROM permission_map
JOIN "role_permissions" existing ON existing."permissionId" = permission_map."sourceId"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Preserve the capabilities of custom profiles that used the older split
-- permissions now represented by a single Create/Edit toggle.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT existing."roleId", 'campaigns.update'
FROM "role_permissions" existing
WHERE existing."permissionId" IN ('campaigns.create', 'campaigns.update', 'campaigns.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT existing."roleId", 'tickets.manage'
FROM "role_permissions" existing
WHERE existing."permissionId" IN (
  'tickets.update',
  'tickets.assign',
  'tickets.status.update',
  'tickets.comment',
  'tickets.attachments.upload',
  'tickets.attachments.delete',
  'tickets.manage'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."key" = 'tenant_admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
