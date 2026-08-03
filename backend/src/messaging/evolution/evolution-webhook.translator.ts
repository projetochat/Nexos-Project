import { Injectable } from "@nestjs/common";
import { MessageStatus, MessageType, MessagingConnectionStatus } from "../../generated/prisma";
import { InboundMessageEvent, MessageStatusEvent } from "../messaging.contracts";
import {
  isGroupRemoteIdentity,
  normalizeRemotePhoneCandidates,
  phoneFromRemoteIdentity,
} from "../messaging-identity";
import type { EvolutionWebhookPayload } from "./evolution.types";

export type EvolutionWebhookTranslation =
  | { kind: "inbound"; event: InboundMessageEvent }
  | { kind: "status"; event: MessageStatusEvent }
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
    if (event === "messages.update" || event === "send.message.update") {
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
    if (isGroupRemoteIdentity(remoteJid)) return { kind: "ignored", reason: "GROUP_MESSAGE" };
    const text =
      readNestedString(data, ["message", "conversation"]) ??
      readNestedString(data, ["message", "extendedTextMessage", "text"]);
    const phone = phoneFromRemoteIdentity(remoteJid) ?? payload.sender;
    if (!externalMessageId || !phone || !text) {
      if (!externalMessageId) return { kind: "ignored", reason: "MISSING_MESSAGE_ID" };
      if (!phone) return { kind: "ignored", reason: "MISSING_REMOTE_IDENTITY" };
      return { kind: "ignored", reason: "INVALID_PAYLOAD" };
    }
    const normalizedPhoneCandidates = normalizeRemotePhoneCandidates(phone);

    return {
      kind: "inbound",
      event: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        externalMessageId,
        sender: {
          phone,
          normalizedPhone: normalizedPhoneCandidates[0],
          displayName: readString(data, "pushName"),
        },
        type: MessageType.TEXT,
        content: text,
        occurredAt: timestamp(payload),
        metadata: {
          displayName: readString(data, "pushName"),
          remoteJid,
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

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
