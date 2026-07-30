import { describe, expect, it } from "vitest";
import { MessageType, MessagingProviderType } from "../generated/prisma";
import { DevelopmentMessagingProvider } from "./development-messaging.provider";
import { MessagingErrorCode } from "./messaging.contracts";
import { MessagingProviderRegistry } from "./messaging-provider.registry";

describe("MessagingProviderRegistry", () => {
  it("resolves a provider centrally by provider type", () => {
    const provider = new DevelopmentMessagingProvider();
    const registry = new MessagingProviderRegistry(provider);

    expect(registry.resolve(MessagingProviderType.DEVELOPMENT)).toBe(provider);
  });

  it("returns a controlled error for unknown provider implementations", () => {
    const registry = new MessagingProviderRegistry(new DevelopmentMessagingProvider());

    expect(() => registry.resolve(MessagingProviderType.EVOLUTION)).toThrow(
      expect.objectContaining({ code: MessagingErrorCode.PROVIDER_NOT_CONFIGURED }),
    );
  });

  it("checks provider capabilities with canonical message types", () => {
    const provider = new DevelopmentMessagingProvider();
    const registry = new MessagingProviderRegistry(provider);

    expect(() => registry.assertSupports(provider, MessageType.TEXT)).not.toThrow();
    expect(() => registry.assertSupports(provider, MessageType.AUDIO)).toThrow(
      expect.objectContaining({ code: MessagingErrorCode.UNSUPPORTED_MESSAGE_TYPE }),
    );
  });
});
