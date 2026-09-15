import { MessageType } from "../../generated/prisma";
import { MessagingErrorCode, MessagingProviderError } from "../messaging.contracts";
import { EvolutionRecipient } from "./evolution-recipient.normalizer";

export type EvolutionQuotedKey = {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
};

export type EvolutionMediaKind = "image" | "audio" | "document" | "video";

export class EvolutionOutboundPayloadFactory {
  text(input: {
    recipient: EvolutionRecipient;
    text: string;
    quoted?: EvolutionQuotedKey | null;
    mentions?: string[];
  }) {
    const payload = compact({
      number: input.recipient.number,
      text: input.text,
      quoted: input.quoted ? { key: compact(input.quoted) } : undefined,
      mentioned: input.mentions?.length ? input.mentions : undefined,
    });
    requireString(payload.number, "number", MessagingErrorCode.INVALID_RECIPIENT);
    requireString(payload.text, "text", MessagingErrorCode.INVALID_PROVIDER_PAYLOAD);
    return payload as {
      number: string;
      text: string;
      quoted?: { key: EvolutionQuotedKey };
      mentioned?: string[];
    };
  }

  media(input: {
    recipient: EvolutionRecipient;
    mediatype: EvolutionMediaKind;
    mimeType: string;
    fileName: string;
    caption?: string | null;
    quoted?: EvolutionQuotedKey | null;
    mentions?: string[];
  }) {
    const payload = compact({
      number: input.recipient.number,
      mediatype: input.mediatype,
      mimetype: input.mimeType,
      fileName: input.fileName,
      caption: input.caption || undefined,
      quoted: input.quoted ? { key: compact(input.quoted) } : undefined,
      mentioned: input.mentions?.length ? input.mentions : undefined,
    });
    requireString(payload.number, "number", MessagingErrorCode.INVALID_RECIPIENT);
    requireString(payload.mediatype, "mediatype", MessagingErrorCode.INVALID_PROVIDER_PAYLOAD);
    return payload as {
      number: string;
      mediatype: EvolutionMediaKind;
      mimetype?: string;
      fileName?: string;
      caption?: string;
      quoted?: { key: EvolutionQuotedKey };
      mentioned?: string[];
    };
  }

  audio(input: { recipient: EvolutionRecipient; quoted?: EvolutionQuotedKey | null }) {
    const payload = compact({
      number: input.recipient.number,
      quoted: input.quoted ? { key: compact(input.quoted) } : undefined,
    });
    requireString(payload.number, "number", MessagingErrorCode.INVALID_RECIPIENT);
    return payload as { number: string; quoted?: { key: EvolutionQuotedKey } };
  }

  reaction(input: { key: EvolutionQuotedKey; reaction: string }) {
    const payload = compact({
      key: compact(input.key),
      reaction: input.reaction,
    });
    if (!payload.key || typeof payload.key !== "object") {
      throw new MessagingProviderError(
        MessagingErrorCode.REACTION_PROVIDER_KEY_INVALID,
        "Evolution reaction key is required.",
        false,
      );
    }
    requireString(
      (payload.key as { id?: string }).id,
      "key.id",
      MessagingErrorCode.REACTION_PROVIDER_KEY_INVALID,
    );
    requireString(
      (payload.key as { remoteJid?: string }).remoteJid,
      "key.remoteJid",
      MessagingErrorCode.REACTION_PROVIDER_KEY_INVALID,
    );
    if (typeof (payload.key as { fromMe?: unknown }).fromMe !== "boolean") {
      throw new MessagingProviderError(
        MessagingErrorCode.REACTION_PROVIDER_KEY_INVALID,
        "Evolution reaction key.fromMe is required.",
        false,
      );
    }
    if (typeof payload.reaction !== "string") {
      throw new MessagingProviderError(
        MessagingErrorCode.INVALID_PROVIDER_PAYLOAD,
        "Evolution reaction must be a string.",
        false,
      );
    }
    return payload as { key: EvolutionQuotedKey; reaction: string };
  }

  quotedKey(input: {
    id?: string | null;
    remoteJid?: string | null;
    fromMe?: boolean | null;
    participant?: string | null;
  }) {
    const key = compact({
      id: input.id ?? undefined,
      remoteJid: input.remoteJid ?? undefined,
      fromMe: input.fromMe,
      participant: input.participant ?? undefined,
    });
    requireString(key.id, "quoted.key.id", MessagingErrorCode.QUOTED_MESSAGE_PROVIDER_KEY_INVALID);
    requireString(
      key.remoteJid,
      "quoted.key.remoteJid",
      MessagingErrorCode.QUOTED_MESSAGE_PROVIDER_KEY_INVALID,
    );
    if (typeof key.fromMe !== "boolean") {
      throw new MessagingProviderError(
        MessagingErrorCode.QUOTED_MESSAGE_PROVIDER_KEY_INVALID,
        "Evolution quoted key.fromMe is required.",
        false,
      );
    }
    return key as EvolutionQuotedKey;
  }
}

export function evolutionMediaKind(type: MessageType): EvolutionMediaKind {
  if (type === MessageType.IMAGE) return "image";
  if (type === MessageType.AUDIO || type === MessageType.VOICE) return "audio";
  if (type === MessageType.VIDEO) return "video";
  if (type === MessageType.DOCUMENT) return "document";
  throw new MessagingProviderError(
    MessagingErrorCode.UNSUPPORTED_MESSAGE_TYPE,
    "Evolution provider does not support this message type.",
    false,
  );
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function requireString(value: unknown, field: string, code: MessagingErrorCode) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MessagingProviderError(code, `Evolution payload requires ${field}.`, false);
  }
}
