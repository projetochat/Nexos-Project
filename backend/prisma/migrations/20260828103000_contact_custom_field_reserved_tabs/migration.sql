UPDATE "contact_custom_fields"
SET "tab_name" = 'Campos adicionais'
WHERE lower("tab_name") = 'geral';

UPDATE "contact_custom_fields"
SET "group_name" = 'Informações adicionais'
WHERE lower("group_name") = 'dados do contato';

ALTER TABLE "contact_custom_fields"
  ALTER COLUMN "tab_name" SET DEFAULT 'Campos adicionais',
  ALTER COLUMN "group_name" SET DEFAULT 'Informações adicionais';
