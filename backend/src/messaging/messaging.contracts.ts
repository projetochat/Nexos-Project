import { MessageStatus, MessageType, MessagingProviderType } from "../generated/prisma";

export enum MessagingCapability {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
  DOCUMENT = "DOCUMENT",
  REACTION = "REACTION",
  TEMPLATE = "TEMPLATE",
}

export enum MessagingErrorCode {
  PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE",
  AUTHENTICATION_FAILURE = "AUTHENTICATION_FAILURE",
  INVALID_RECIPIENT = "INVALID_RECIPIENT",
  UNSUPPORTED_MESSAGE_TYPE = "UNSUPPORTED_MESSAGE_TYPE",
  RATE_LIMITED = "RATE_LIMITED",
  DELIVERY_REJECTED = "DELIVERY_REJECTED",
  TEMPORARY_PROVIDER_FAILURE = "TEMPORARY_PROVIDER_FAILURE",
  PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED",
}

export class MessagingProviderError extends Error {
  constructor(
    public readonly code: MessagingErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export type CanonicalRecipient = {
  phone: string;
  normalizedPhone: string;
  displayName?: string | null;
};

export type CanonicalMessageContent =
  | { type: Extract<MessageType, "TEXT">; text: string }
  | {
      type: Extract<MessageType, "IMAGE" | "AUDIO">;
      text?: string | null;
      mediaRef?: string;
    };

export type SendMessageCommand = {
  tenantId: string;
  conversationId: string;
  messageId: string;
  connectionId: string;
  providerType: MessagingProviderType;
  recipient: CanonicalRecipient;
  content: CanonicalMessageContent;
  clientMessageId?: string | null;
};

export type SendMessageResult = {
  accepted: boolean;
  providerMessageId?: string | null;
  providerTimestamp?: Date | null;
  providerStatus?: string | null;
};

export type InboundMessageEvent = {
  tenantId: string;
  connectionId: string;
  externalMessageId: string;
  sender: CanonicalRecipient;
  type: Extract<MessageType, "TEXT" | "IMAGE" | "AUDIO">;
  content?: string | null;
  occurredAt: Date;
  metadata?: {
    displayName?: string | null;
    mediaRef?: string | null;
  };
};

export type MessageStatusEvent = {
  tenantId: string;
  connectionId: string;
  providerMessageId: string;
  status: Extract<MessageStatus, "SENT" | "DELIVERED" | "READ" | "FAILED">;
  occurredAt: Date;
  errorCode?: MessagingErrorCode;
  errorMessage?: string;
};

export interface MessagingProvider {
  readonly type: MessagingProviderType;
  readonly capabilities: readonly MessagingCapability[];
  send(command: SendMessageCommand): Promise<SendMessageResult>;
}

export function capabilityForMessageType(type: MessageType) {
  const map: Partial<Record<MessageType, MessagingCapability>> = {
    TEXT: MessagingCapability.TEXT,
    IMAGE: MessagingCapability.IMAGE,
    AUDIO: MessagingCapability.AUDIO,
  };
  return map[type];
}
