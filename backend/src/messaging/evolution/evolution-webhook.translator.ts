import { Injectable } from "@nestjs/common";
import { MessageStatus, MessageType, MessagingConnectionStatus } from "../../generated/prisma";
import {
  InboundMessageEvent,
  MessageEditEvent,
  MessageReactionEvent,
  MessageStatusEvent,
} from "../messaging.contracts";
import {
  isGroupRemoteIdentity,
  normalizeRemotePhoneCandidates,
  phoneFromRemoteIdentity,
} from "../messaging-identity";
import type { EvolutionWebhookPayload } from "./evolution.types";

export type EvolutionWebhookTranslation =
  | { kind: "inbound"; event: InboundMessageEvent }
  | { kind: "edit"; event: MessageEditEvent }
  | { kind: "status"; event: MessageStatusEvent }
  | { kind: "reaction"; event: MessageReactionEvent }
  | {
      kind: "connection";
      instanceName: string;
      status: MessagingConnectionStatus;
      qrCodeBase64?: string | null;
      ownerExternalId?: string | null;
      ownerPhoneNormalized?: string | null;
    }
  | { kind: "ignored"; reason: string };

@Injectable()
export class EvolutionWebhookTranslator {
  translate(payload: EvolutionWebhookPayload, connection: { tenantId: string; id: string }) {
    const event = normalizeEvent(payload.event);
    if (!payload.instance) return { kind: "ignored", reason: "MISSING_INSTANCE" } as const;

    if (event === "messages.upsert") {
      return this.translateInbound(payload, connection);
    }
    if (event === "messages.update") {
      const edit = this.translateEdit(payload, connection);
      if (edit.kind === "edit") return edit;
      return this.translateStatus(payload, connection);
    }
    if (event === "send.message.update") {
      return this.translateStatus(payload, connection);
    }
    if (event === "connection.update") {
      const ownerExternalId = ownerJid(payload.data);
      return {
        kind: "connection",
        instanceName: payload.instance,
        status: translateConnectionStatus(readString(payload.data, "state")),
        ownerExternalId,
        ownerPhoneNormalized: normalizeOwnerPhone(ownerExternalId),
      } as const;
    }
    if (event === "qrcode.updated") {
      return {
        kind: "connection",
        instanceName: payload.instance,
        status: MessagingConnectionStatus.CONNECTING,
        qrCodeBase64: readNestedString(payload.data, ["qrcode", "base64"]),
      } as const;
    }
    return { kind: "ignored", reason: "UNSUPPORTED_EVENT" } as const;
  }

