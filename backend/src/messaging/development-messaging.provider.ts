import { Injectable } from "@nestjs/common";
import { MessageType, MessagingProviderType } from "../generated/prisma";
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
  readonly capabilities = [MessagingCapability.TEXT] as const;

  async send(command: SendMessageCommand): Promise<SendMessageResult> {
    if (process.env.NODE_ENV === "production") {
      throw new MessagingProviderError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Development messaging provider is disabled in production.",
      );
    }
    if (command.content.type !== MessageType.TEXT) {
      throw new MessagingProviderError(
        MessagingErrorCode.UNSUPPORTED_MESSAGE_TYPE,
        "Development provider supports only text messages.",
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
