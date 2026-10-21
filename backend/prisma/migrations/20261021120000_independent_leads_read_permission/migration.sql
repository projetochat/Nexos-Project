-- Introduce an independent permission for the Leads queue without changing the
-- effective access of existing profiles. Roles that could previously see leads
-- through conversations.read retain that access.
INSERT INTO "permissions" ("id", "description")
VALUES ('leads.read', 'Visualizar leads')
ON CONFLICT ("id") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT existing."roleId", 'leads.read'
FROM "role_permissions" existing
WHERE existing."permissionId" = 'conversations.read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
