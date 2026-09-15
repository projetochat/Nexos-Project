ALTER TABLE "messaging_connections"
  ADD COLUMN "import_history_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "import_history_start_date" TIMESTAMP(3),
  ADD COLUMN "import_groups_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "import_groups_start_date" TIMESTAMP(3);