  private translateInbound(
    payload: EvolutionWebhookPayload,
    connection: { tenantId: string; id: string },
  ): EvolutionWebhookTranslation {
    const data = payload.data ?? {};
    const key = readRecord(data, "key");
    if (key?.fromMe === true) return { kind: "ignored", reason: "FROM_ME" };

    const externalMessageId = stringValue(key?.id);
    const remoteJid = stringValue(key?.remoteJid);
    const conversationType = isGroupRemoteIdentity(remoteJid) ? "GROUP" : "DIRECT";
    const participantExternalId =
      conversationType === "GROUP"
        ? (stringValue(key?.participant) ?? readString(data, "participant"))
        : remoteJid;
    const participantPhone = phoneFromRemoteIdentity(participantExternalId);
    const participantLid = participantExternalId?.endsWith("@lid") ? participantExternalId : null;
    const rawMessage = readRecord(data, "message");
    const message = unwrapMessage(rawMessage);
    const reaction = extractReaction(message);
    if (reaction) {
      return {
        kind: "reaction",
        event: {
          tenantId: connection.tenantId,
          connectionId: connection.id,
          providerMessageId: reaction.providerMessageId,
          providerReactionId: externalMessageId,
          emoji: reaction.emoji,
          actorExternalId: participantExternalId,
          actorName: readString(data, "pushName"),
          occurredAt: timestamp(payload),
        },
      };
    }
    const content = extractMessageContent(message);
    const media = content.media ? { ...content.media, rawMessage: data } : null;
    const text =
      content.text ??
      content.caption ??
      readNestedString(data, ["message", "conversation"]) ??
      readNestedString(data, ["message", "extendedTextMessage", "text"]);
    const phone =
      conversationType === "GROUP"
        ? (participantPhone ?? payload.sender ?? remoteJid)
        : (phoneFromRemoteIdentity(remoteJid) ?? payload.sender);
    if (
      !externalMessageId ||
      !remoteJid ||
      !phone ||
      (!text && content.type === MessageType.TEXT)
    ) {
      if (!externalMessageId) return { kind: "ignored", reason: "MISSING_MESSAGE_ID" };
      if (!remoteJid || !phone) return { kind: "ignored", reason: "MISSING_REMOTE_IDENTITY" };
      return { kind: "ignored", reason: "INVALID_PAYLOAD" };
    }
    const normalizedPhoneCandidates = normalizeRemotePhoneCandidates(phone);
    const quoted = extractQuoted(message, readRecord(data, "contextInfo"));

    return {
      kind: "inbound",
      event: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        externalMessageId,
        externalChatId: remoteJid,
        conversationType,
        fromMe: false,
        participantExternalId,
        participantPhone,
        participantLid,
        participantName: readString(data, "pushName"),
        sender: {
          phone,
          normalizedPhone: normalizedPhoneCandidates[0],
          displayName: readString(data, "pushName"),
        },
        type: content.type,
        content: text,
        media,
        quotedProviderMessageId: quoted.providerMessageId,
        quotedContentPreview: quoted.preview,
        quotedMessageType: quoted.type,
        occurredAt: timestamp(payload),
        metadata: {
          providerInstanceName: payload.instance,
          displayName:
            conversationType === "GROUP"
              ? (readString(data, "groupSubject") ??
                readString(data, "subject") ??
                readNestedString(data, ["group", "subject"]))
              : readString(data, "pushName"),
          remoteJid,
          profilePictureUrl: extractProfilePictureUrl(data),
          normalizedPhoneCandidates,
        },
      },
    };
  }

  private translateStatus(
    payload: EvolutionWebhookPayload,
    connection: { tenantId: string; id: string },
  ): EvolutionWebhookTranslation {
    const data = payload.data ?? {};
    const key = readRecord(data, "key");
    const providerMessageId = stringValue(key?.id) ?? readString(data, "id");
    const status = translateMessageStatus(readString(data, "status") ?? readString(data, "update"));
    if (!providerMessageId || !status) return { kind: "ignored", reason: "INVALID_PAYLOAD" };

    return {
      kind: "status",
      event: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        providerMessageId,
        status,
        occurredAt: timestamp(payload),
      },
    };
  }

  private translateEdit(
    payload: EvolutionWebhookPayload,
    connection: { tenantId: string; id: string },
  ): EvolutionWebhookTranslation {
    const data = payload.data ?? {};
    const key = readRecord(data, "key");
    const providerMessageId = stringValue(key?.id) ?? readString(data, "id");
    const rawMessage =
      readRecord(data, "message") ??
      readNestedRecord(data, ["update", "message"]) ??
      readRecord(data, "editedMessage");
    const message = unwrapMessage(rawMessage);
    const content = extractMessageContent(message);
    const text = content.text ?? content.caption;
    if (!providerMessageId || !text || content.type !== MessageType.TEXT) {
      return { kind: "ignored", reason: "NOT_EDITED_TEXT" };
    }
    return {
      kind: "edit",
      event: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        providerMessageId,
        content: text,
        occurredAt: timestamp(payload),
      },
    };
  }
}

function extractReaction(message: Record<string, unknown> | null) {
  message = unwrapMessage(message);
  if (!message) return null;
  const reaction = readRecord(message, "reactionMessage");
  if (!reaction) return null;
  const key = readRecord(reaction, "key");
  const providerMessageId = stringValue(key?.id);
  if (!providerMessageId) return null;
  const text = readString(reaction, "text");
  return {
    providerMessageId,
    emoji: text && text.length > 0 ? text : null,
  };
}

