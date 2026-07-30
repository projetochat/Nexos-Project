INSERT INTO "permissions" ("id", "description")
VALUES
  ('connections.read', 'Visualiza conexoes de mensageria'),
  ('connections.manage', 'Gerencia conexoes de mensageria')
ON CONFLICT ("id") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT "id", 'connections.read'
FROM "roles"
WHERE "key" IN ('tenant_admin', 'supervisor', 'agent')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT "id", 'connections.manage'
FROM "roles"
WHERE "key" IN ('tenant_admin', 'supervisor')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
