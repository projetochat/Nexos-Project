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
  INVALID_PROVIDER_PAYLOAD = "INVALID_PROVIDER_PAYLOAD",
  PROVIDER_VALIDATION_ERROR = "PROVIDER_VALIDATION_ERROR",
  QUOTED_MESSAGE_PROVIDER_KEY_INVALID = "QUOTED_MESSAGE_PROVIDER_KEY_INVALID",
  REACTION_PROVIDER_KEY_INVALID = "REACTION_PROVIDER_KEY_INVALID",
  MEDIA_FILE_MISSING = "MEDIA_FILE_MISSING",
  MEDIA_UPLOAD_FAILED = "MEDIA_UPLOAD_FAILED",
  MEDIA_DOWNLOAD_FAILED = "MEDIA_DOWNLOAD_FAILED",
  MEDIA_NOT_READY = "MEDIA_NOT_READY",
  AUDIO_CODEC_NOT_SUPPORTED = "AUDIO_CODEC_NOT_SUPPORTED",
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
    public readonly httpStatus?: number,
    public readonly providerCode?: string | null,
    public readonly endpointPath?: string | null,
    public readonly method?: string | null,
    public readonly unknownOutcome = false,
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
      type: Extract<MessageType, "IMAGE" | "AUDIO" | "VOICE" | "VIDEO" | "DOCUMENT">;
      text?: string | null;
      mediaRef?: string | null;
      mediaBuffer?: Buffer;
      mimeType?: string | null;
      fileName?: string | null;
      caption?: string | null;
    };

export type SendMessageCommand = {
  tenantId: string;
  conversationId: string;
  messageId: string;
  connectionId: string;
  providerConnectionRef?: string | null;
  providerType: MessagingProviderType;
  recipient: CanonicalRecipient;
  externalChatId?: string | null;
  content: CanonicalMessageContent;
  clientMessageId?: string | null;
  quotedProviderMessageId?: string | null;
  quotedProviderChatId?: string | null;
  quotedFromMe?: boolean | null;
  quotedParticipant?: string | null;
  mentions?: string[];
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
  externalChatId: string;
  conversationType: "DIRECT" | "GROUP";
  fromMe: boolean;
  participantExternalId?: string | null;
  participantPhone?: string | null;
  participantName?: string | null;
  participantLid?: string | null;
  sender: CanonicalRecipient;
  type: Extract<MessageType, "TEXT" | "IMAGE" | "AUDIO" | "VOICE" | "VIDEO" | "DOCUMENT">;
  content?: string | null;
  media?: {
    url?: string | null;
    mimetype?: string | null;
    fileName?: string | null;
    sizeBytes?: number | null;
    durationMs?: number | null;
    sha256?: string | null;
    rawMessage?: unknown;
  } | null;
  quotedProviderMessageId?: string | null;
  quotedContentPreview?: string | null;
  quotedMessageType?: MessageType | null;
  occurredAt: Date;
  metadata?: {
    displayName?: string | null;
    providerInstanceName?: string | null;
    mediaRef?: string | null;
    remoteJid?: string | null;
    profilePictureUrl?: string | null;
    normalizedPhoneCandidates?: string[];
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

export type MessageEditEvent = {
  tenantId: string;
  connectionId: string;
  providerMessageId: string;
  content: string;
  occurredAt: Date;
};

export type MessageReactionEvent = {
  tenantId: string;
  connectionId: string;
  providerMessageId: string;
  providerReactionId?: string | null;
  emoji: string | null;
  actorExternalId?: string | null;
  actorName?: string | null;
  occurredAt: Date;
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
    VOICE: MessagingCapability.AUDIO,
    VIDEO: MessagingCapability.VIDEO,
    DOCUMENT: MessagingCapability.DOCUMENT,
  };
  return map[type];
}
