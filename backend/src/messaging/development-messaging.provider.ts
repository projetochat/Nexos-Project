import { Injectable } from "@nestjs/common";
import { MessagingProviderType } from "../generated/prisma";
import {
  MessagingCapability,
  MessagingErrorCode,
  MessagingProvider,
  MessagingProviderError,
  SendMessageCommand,
  SendMessageResult,
} from "./messaging.contracts";

@Injectable()
export class DevelopmentMessagingProvider implements MessagingProvider {
  readonly type = MessagingProviderType.DEVELOPMENT;
  readonly capabilities = [
    MessagingCapability.TEXT,
    MessagingCapability.IMAGE,
    MessagingCapability.AUDIO,
    MessagingCapability.DOCUMENT,
  ] as const;

  async send(command: SendMessageCommand): Promise<SendMessageResult> {
    if (process.env.NODE_ENV === "production") {
      throw new MessagingProviderError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Development messaging provider is disabled in production.",
      );
    }
    return {
      accepted: true,
      providerMessageId: `dev_${command.messageId}`,
      providerTimestamp: new Date(),
      providerStatus: "accepted_by_development_provider",
    };
  }
}