function extractMessageContent(message: Record<string, unknown> | null): {
  type: Extract<MessageType, "TEXT" | "IMAGE" | "AUDIO" | "VOICE" | "VIDEO" | "DOCUMENT">;
  text?: string | null;
  caption?: string | null;
  media?: InboundMessageEvent["media"];
} {
  message = unwrapMessage(message);
  if (!message) return { type: MessageType.TEXT };
  const conversation = stringValue(message.conversation);
  if (conversation) return { type: MessageType.TEXT, text: conversation };
  const extended = readRecord(message, "extendedTextMessage");
  const extendedText = readString(extended ?? undefined, "text");
  if (extendedText) return { type: MessageType.TEXT, text: extendedText };
  const image = readRecord(message, "imageMessage");
  if (image) {
    return {
      type: MessageType.IMAGE,
      caption: readString(image, "caption"),
      media: extractMediaEnvelope(image),
    };
  }
  const sticker = readRecord(message, "stickerMessage");
  if (sticker) {
    return {
      type: MessageType.IMAGE,
      caption: "[figurinha]",
      media: extractMediaEnvelope(sticker),
    };
  }
  const document = readRecord(message, "documentMessage");
  if (document) {
    return {
      type: MessageType.DOCUMENT,
      caption: readString(document, "caption"),
      media: extractMediaEnvelope(document),
    };
  }
  const audio = readRecord(message, "audioMessage");
  if (audio) {
    return {
      type: readBoolean(audio, "ptt") ? MessageType.VOICE : MessageType.AUDIO,
      media: extractMediaEnvelope(audio),
    };
  }
  const video = readRecord(message, "videoMessage");
  if (video) {
    return {
      type: MessageType.VIDEO,
      caption: readString(video, "caption"),
      media: extractMediaEnvelope(video),
    };
  }
  return { type: MessageType.TEXT };
}

function extractMediaEnvelope(media: Record<string, unknown>): InboundMessageEvent["media"] {
  return {
    url:
      readString(media, "mediaUrl") ??
      readString(media, "url") ??
      readString(media, "downloadUrl") ??
      readString(media, "directPath"),
    mimetype: readString(media, "mimetype") ?? readString(media, "mimeType"),
    fileName: readString(media, "fileName") ?? readString(media, "title"),
    sizeBytes: numberValue(media.fileLength ?? media.size ?? media.fileSize),
    durationMs: secondsToMs(numberValue(media.seconds ?? media.duration)),
    sha256: readString(media, "fileSha256") ?? readString(media, "mediaKeyTimestamp"),
  };
}

function extractProfilePictureUrl(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  return (
    readString(value, "profilePictureUrl") ??
    readString(value, "profilePicUrl") ??
    readString(value, "profilePicURL") ??
    readString(value, "picture") ??
    readString(value, "avatar") ??
    readNestedString(value, ["contact", "profilePictureUrl"]) ??
    readNestedString(value, ["contact", "profilePicUrl"]) ??
    readNestedString(value, ["sender", "profilePictureUrl"]) ??
    readNestedString(value, ["sender", "profilePicUrl"])
  );
}

function extractQuoted(
  message: Record<string, unknown> | null,
  fallbackContext?: Record<string, unknown> | null,
) {
  message = unwrapMessage(message);
  const context =
    readNestedRecord(message, ["extendedTextMessage", "contextInfo"]) ??
    readNestedRecord(message, ["imageMessage", "contextInfo"]) ??
    readNestedRecord(message, ["audioMessage", "contextInfo"]) ??
    readNestedRecord(message, ["videoMessage", "contextInfo"]) ??
    readNestedRecord(message, ["documentMessage", "contextInfo"]) ??
    readNestedRecord(message, ["stickerMessage", "contextInfo"]) ??
    fallbackContext;
  if (!context) {
    return { providerMessageId: null, preview: null, type: null as MessageType | null };
  }
  const providerMessageId = readString(context, "stanzaId");
  const quotedMessage = readRecord(context, "quotedMessage");
  const quotedContent = extractMessageContent(quotedMessage);
  return {
    providerMessageId,
    preview: quotedContent.text ?? quotedContent.caption ?? mediaPreview(quotedContent.type),
    type: quotedContent.type,
  };
}

