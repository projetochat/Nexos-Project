ALTER TABLE "quick_replies"
ADD COLUMN "messages" JSONB,
ADD COLUMN "intervalSeconds" INTEGER NOT NULL DEFAULT 0;
