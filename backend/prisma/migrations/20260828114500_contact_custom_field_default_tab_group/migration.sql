UPDATE "contact_custom_fields"
SET "tab_name" = 'Dados Adicionais'
WHERE lower("tab_name") IN ('geral', 'campos adicionais');

UPDATE "contact_custom_fields"
SET "group_name" = ''
WHERE lower("group_name") IN ('dados do contato', 'informações adicionais', 'informacoes adicionais');

ALTER TABLE "contact_custom_fields"
  ALTER COLUMN "tab_name" SET DEFAULT 'Dados Adicionais',
  ALTER COLUMN "group_name" SET DEFAULT '';
