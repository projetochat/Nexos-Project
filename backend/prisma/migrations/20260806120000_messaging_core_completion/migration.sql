CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "MessageReactionActorType" AS ENUM ('NEXOS_USER', 'EXTERNAL_PARTICIPANT', 'CONTACT', 'SYSTEM');

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'VOICE';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'CREATED';

ALTER TABLE "conversations"
  ADD COLUMN "conversationType" "ConversationType" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "externalChatId" TEXT,
  ADD COLUMN "externalGroupId" TEXT,
  ADD COLUMN "groupName" TEXT,
  ADD COLUMN "groupImageUrl" TEXT,
  ADD COLUMN "groupSubjectUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "groupMetadataJson" JSONB;

UPDATE "conversations"
SET "conversationType" = CASE WHEN "isGroup" THEN 'GROUP'::"ConversationType" ELSE 'DIRECT'::"ConversationType" END
WHERE "conversationType" IS NULL OR ("isGroup" = true AND "conversationType" = 'DIRECT');

ALTER TABLE "messages"
  ADD COLUMN "providerChatId" TEXT,
  ADD COLUMN "providerParticipantId" TEXT,
  ADD COLUMN "participantName" TEXT,
  ADD COLUMN "participantPhone" TEXT,
  ADD COLUMN "participantLid" TEXT,
  ADD COLUMN "quotedMessageId" TEXT,
  ADD COLUMN "quotedProviderMessageId" TEXT,
  ADD COLUMN "quotedContentPreview" TEXT,
  ADD COLUMN "quotedMessageType" "MessageType",
  ADD COLUMN "mediaStorageKey" TEXT,
  ADD COLUMN "mediaMimeType" TEXT,
  ADD COLUMN "mediaFileName" TEXT,
  ADD COLUMN "mediaSize" INTEGER,
  ADD COLUMN "mediaCaption" TEXT,
  ADD COLUMN "mediaWidth" INTEGER,
  ADD COLUMN "mediaHeight" INTEGER,
  ADD COLUMN "mediaDurationMs" INTEGER,
  ADD COLUMN "mediaChecksum" TEXT,
  ADD COLUMN "mediaSha256" TEXT,
  ADD COLUMN "mediaProviderUrl" TEXT,
  ADD COLUMN "queuedAt" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3);

UPDATE "messages"
SET
  "queuedAt" = CASE WHEN "status" IN ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ') THEN COALESCE("queuedAt", "createdAt") ELSE "queuedAt" END,
  "sentAt" = CASE WHEN "status" IN ('SENT', 'DELIVERED', 'READ') THEN COALESCE("sentAt", "providerAcceptedAt", "updatedAt") ELSE "sentAt" END,
  "deliveredAt" = CASE WHEN "status" IN ('DELIVERED', 'READ') THEN COALESCE("deliveredAt", "updatedAt") ELSE "deliveredAt" END,
  "failedAt" = CASE WHEN "status" = 'FAILED' THEN COALESCE("failedAt", "updatedAt") ELSE "failedAt" END;

CREATE TABLE "conversation_participants" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "externalParticipantId" TEXT NOT NULL,
  "phone" TEXT,
  "lid" TEXT,
  "displayName" TEXT,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message_reactions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "actorType" "MessageReactionActorType" NOT NULL,
  "actorMembershipId" TEXT,
  "externalParticipantId" TEXT,
  "externalParticipantName" TEXT,
  "providerReactionId" TEXT,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messages_tenantId_id_key" ON "messages"("tenantId", "id");
CREATE UNIQUE INDEX "messages_tenantId_connectionId_providerMessageId_key" ON "messages"("tenantId", "connectionId", "providerMessageId");
CREATE INDEX "conversations_tenantId_connectionId_externalChatId_idx" ON "conversations"("tenantId", "connectionId", "externalChatId");
CREATE INDEX "messages_tenantId_providerChatId_idx" ON "messages"("tenantId", "providerChatId");
CREATE INDEX "messages_tenantId_conversationId_status_idx" ON "messages"("tenantId", "conversationId", "status");
CREATE INDEX "messages_tenantId_quotedMessageId_idx" ON "messages"("tenantId", "quotedMessageId");
CREATE UNIQUE INDEX "conversation_participants_tenantId_conversationId_externalParticipantId_key" ON "conversation_participants"("tenantId", "conversationId", "externalParticipantId");
CREATE INDEX "conversation_participants_tenantId_conversationId_idx" ON "conversation_participants"("tenantId", "conversationId");
CREATE INDEX "conversation_participants_tenantId_phone_idx" ON "conversation_participants"("tenantId", "phone");
CREATE INDEX "conversation_participants_tenantId_lid_idx" ON "conversation_participants"("tenantId", "lid");
CREATE UNIQUE INDEX "message_reactions_tenantId_messageId_actorType_actorMembershipId_externalParticipantId_key" ON "message_reactions"("tenantId", "messageId", "actorType", "actorMembershipId", "externalParticipantId");
CREATE INDEX "message_reactions_tenantId_messageId_removedAt_idx" ON "message_reactions"("tenantId", "messageId", "removedAt");
CREATE INDEX "message_reactions_tenantId_providerReactionId_idx" ON "message_reactions"("tenantId", "providerReactionId");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_quotedMessageId_fkey" FOREIGN KEY ("quotedMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_participants"
  ADD CONSTRAINT "conversation_participants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "conversation_participants_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "conversations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_reactions"
  ADD CONSTRAINT "message_reactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "message_reactions_tenantId_messageId_fkey" FOREIGN KEY ("tenantId", "messageId") REFERENCES "messages"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "message_reactions_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
