ALTER TABLE "messaging_connections"
  RENAME COLUMN "import_history_enabled" TO "importHistoryEnabled";

ALTER TABLE "messaging_connections"
  RENAME COLUMN "import_history_start_date" TO "importHistoryStartDate";

ALTER TABLE "messaging_connections"
  RENAME COLUMN "import_groups_enabled" TO "importGroupsEnabled";

ALTER TABLE "messaging_connections"
  RENAME COLUMN "import_groups_start_date" TO "importGroupsStartDate";
