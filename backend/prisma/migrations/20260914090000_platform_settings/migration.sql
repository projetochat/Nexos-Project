CREATE TABLE "platform_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
