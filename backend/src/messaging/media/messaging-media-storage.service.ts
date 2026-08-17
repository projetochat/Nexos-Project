import {
  BadRequestException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import type { Request } from "express";
import { MessageType } from "../../generated/prisma";

export type StoredMessagingMedia = {
  objectKey: string;
  body: Buffer;
  checksum: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
};

@Injectable()
export class MessagingMediaStorageService {
  readonly provider = storageProvider();
  private readonly root = resolve(process.env.NEXOS_MESSAGE_STORAGE_LOCAL_PATH ?? ".nexos-storage");

  async storeUpload(input: { tenantId: string; conversationId: string; req: Request }): Promise<
    StoredMessagingMedia & {
      messageType: MessageType;
      caption: string | null;
      durationMs: number | null;
    }
  > {
    if (this.provider !== "local") {
      throw new ServiceUnavailableException("Storage externo de mensagens nao configurado.");
    }
    const declaredMimeType = header(input.req, "content-type").split(";")[0].trim().toLowerCase();
    const declaredSize = Number(
      header(input.req, "x-file-size") || input.req.headers["content-length"] || 0,
    );
    const fileName = sanitizeFileName(decodeHeader(input.req.headers["x-file-name"]) ?? "arquivo");
    const messageType = resolveMessageType(declaredMimeType, header(input.req, "x-media-type"));
    validatePolicy(messageType, declaredMimeType, Number.isFinite(declaredSize) ? declaredSize : 0);
    const body = await readLimitedRequest(input.req, maxSizeBytes(messageType));
    validatePolicy(messageType, declaredMimeType, body.byteLength);
    const detected = detectMimeType(body, declaredMimeType);
    if (detected && detected !== declaredMimeType) {
      throw new UnsupportedMediaTypeException({
        statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        code: "MESSAGE_MEDIA_MIME_MISMATCH",
        message: "Tipo real do arquivo nao confere com o declarado.",
      });
    }
    const checksum = createHash("sha256").update(body).digest("hex");
    const objectKey = `tenants/${input.tenantId}/messages/${input.conversationId}/${randomUUID()}/${fileName}`;
    await this.writeObject(objectKey, body);
    return {
      objectKey,
      body,
      checksum,
      mimeType: declaredMimeType,
      fileName,
      sizeBytes: body.byteLength,
      messageType,
      caption: decodeHeader(input.req.headers["x-caption"])?.trim() || null,
      durationMs: positiveInt(header(input.req, "x-duration-ms")),
    };
  }

  async storeDownloaded(input: {
    tenantId: string;
    conversationId: string;
    body: Buffer;
    mimeType: string;
    fileName?: string | null;
    messageType: MessageType;
  }) {
    const mimeType = normalizeMimeType(input.mimeType);
    validatePolicy(input.messageType, mimeType, input.body.byteLength);
    const detected = detectMimeType(input.body, mimeType);
    if (detected && detected !== mimeType) {
      throw new UnsupportedMediaTypeException("Tipo real do arquivo recebido nao confere.");
    }
    const checksum = createHash("sha256").update(input.body).digest("hex");
    const fileName = sanitizeFileName(input.fileName ?? `media-${randomUUID()}`);
    const objectKey = `tenants/${input.tenantId}/messages/${input.conversationId}/${randomUUID()}/${fileName}`;
    await this.writeObject(objectKey, input.body);
    return {
      objectKey,
      checksum,
      mimeType,
      fileName,
      sizeBytes: input.body.byteLength,
    };
  }

  async readObject(objectKey: string) {
    return fs.readFile(this.pathFor(objectKey));
  }

  async deleteObject(objectKey: string) {
    await fs.rm(this.pathFor(objectKey), { force: true });
  }

  private async writeObject(objectKey: string, body: Buffer) {
    const path = this.pathFor(objectKey);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body, { flag: "wx" });
  }

  private pathFor(objectKey: string) {
    if (objectKey.includes("..") || objectKey.includes("\\") || objectKey.startsWith("/")) {
      throw new BadRequestException("Storage key invalida.");
    }
    const path = resolve(this.root, objectKey);
    if (!path.startsWith(`${this.root}${sep}`))
      throw new BadRequestException("Storage key invalida.");
    return path;
  }
}

