INSERT INTO "permissions" ("id", "description", "createdAt")
VALUES
  ('leads.manage', 'Gerenciar atribuicao e ciclo de leads.', CURRENT_TIMESTAMP),
  ('notifications.read', 'Ler notificacoes operacionais do usuario.', CURRENT_TIMESTAMP),
  ('notifications.manage', 'Gerenciar notificacoes operacionais do tenant.', CURRENT_TIMESTAMP),
  ('automations.read', 'Ler regras de automacao do tenant.', CURRENT_TIMESTAMP),
  ('automations.manage', 'Criar, editar e arquivar regras de automacao do tenant.', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "description" = EXCLUDED."description";
