import { Inject, Injectable } from "@nestjs/common";
import { MessageType, MessagingProviderType } from "../../generated/prisma";
import {
  MessagingCapability,
  MessagingErrorCode,
  MessagingProvider,
  MessagingProviderError,
  SendMessageCommand,
  SendMessageResult,
} from "../messaging.contracts";
import { EvolutionClient } from "./evolution.client";

@Injectable()
export class EvolutionMessagingProvider implements MessagingProvider {
  readonly type = MessagingProviderType.EVOLUTION;
  readonly capabilities = [MessagingCapability.TEXT] as const;

  constructor(@Inject(EvolutionClient) private readonly client: EvolutionClient) {}

  async send(command: SendMessageCommand): Promise<SendMessageResult> {
    if (command.content.type !== MessageType.TEXT) {
      throw new MessagingProviderError(
        MessagingErrorCode.UNSUPPORTED_MESSAGE_TYPE,
        "Evolution provider supports only text messages in this sprint.",
      );
    }
    if (!command.providerConnectionRef) {
      throw new MessagingProviderError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Evolution connection is not configured.",
      );
    }

    const response = await this.client.sendText({
      instanceName: command.providerConnectionRef,
      number: command.recipient.normalizedPhone.replace(/\D/g, ""),
      text: command.content.text,
    });

    return {
      accepted: true,
      providerMessageId: response.key?.id ?? null,
      providerTimestamp: parseProviderTimestamp(response.messageTimestamp),
      providerStatus: response.status ?? "sent_by_evolution",
    };
  }
}

function parseProviderTimestamp(value: string | number | undefined) {
  if (value === undefined) return new Date();
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return new Date();
  return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
}