function unwrapMessage(message: Record<string, unknown> | null): Record<string, unknown> | null {
  let current = message;
  const wrappers = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "editedMessage",
  ];
  for (let depth = 0; current && depth < 6; depth += 1) {
    const wrapper = firstRecord(current, wrappers);
    const nested = wrapper ? readRecord(wrapper, "message") : null;
    if (!nested) return current;
    current = nested;
  }
  return current;
}

function firstRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readRecord(record, key);
    if (value) return value;
  }
  return null;
}

function mediaPreview(type: MessageType | null) {
  if (type === MessageType.IMAGE) return "[imagem]";
  if (type === MessageType.AUDIO || type === MessageType.VOICE) return "[audio]";
  if (type === MessageType.VIDEO) return "[video]";
  if (type === MessageType.DOCUMENT) return "[documento]";
  return null;
}

function normalizeEvent(event?: string) {
  return event?.replace(/_/g, ".").toLowerCase();
}

function readRecord(value: Record<string, unknown>, key: string) {
  const item = value[key];
  return item && typeof item === "object" ? (item as Record<string, unknown>) : null;
}

function readString(value: Record<string, unknown> | undefined, key: string) {
  if (!value) return null;
  return stringValue(value[key]);
}

function readNestedString(value: Record<string, unknown> | undefined, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return stringValue(current);
}

function readNestedRecord(value: Record<string, unknown> | null | undefined, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current && typeof current === "object" ? (current as Record<string, unknown>) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function secondsToMs(value: number | null) {
  return value && value > 0 ? Math.round(value * 1000) : null;
}

function readBoolean(value: Record<string, unknown> | undefined, key: string) {
  return value?.[key] === true;
}

function phoneFromJid(value: string | null) {
  return phoneFromRemoteIdentity(value);
}

function ownerJid(data: Record<string, unknown> | undefined) {
  return (
    readString(data, "ownerJid") ??
    readNestedString(data, ["instance", "ownerJid"]) ??
    readNestedString(data, ["instance", "owner"]) ??
    readNestedString(data, ["me", "id"]) ??
    readString(data, "owner")
  );
}

function normalizeOwnerPhone(value: string | null) {
  const phone = phoneFromJid(value);
  return phone ? `+${phone}` : null;
}

function isGroupJid(value: string | null) {
  return isGroupRemoteIdentity(value);
}

function timestamp(payload: EvolutionWebhookPayload) {
  const dataTimestamp = Number(payload.data?.messageTimestamp);
  if (Number.isFinite(dataTimestamp) && dataTimestamp > 0) {
    return new Date(dataTimestamp < 10_000_000_000 ? dataTimestamp * 1000 : dataTimestamp);
  }
  const parsed = payload.date_time ? new Date(payload.date_time) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function translateConnectionStatus(value: string | null) {
  const normalized = value?.toLowerCase();
  if (normalized === "open") return MessagingConnectionStatus.CONNECTED;
  if (normalized === "connecting") return MessagingConnectionStatus.CONNECTING;
  if (normalized === "close" || normalized === "closed")
    return MessagingConnectionStatus.DISCONNECTED;
  return MessagingConnectionStatus.ERROR;
}

function translateMessageStatus(value: string | null) {
  const normalized = value?.toLowerCase();
  if (!normalized) return null;
  if (["sent", "server_ack", "pending"].includes(normalized)) return MessageStatus.SENT;
  if (["delivered", "delivery_ack"].includes(normalized)) return MessageStatus.DELIVERED;
  if (["read", "read_ack"].includes(normalized)) return MessageStatus.READ;
  if (["error", "failed"].includes(normalized)) return MessageStatus.FAILED;
  return null;
}
