import { Injectable } from "@nestjs/common";
import { MessagingErrorCode, MessagingProviderError } from "../messaging.contracts";
import { assertEvolutionConfigured, evolutionConfigFromEnv } from "./evolution.config";
import {
  EvolutionConnectionStateResponse,
  EvolutionCreateInstanceResponse,
  EvolutionSendTextResponse,
} from "./evolution.types";

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
      await this.request<unknown>("/instance/fetchInstances");
      return { ok: true, configured: true };
    } catch {
      return { ok: false, configured: true };
    }
  }

  createInstance(input: {
    instanceName: string;
    webhookUrl?: string | null;
    webhookSecret?: string | null;
  }) {
    return this.request<EvolutionCreateInstanceResponse>("/instance/create", {
      method: "POST",
      body: {
        instanceName: input.instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        ...(input.webhookUrl
          ? {
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
            }
          : {}),
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

  sendText(input: { instanceName: string; number: string; text: string }) {
    return this.request<EvolutionSendTextResponse>(`/message/sendText/${input.instanceName}`, {
      method: "POST",
      body: {
        number: input.number,
        text: input.text,
      },
    });
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: config.apiKey,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const data = await readJson(response);
      if (!response.ok) throw toProviderError(response.status, data);
      return data as T;
    } catch (error) {
      if (error instanceof MessagingProviderError) throw error;
      if ((error as { name?: string }).name === "AbortError") {
        throw new MessagingProviderError(
          MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
          "Evolution API request timed out.",
          true,
        );
      }
      throw new MessagingProviderError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Evolution API is unavailable.",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function toProviderError(status: number, data: unknown) {
  const message = sanitizedErrorMessage(data);
  if (status === 401 || status === 403) {
    return new MessagingProviderError(MessagingErrorCode.AUTHENTICATION_FAILURE, message);
  }
  if (status === 400)
    return new MessagingProviderError(MessagingErrorCode.INVALID_RECIPIENT, message);
  if (status === 404) {
    return new MessagingProviderError(MessagingErrorCode.PROVIDER_UNAVAILABLE, message);
  }
  if (status === 429)
    return new MessagingProviderError(MessagingErrorCode.RATE_LIMITED, message, true);
  return new MessagingProviderError(MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE, message, true);
}

function sanitizedErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return "Evolution API request failed.";
  const value =
    (data as { message?: unknown; error?: unknown }).message ?? (data as { error?: unknown }).error;
  if (Array.isArray(value)) return value.join(", ").slice(0, 500);
  if (typeof value === "string") return value.slice(0, 500);
  return "Evolution API request failed.";
}
