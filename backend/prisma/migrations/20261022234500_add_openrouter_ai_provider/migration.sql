BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'OPENROUTER';

COMMIT;