async function readLimitedRequest(req: Request, limitBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > limitBytes) {
      throw new PayloadTooLargeException("Arquivo excede o limite permitido.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function storageProvider() {
  const value = (process.env.NEXOS_MESSAGE_STORAGE_PROVIDER ?? "local").toLowerCase();
  return value === "s3" || value === "r2" ? value : "local";
}

function validatePolicy(type: MessageType, mimeType: string, sizeBytes: number) {
  const allowed = allowedMimeTypes(type);
  if (!allowed.has(mimeType))
    throw new UnsupportedMediaTypeException("Tipo de midia nao permitido.");
  if (sizeBytes > maxSizeBytes(type))
    throw new PayloadTooLargeException("Arquivo excede o limite permitido.");
}

function allowedMimeTypes(type: MessageType) {
  if (type === MessageType.IMAGE)
    return envSet("NEXOS_MESSAGE_ALLOWED_IMAGE_MIME_TYPES", "image/jpeg,image/png,image/webp");
  if (type === MessageType.DOCUMENT) {
    return envSet(
      "NEXOS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES",
      "application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }
  if (type === MessageType.VIDEO) {
    return envSet("NEXOS_MESSAGE_ALLOWED_VIDEO_MIME_TYPES", "video/mp4,video/3gpp,video/webm");
  }
  return envSet(
    "NEXOS_MESSAGE_ALLOWED_AUDIO_MIME_TYPES",
    "audio/ogg,audio/mpeg,audio/mp4,audio/webm",
  );
}

function maxSizeBytes(type: MessageType) {
  const key =
    type === MessageType.IMAGE
      ? "NEXOS_MESSAGE_MAX_IMAGE_SIZE_MB"
      : type === MessageType.VIDEO
        ? "NEXOS_MESSAGE_MAX_VIDEO_SIZE_MB"
        : type === MessageType.DOCUMENT
          ? "NEXOS_MESSAGE_MAX_DOCUMENT_SIZE_MB"
          : "NEXOS_MESSAGE_MAX_AUDIO_SIZE_MB";
  return (
    Number(
      process.env[key] ??
        (type === MessageType.DOCUMENT
          ? 25
          : type === MessageType.IMAGE
            ? 8
            : type === MessageType.VIDEO
              ? 32
              : 16),
    ) *
    1024 *
    1024
  );
}

function envSet(key: string, fallback: string) {
  return new Set(
    (process.env[key] ?? fallback)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function resolveMessageType(mimeType: string, explicit: string) {
  const normalized = explicit.toLowerCase();
  if (normalized === "voice") return MessageType.VOICE;
  if (normalized === "audio") return MessageType.AUDIO;
  if (normalized === "image") return MessageType.IMAGE;
  if (normalized === "video") return MessageType.VIDEO;
  if (normalized === "document") return MessageType.DOCUMENT;
  if (mimeType.startsWith("image/")) return MessageType.IMAGE;
  if (mimeType.startsWith("video/")) return MessageType.VIDEO;
  if (mimeType.startsWith("audio/")) return MessageType.VOICE;
  return MessageType.DOCUMENT;
}

function detectMimeType(body: Buffer, declaredMimeType: string) {
  if (body.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (
    body.subarray(0, 4).toString("ascii") === "RIFF" &&
    body.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (body.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (body.subarray(0, 3).toString("ascii") === "ID3") return "audio/mpeg";
  if (body.subarray(4, 8).toString("ascii") === "ftyp") {
    if (declaredMimeType === "audio/mp4") return "audio/mp4";
    if (declaredMimeType === "video/mp4") return "video/mp4";
    return declaredMimeType;
  }
  if (declaredMimeType === "text/plain") return "text/plain";
  return null;
}

function sanitizeFileName(value: string) {
  return (
    value
      .replace(/[\\/:*?"<>|\r\n]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "arquivo"
  );
}

function decodeHeader(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function header(req: Request, name: string) {
  const value = req.headers[name.toLowerCase()];
  return String(Array.isArray(value) ? value[0] : (value ?? ""));
}

function positiveInt(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}
