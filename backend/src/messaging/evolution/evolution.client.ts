import { Injectable } from "@nestjs/common";
import { MessagingErrorCode, MessagingProviderError } from "../messaging.contracts";
import { assertEvolutionConfigured, evolutionConfigFromEnv } from "./evolution.config";
import { classifyEvolutionProviderError } from "./evolution-provider-error.classifier";
import {
  EvolutionConnectionStateResponse,
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

  async findGroupInfo(input: { instanceName: string; groupJid: string }) {
    const response = await this.request<unknown>(
      `/group/findGroupInfos/${input.instanceName}?groupJid=${encodeURIComponent(input.groupJid)}`,
    );
    return extractGroupInfo(response);
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

function extractGroupInfo(
  value: unknown,
): { subject?: string | null; name?: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const subject =
    stringField(record, "subject") ??
    stringField(record, "name") ??
    stringField(record, "groupName") ??
    stringField(record, "title");
  if (subject) return { subject, name: subject };
  for (const nested of Object.values(record)) {
    const info = extractGroupInfo(nested);
    if (info) return info;
  }
  return null;
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
