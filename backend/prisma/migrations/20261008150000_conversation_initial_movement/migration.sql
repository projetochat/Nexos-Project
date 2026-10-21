-- Conversations created before the initial-movement fix may have no message
-- timestamp. Their opening time is the canonical first Inbox movement.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

UPDATE "conversations"
SET "lastMessageAt" = "createdAt"
WHERE "lastMessageAt" IS NULL;

COMMIT;
