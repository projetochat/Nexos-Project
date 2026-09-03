import { Injectable } from "@nestjs/common";
import { MessagingErrorCode, MessagingProviderError } from "../messaging.contracts";
import { assertEvolutionConfigured, evolutionConfigFromEnv } from "./evolution.config";
import { classifyEvolutionProviderError } from "./evolution-provider-error.classifier";
import {
  EvolutionConnectionStateResponse,
  EvolutionContact,
  EvolutionCreateInstanceResponse,
  EvolutionProfilePictureResponse,
  EvolutionInstance,
  EvolutionSendTextResponse,
} from "./evolution.types";
import type { EvolutionMediaKind, EvolutionQuotedKey } from "./evolution-outbound-payload.factory";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

@Injectable()
export class EvolutionClient {
  async health() {
    const config = evolutionConfigFromEnv();
    if (!assertEvolutionConfigured(config)) return { ok: false, configured: false };
    try {
      const instances = await this.fetchInstances();
      return { ok: true, configured: true, instanceCount: instances.length };
    } catch (error) {
      if (error instanceof MessagingProviderError) {
        return {
          ok: false,
          configured: true,
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        };
      }
      return { ok: false, configured: true, code: MessagingErrorCode.PROVIDER_UNAVAILABLE };
    }
  }

  createInstance(input: { instanceName: string }) {
    return this.request<EvolutionCreateInstanceResponse>("/instance/create", {
      method: "POST",
      body: {
        instanceName: input.instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      },
    });
  }

  connect(instanceName: string) {
    return this.request<EvolutionCreateInstanceResponse>(`/instance/connect/${instanceName}`);
  }

  connectionState(instanceName: string) {
    return this.request<EvolutionConnectionStateResponse>(
      `/instance/connectionState/${instanceName}`,
    );
  }

  logout(instanceName: string) {
    return this.request<unknown>(`/instance/logout/${instanceName}`, { method: "DELETE" });
  }

  deleteInstance(instanceName: string) {
    return this.request<unknown>(`/instance/delete/${instanceName}`, { method: "DELETE" });
  }

  async fetchInstances(instanceName?: string) {
    const query = instanceName ? `?instanceName=${encodeURIComponent(instanceName)}` : "";
    const response = await this.request<EvolutionInstance[] | { value?: EvolutionInstance[] }>(
      `/instance/fetchInstances${query}`,
    );
    return Array.isArray(response) ? response : (response.value ?? []);
  }

  async findInstance(instanceName: string) {
    const instances = await this.fetchInstances(instanceName).catch((error) => {
      if (
        error instanceof MessagingProviderError &&
        error.code === MessagingErrorCode.PROVIDER_UNAVAILABLE &&
        !error.retryable &&
        (error.httpStatus === 404 || error.message.toLowerCase().includes("not found"))
      ) {
        return [];
      }
      throw error;
    });
    return (
      instances.find(
        (instance) => instance.name === instanceName || instance.instanceName === instanceName,
      ) ?? null
    );
  }

