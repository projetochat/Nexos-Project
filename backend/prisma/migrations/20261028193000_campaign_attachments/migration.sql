ALTER TYPE "CampaignMessageType" ADD VALUE IF NOT EXISTS 'IMAGE';
ALTER TYPE "CampaignMessageType" ADD VALUE IF NOT EXISTS 'AUDIO';
ALTER TYPE "CampaignMessageType" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "CampaignMessageType" ADD VALUE IF NOT EXISTS 'VIDEO';
CREATE TABLE "campaign_attachments" (
  "campaignId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "snapshot" JSONB,
  CONSTRAINT "campaign_attachments_pkey" PRIMARY KEY ("campaignId"),
  CONSTRAINT "campaign_attachments_tenantId_campaignId_fkey" FOREIGN KEY ("tenantId", "campaignId") REFERENCES "campaigns"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "campaign_attachments_tenantId_idx" ON "campaign_attachments"("tenantId");

CREATE UNIQUE INDEX "campaign_attachments_tenantId_campaignId_key" ON "campaign_attachments"("tenantId", "campaignId");
