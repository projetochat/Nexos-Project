INSERT INTO "permissions" ("id", "description")
VALUES
  ('campaigns.read', 'campaigns.read'),
  ('campaigns.create', 'campaigns.create'),
  ('campaigns.update', 'campaigns.update'),
  ('campaigns.schedule', 'campaigns.schedule'),
  ('campaigns.start', 'campaigns.start'),
  ('campaigns.pause', 'campaigns.pause'),
  ('campaigns.cancel', 'campaigns.cancel'),
  ('campaigns.duplicate', 'campaigns.duplicate'),
  ('campaigns.recipients.read', 'campaigns.recipients.read'),
  ('campaigns.manage', 'campaigns.manage')
ON CONFLICT ("id") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'tenant_admin'
  AND p."id" IN (
    'campaigns.read',
    'campaigns.create',
    'campaigns.update',
    'campaigns.schedule',
    'campaigns.start',
    'campaigns.pause',
    'campaigns.cancel',
    'campaigns.duplicate',
    'campaigns.recipients.read',
    'campaigns.manage'
  )
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'supervisor'
  AND p."id" IN (
    'campaigns.read',
    'campaigns.create',
    'campaigns.update',
    'campaigns.schedule',
    'campaigns.duplicate',
    'campaigns.recipients.read'
  )
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'agent'
  AND p."id" IN ('campaigns.read')
ON CONFLICT DO NOTHING;
