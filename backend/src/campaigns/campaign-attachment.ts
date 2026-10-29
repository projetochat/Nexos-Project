import { BadRequestException } from "@nestjs/common";
import { MessageType, Prisma } from "../generated/prisma";
import { QuickReplyAttachmentDto } from "../quick-replies/dto/quick-reply-message.dto";
import {
  resolveMessageType,
  validatePolicy,
} from "../messaging/media/messaging-media-storage.service";

export function campaignAttachmentMessageType(mimeType: string) {
  return resolveMessageType(mimeType, mimeType.startsWith("audio/") ? "audio" : "");
}

export const CAMPAIGN_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export function normalizeCampaignAttachment(value: QuickReplyAttachmentDto | null | undefined) {
  if (value == null) return null;
  const { fileName, mimeType, size, dataUrl } = value;
  const match = /^data:([^,\r\n]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl ?? "");
  const body = match ? Buffer.from(match[2], "base64") : Buffer.alloc(0);
  if (
    !fileName?.trim() ||
    fileName.length > 255 ||
    !match ||
    match[1] !== mimeType ||
    !body.length ||
    body.length !== size ||
    size > CAMPAIGN_ATTACHMENT_MAX_BYTES ||
    body.toString("base64") !== match[2]
  ) {
    throw new BadRequestException("Os dados do arquivo são inválidos ou excedem 10 MB.");
  }
  const type = campaignAttachmentMessageType(mimeType);
  if (
    ![MessageType.IMAGE, MessageType.AUDIO, MessageType.DOCUMENT, MessageType.VIDEO].includes(
      type as never,
    )
  )
    throw new BadRequestException("Campanhas aceitam imagem, áudio, vídeo ou documento.");
  validatePolicy(type, mimeType, size);
  return { fileName, mimeType, size, dataUrl };
}

// Raw, parameterized access avoids selecting a new column from legacy Campaign queries.
// This table is accessed exclusively after the default-off capability gate is enabled.
export async function readCampaignAttachment(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  tenantId: string,
  campaignId: string,
) {
  const rows = await db.$queryRaw<Array<{ payload: QuickReplyAttachmentDto }>>(
    Prisma.sql`SELECT "payload" FROM "campaign_attachments" WHERE "tenantId"=${tenantId} AND "campaignId"=${campaignId}`,
  );
  return normalizeCampaignAttachment(rows[0]?.payload);
}
export async function writeCampaignAttachment(
  db: Pick<Prisma.TransactionClient, "$executeRaw">,
  tenantId: string,
  campaignId: string,
  attachment: QuickReplyAttachmentDto | null,
) {
  if (!attachment) {
    await db.$executeRaw(
      Prisma.sql`DELETE FROM "campaign_attachments" WHERE "tenantId"=${tenantId} AND "campaignId"=${campaignId}`,
    );
    return;
  }
  await db.$executeRaw(
    Prisma.sql`INSERT INTO "campaign_attachments" ("campaignId","tenantId","payload") VALUES (${campaignId},${tenantId},${JSON.stringify(attachment)}::jsonb) ON CONFLICT ("campaignId") DO UPDATE SET "payload"=EXCLUDED."payload" WHERE "campaign_attachments"."tenantId"=EXCLUDED."tenantId"`,
  );
}

export async function freezeCampaignAttachment(
  db: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
  tenantId: string,
  campaignId: string,
  version: number,
  requiresAttachment = false,
) {
  const attachment = await readCampaignAttachment(db, tenantId, campaignId);
  if (requiresAttachment && !attachment)
    throw new BadRequestException("Mídia da campanha indisponível; agendamento/envio bloqueado.");
  const snapshot = JSON.stringify({ version, attachment });
  await db.$executeRaw(
    Prisma.sql`INSERT INTO "campaign_attachments" ("campaignId","tenantId","payload","snapshot") VALUES (${campaignId},${tenantId},${JSON.stringify(attachment)}::jsonb,${snapshot}::jsonb) ON CONFLICT ("campaignId") DO UPDATE SET "snapshot"=EXCLUDED."snapshot" WHERE "campaign_attachments"."tenantId"=EXCLUDED."tenantId"`,
  );
}
export async function readFrozenCampaignAttachment(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  tenantId: string,
  campaignId: string,
  version: number,
) {
  const rows = await db.$queryRaw<
    Array<{ snapshot: { version: number; attachment: QuickReplyAttachmentDto | null } | null }>
  >(
    Prisma.sql`SELECT "snapshot" FROM "campaign_attachments" WHERE "tenantId"=${tenantId} AND "campaignId"=${campaignId}`,
  );
  const snapshot = rows[0]?.snapshot;
  if (!snapshot) return { present: false, attachment: null };
  if (snapshot.version !== version || !Object.hasOwn(snapshot, "attachment"))
    throw new BadRequestException("Snapshot de campanha divergente; envio bloqueado.");
  return { present: true, attachment: normalizeCampaignAttachment(snapshot.attachment) };
}

export async function readCampaignAttachmentMetadata(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  tenantId: string,
  campaignId: string,
) {
  const rows = await db.$queryRaw<Array<{ fileName: string; mimeType: string; size: number }>>(
    Prisma.sql`SELECT "payload"->>'fileName' AS "fileName", "payload"->>'mimeType' AS "mimeType", ("payload"->>'size')::integer AS "size" FROM "campaign_attachments" WHERE "tenantId"=${tenantId} AND "campaignId"=${campaignId} AND "payload" <> 'null'::jsonb`,
  );
  return rows[0] ?? null;
}
