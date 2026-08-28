ALTER TABLE "contact_custom_fields"
  ADD COLUMN "tab_name" TEXT NOT NULL DEFAULT 'Geral',
  ADD COLUMN "group_name" TEXT NOT NULL DEFAULT 'Dados do contato';
