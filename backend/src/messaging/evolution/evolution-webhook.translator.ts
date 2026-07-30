import { Injectable } from "@nestjs/common";
import { MessageStatus, MessageType, MessagingConnectionStatus } from "../../generated/prisma";
import { InboundMessageEvent, MessageStatusEvent } from "../messaging.contracts";
import { EvolutionWebhookPayload } from "./evolution.types";

export type EvolutionWebhookTranslation =
  | { kind: "inbound"; event: InboundMessageEvent }
  | { kind: "status"; event: MessageStatusEvent }
  | {
      kind: "connection";
      instanceName: string;
      status: MessagingConnectionStatus;
      qrCodeBase64?: string | null;
    }
  | { kind: "ignored"; reason: string };

@Injectable()
export class EvolutionWebhookTranslator {
  translate(payload: EvolutionWebhookPayload, connection: { tenantId: string; id: string }) {
    const event = normalizeEvent(payload.event);
    if (!payload.instance) return { kind: "ignored", reason: "missing_instance" } as const;

    if (event === "messages.upsert") {
      return this.translateInbound(payload, connection);
    }
    if (event === "messages.update" || event === "send.message.update") {
      return this.translateStatus(payload, connection);
    }
    if (event === "connection.update") {
      return {
        kind: "connection",
        instanceName: payload.instance,
        status: translateConnectionStatus(readString(payload.data, "state")),
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
    return { kind: "ignored", reason: "unknown_event" } as const;
  }

  private translateInbound(
    payload: EvolutionWebhookPayload,
    connection: { tenantId: string; id: string },
  ): EvolutionWebhookTranslation {
    const data = payload.data ?? {};
    const key = readRecord(data, "key");
    if (key?.fromMe === true) return { kind: "ignored", reason: "from_me" };

    const externalMessageId = stringValue(key?.id);
    const remoteJid = stringValue(key?.remoteJid);
    if (isGroupJid(remoteJid)) return { kind: "ignored", reason: "group_message" };
    const text =
      readNestedString(data, ["message", "conversation"]) ??
      readNestedString(data, ["message", "extendedTextMessage", "text"]);
    const phone = phoneFromJid(remoteJid) ?? payload.sender;
    if (!externalMessageId || !phone || !text) {
      return { kind: "ignored", reason: "unsupported_inbound_payload" };
    }

    return {
      kind: "inbound",
      event: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        externalMessageId,
        sender: {
          phone,
          normalizedPhone: phone.startsWith("+") ? phone : `+${phone}`,
          displayName: readString(data, "pushName"),
        },
        type: MessageType.TEXT,
        content: text,
        occurredAt: timestamp(payload),
        metadata: {
          displayName: readString(data, "pushName"),
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
    if (!providerMessageId || !status) return { kind: "ignored", reason: "unsupported_status" };

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
  if (!value) return null;
  if (isGroupJid(value)) return null;
  const [phone] = value.split("@");
  return phone?.replace(/\D/g, "") || null;
}

function isGroupJid(value: string | null) {
  return !!value && value.endsWith("@g.us");
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
