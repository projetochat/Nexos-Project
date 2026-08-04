import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { PrismaClient, TicketAttachmentStatus } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();
const localRoot = resolve(process.env.NEXOS_STORAGE_LOCAL_PATH ?? ".nexos-storage");
const shouldClean = process.argv.includes("--clean");
const maxPendingAgeMinutes = Number(process.env.NEXOS_ATTACHMENT_PENDING_MAX_MINUTES ?? 60);

try {
  const cutoff = new Date(Date.now() - maxPendingAgeMinutes * 60 * 1000);
  const attachments = await prisma.ticketAttachment.findMany({
    where: {
      deletedAt: null,
      OR: [{ status: TicketAttachmentStatus.PENDING }, { status: TicketAttachmentStatus.READY }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      ticketId: true,
      tenantId: true,
      status: true,
      storageProvider: true,
      objectKey: true,
      createdAt: true,
    },
  });

  const rows = [];
  for (const attachment of attachments) {
    const objectExists =
      attachment.storageProvider === "local" && objectExistsLocal(attachment.objectKey);
    const oldPending =
      attachment.status === TicketAttachmentStatus.PENDING && attachment.createdAt < cutoff;
    const missingReady = attachment.status === TicketAttachmentStatus.READY && !objectExists;
    const recommendedAction = oldPending || missingReady ? "mark_deleted" : "none";
    rows.push({
      attachmentId: attachment.id,
      ticketId: attachment.ticketId,
      status: attachment.status,
      objectExists,
      ageMinutes: Math.round((Date.now() - attachment.createdAt.getTime()) / 60000),
      objectKeyHash: hashObjectKey(attachment.objectKey),
      recommendedAction,
    });

    if (shouldClean && recommendedAction === "mark_deleted") {
      await prisma.ticketAttachment.update({
        where: { tenantId_id: { tenantId: attachment.tenantId, id: attachment.id } },
        data: { status: TicketAttachmentStatus.DELETED, deletedAt: new Date() },
      });
    }
  }

  console.log(JSON.stringify({ cleanApplied: shouldClean, items: rows }, null, 2));
} finally {
  await prisma.$disconnect();
}

function objectExistsLocal(objectKey) {
  if (objectKey.includes("..") || objectKey.includes("\\") || objectKey.startsWith("/"))
    return false;
  const path = resolve(localRoot, objectKey);
  if (!path.startsWith(`${localRoot}${sep}`)) return false;
  try {
    return statSync(path).isFile() && existsSync(path);
  } catch {
    return false;
  }
}

function hashObjectKey(objectKey) {
  return createHash("sha256").update(objectKey).digest("hex").slice(0, 12);
}
