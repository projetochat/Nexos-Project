ALTER TABLE "quick_replies"
  ADD COLUMN "attachmentFileName" TEXT,
  ADD COLUMN "attachmentMimeType" TEXT,
  ADD COLUMN "attachmentSize" INTEGER,
  ADD COLUMN "attachmentDataUrl" TEXT;
