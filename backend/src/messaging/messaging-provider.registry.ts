import { Injectable } from "@nestjs/common";
import { MessagingProviderType } from "../generated/prisma";
import {
  capabilityForMessageType,
  MessagingErrorCode,
  MessagingProvider,
  MessagingProviderError,
} from "./messaging.contracts";
import { DevelopmentMessagingProvider } from "./development-messaging.provider";

@Injectable()
export class MessagingProviderRegistry {
  private readonly providers = new Map<MessagingProviderType, MessagingProvider>();

  constructor(developmentProvider: DevelopmentMessagingProvider) {
    this.register(developmentProvider);
  }

  resolve(providerType: MessagingProviderType) {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new MessagingProviderError(
        MessagingErrorCode.PROVIDER_NOT_CONFIGURED,
        "Messaging provider is not configured.",
      );
    }
    return provider;
  }

  assertSupports(
    provider: MessagingProvider,
    type: Parameters<typeof capabilityForMessageType>[0],
  ) {
    const capability = capabilityForMessageType(type);
    if (!capability || !provider.capabilities.includes(capability)) {
      throw new MessagingProviderError(
        MessagingErrorCode.UNSUPPORTED_MESSAGE_TYPE,
        "Messaging provider does not support this message type.",
      );
    }
  }

  private register(provider: MessagingProvider) {
    this.providers.set(provider.type, provider);
  }
}