  setWebhook(input: { instanceName: string; webhookUrl: string; webhookSecret?: string | null }) {
    return this.request<unknown>(`/webhook/set/${input.instanceName}`, {
      method: "POST",
      body: {
        webhook: {
          enabled: true,
          url: input.webhookUrl,
          byEvents: false,
          base64: false,
          headers: input.webhookSecret ? { jwt_key: input.webhookSecret } : undefined,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "SEND_MESSAGE_UPDATE",
            "QRCODE_UPDATED",
            "CONNECTION_UPDATE",
          ],
        },
      },
    });
  }

  sendText(input: {
    instanceName: string;
    payload: {
      number?: string;
      text?: string;
      quoted?: { key: EvolutionQuotedKey };
    };
  }) {
    return this.request<EvolutionSendTextResponse>(`/message/sendText/${input.instanceName}`, {
      method: "POST",
      body: input.payload,
    });
  }

  sendMedia(input: {
    instanceName: string;
    payload: {
      number?: string;
      mediatype?: EvolutionMediaKind;
      mimetype?: string;
      fileName?: string;
      caption?: string;
      quoted?: { key: EvolutionQuotedKey };
    };
    media: Buffer;
    mimeType: string;
    fileName: string;
  }) {
    const form = new FormData();
    for (const [key, value] of Object.entries(input.payload)) {
      if (value === undefined) continue;
      form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    form.set("file", new Blob([input.media], { type: input.mimeType }), input.fileName);
    return this.requestForm<EvolutionSendTextResponse>(
      `/message/sendMedia/${input.instanceName}`,
      form,
    );
  }

  sendAudio(input: {
    instanceName: string;
    payload: { number?: string; quoted?: { key: EvolutionQuotedKey } };
    media: Buffer;
    mimeType: string;
    fileName: string;
  }) {
    const form = new FormData();
    for (const [key, value] of Object.entries(input.payload)) {
      if (value === undefined) continue;
      form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    form.set("file", new Blob([input.media], { type: input.mimeType }), input.fileName);
    return this.requestForm<EvolutionSendTextResponse>(
      `/message/sendWhatsAppAudio/${input.instanceName}`,
      form,
    );
  }

  sendReaction(input: {
    instanceName: string;
    payload: { key?: EvolutionQuotedKey; reaction?: string };
  }) {
    return this.request<EvolutionSendTextResponse>(`/message/sendReaction/${input.instanceName}`, {
      method: "POST",
      body: input.payload,
    });
  }

  async createGroup(input: { instanceName: string; subject: string; participants: string[] }) {
    const response = await this.request<unknown>(`/group/create/${input.instanceName}`, {
      method: "POST",
      body: {
        subject: input.subject,
        participants: input.participants,
      },
    });
    return { groupJid: extractGroupJid(response) };
  }

  async fetchGroups(input: { instanceName: string }) {
    const response = await this.request<unknown>(
      `/group/fetchAllGroups/${input.instanceName}?getParticipants=true`,
    );
    return extractGroups(response);
  }

  async findGroupInfo(input: { instanceName: string; groupJid: string }) {
    const response = await this.request<unknown>(
      `/group/findGroupInfos/${input.instanceName}?groupJid=${encodeURIComponent(input.groupJid)}`,
    );
    return extractGroupInfo(response);
  }

  async findContacts(input: { instanceName: string }) {
    const response = await this.request<unknown>(`/chat/findContacts/${input.instanceName}`, {
      method: "POST",
      body: { where: {} },
    });
    return extractContacts(response);
  }

  async fetchProfilePictureUrl(input: {
    instanceName: string;
    number: string;
  }): Promise<string | null> {
    const response = await this.request<EvolutionProfilePictureResponse | unknown>(
      `/chat/fetchProfilePictureUrl/${input.instanceName}`,
      {
        method: "POST",
        body: { number: input.number },
      },
    );
    return extractProfilePictureUrl(response);
  }

  async getBase64FromMediaMessage(input: {
    instanceName: string;
    message: unknown;
  }): Promise<{ body: Buffer; mimeType?: string | null; fileName?: string | null }> {
    const endpoint = `/chat/getBase64FromMediaMessage/${input.instanceName}`;
    const payloads = [
      { message: input.message },
      { message: input.message, convertToMp4: false },
      input.message,
    ];
    let lastError: unknown;
    for (const payload of payloads) {
      try {
        const response = await this.request<unknown>(endpoint, { method: "POST", body: payload });
        const extracted = extractBase64Media(response);
        if (extracted) return extracted;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new MessagingProviderError(
      MessagingErrorCode.MEDIA_DOWNLOAD_FAILED,
      "Evolution did not return downloadable media.",
      true,
    );
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.fetchJson(path, {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  private async requestForm<T>(path: string, body: FormData): Promise<T> {
    return this.fetchJson(path, { method: "POST", body });
  }

  private async fetchJson<T>(
    path: string,
    options: { method: string; headers?: Record<string, string>; body?: RequestInit["body"] },
  ): Promise<T> {
    const config = evolutionConfigFromEnv();
    if (!assertEvolutionConfigured(config)) {
      throw new MessagingProviderError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Evolution API is not configured.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}${path}`, {
        method: options.method,
        headers: {
          apikey: config.apiKey,
          ...(options.headers ?? {}),
        },
        body: options.body,
        signal: controller.signal,
      });

      const data = await readJson(response);
      if (!response.ok) {
        throw classifyEvolutionProviderError({
          status: response.status,
          statusText: response.statusText,
          data,
          endpointPath: path,
          method: options.method,
        });
      }
      return data as T;
    } catch (error) {
      if (error instanceof MessagingProviderError) throw error;
      if ((error as { name?: string }).name === "AbortError") {
        throw classifyEvolutionProviderError({
          timeout: true,
          endpointPath: path,
          method: options.method,
        });
      }
      throw classifyEvolutionProviderError({
        code: (error as { code?: string }).code,
        cause: error,
        endpointPath: path,
        method: options.method,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readJson(response: Response) {
  if (typeof response.text !== "function") {
    try {
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractGroupInfo(value: unknown): {
  subject?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  createdAt?: Date | null;
  participants?: Array<{
    externalParticipantId: string;
    phone?: string | null;
    displayName?: string | null;
    isAdmin: boolean;
    isSuperAdmin: boolean;
  }>;
} | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const snapshot = extractGroupSnapshot(record);
  if (snapshot) return { ...snapshot, name: snapshot.subject };
  const subject =
    stringField(record, "subject") ??
    stringField(record, "name") ??
    stringField(record, "groupName") ??
    stringField(record, "title");
  if (subject) {
    return {
      subject,
      name: subject,
      imageUrl:
        stringField(record, "pictureUrl") ??
        stringField(record, "profilePictureUrl") ??
        stringField(record, "picture") ??
        stringField(record, "imageUrl"),
      createdAt: dateField(record, "creation") ?? dateField(record, "createdAt"),
      participants: groupParticipantsFromRecord(record),
    };
  }
  for (const nested of Object.values(record)) {
    const info = extractGroupInfo(nested);
    if (info) return info;
  }
  return null;
}

function extractGroupJid(value: unknown): string | null {
  if (typeof value === "string") return value.endsWith("@g.us") ? value : null;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const jid =
    stringField(record, "id") ??
    stringField(record, "gid") ??
    stringField(record, "jid") ??
    stringField(record, "groupJid") ??
    stringField(record, "remoteJid");
  if (jid?.endsWith("@g.us")) return jid;
  for (const nested of Object.values(record)) {
    const nestedJid = extractGroupJid(nested);
    if (nestedJid) return nestedJid;
  }
  return null;
}

function extractGroups(value: unknown): Array<{
  groupJid: string;
  subject: string;
  imageUrl?: string | null;
  createdAt?: Date | null;
  participants: Array<{
    externalParticipantId: string;
    phone?: string | null;
    displayName?: string | null;
    isAdmin: boolean;
    isSuperAdmin: boolean;
  }>;
}> {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? ((value as Record<string, unknown>).groups ??
        (value as Record<string, unknown>).data ??
        (value as Record<string, unknown>).value)
      : null;
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => extractGroupSnapshot(item))
    .filter((item): item is NonNullable<ReturnType<typeof extractGroupSnapshot>> => Boolean(item));
}

function extractContacts(value: unknown): EvolutionContact[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? ((value as Record<string, unknown>).contacts ??
        (value as Record<string, unknown>).data ??
        (value as Record<string, unknown>).value)
      : null;
  if (!Array.isArray(source)) return [];
  return source
    .map((item): EvolutionContact | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id =
        stringField(record, "id") ??
        stringField(record, "remoteJid") ??
        stringField(record, "jid") ??
        phoneStringField(record, "number");
      const number =
        phoneStringField(record, "number") ??
        phoneStringField(record, "phone") ??
        phoneStringField(record, "waId") ??
        phoneStringField(record, "wuid") ??
        (id && looksLikeWhatsappPhoneIdentifier(id) ? phoneFromParticipant(id) : null);
      if (!id && !number) return null;
      return {
        id: id ?? undefined,
        remoteJid: stringField(record, "remoteJid") ?? id ?? undefined,
        pushName: stringField(record, "pushName"),
        name: stringField(record, "name"),
        verifiedName: stringField(record, "verifiedName"),
        notify: stringField(record, "notify"),
        contactName: stringField(record, "contactName"),
        shortName: stringField(record, "shortName"),
        displayName: stringField(record, "displayName"),
        profileName: stringField(record, "profileName"),
        number,
        profilePictureUrl:
          stringField(record, "profilePictureUrl") ??
          stringField(record, "profilePicUrl") ??
          stringField(record, "pictureUrl") ??
          stringField(record, "picture") ??
          stringField(record, "imageUrl"),
        isGroup: record.isGroup === true || stringField(record, "type") === "group",
      };
    })
    .filter((item): item is EvolutionContact => Boolean(item));
}

function looksLikeWhatsappPhoneIdentifier(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("@s.whatsapp.net") || lower.includes("@c.us")) return true;
  if (lower.includes("@")) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function extractGroupSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const groupJid = extractGroupJid(record);
  if (!groupJid) return null;
  const subject =
    stringField(record, "subject") ??
    stringField(record, "name") ??
    stringField(record, "groupName") ??
    "Grupo WhatsApp";
  return {
    groupJid,
    subject,
    imageUrl:
      stringField(record, "pictureUrl") ??
      stringField(record, "profilePictureUrl") ??
      stringField(record, "picture") ??
      stringField(record, "imageUrl"),
    createdAt: dateField(record, "creation") ?? dateField(record, "createdAt"),
    participants: groupParticipantsFromRecord(record),
  };
}

function groupParticipantsFromRecord(record: Record<string, unknown>) {
  return extractGroupParticipants(
    record.participants ??
      record.participantsList ??
      record.participantList ??
      record.members ??
      record.users,
  );
}

function extractGroupParticipants(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];
  return source
    .map((participant) => {
      if (!participant || typeof participant !== "object") return null;
      const record = participant as Record<string, unknown>;
      const id =
        stringField(record, "id") ??
        stringField(record, "jid") ??
        stringField(record, "remoteJid") ??
        stringField(record, "participant") ??
        stringField(record, "phone") ??
        stringField(record, "number");
      if (!id) return null;
      const admin = stringField(record, "admin");
      const phone = phoneFromParticipant(
        stringField(record, "phone") ?? stringField(record, "number") ?? id,
      );
      return {
        externalParticipantId: id,
        phone,
        displayName:
          stringField(record, "name") ??
          stringField(record, "pushName") ??
          stringField(record, "notify") ??
          stringField(record, "verifiedName"),
        isAdmin: admin === "admin" || admin === "superadmin" || record.isAdmin === true,
        isSuperAdmin: admin === "superadmin" || record.isSuperAdmin === true,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function dateField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value < 10000000000 ? value * 1000 : value);
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function phoneFromParticipant(value: string) {
  const phone = value.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
  return phone || null;
}

function extractProfilePictureUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const url =
    stringField(record, "profilePictureUrl") ??
    stringField(record, "picture") ??
    stringField(record, "url");
  if (url) return url;
  for (const nested of Object.values(record)) {
    const nestedUrl = extractProfilePictureUrl(nested);
    if (nestedUrl) return nestedUrl;
  }
  return null;
}

function extractBase64Media(
  value: unknown,
): { body: Buffer; mimeType?: string | null; fileName?: string | null } | null {
  if (typeof value === "string") return decodeBase64Media(value);
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const mimeType =
    stringField(record, "mimetype") ??
    stringField(record, "mimeType") ??
    stringField(record, "contentType");
  const fileName = stringField(record, "fileName") ?? stringField(record, "filename");
  for (const key of ["base64", "media", "data"]) {
    const decoded = decodeBase64Media(record[key], mimeType, fileName);
    if (decoded) return decoded;
  }
  for (const nested of Object.values(record)) {
    const decoded = extractBase64Media(nested);
    if (decoded) {
      return {
        body: decoded.body,
        mimeType: decoded.mimeType ?? mimeType,
        fileName: decoded.fileName ?? fileName,
      };
    }
  }
  return null;
}

function decodeBase64Media(
  value: unknown,
  fallbackMimeType?: string | null,
  fallbackFileName?: string | null,
) {
  if (typeof value !== "string" || value.length < 16) return null;
  const dataUri = /^data:([^;]+);base64,(.+)$/i.exec(value);
  const base64 = dataUri ? dataUri[2] : value;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) return null;
  try {
    const body = Buffer.from(base64.replace(/\s+/g, ""), "base64");
    if (body.length === 0) return null;
    return {
      body,
      mimeType: dataUri?.[1] ?? fallbackMimeType ?? null,
      fileName: fallbackFileName ?? null,
    };
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function phoneStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}
