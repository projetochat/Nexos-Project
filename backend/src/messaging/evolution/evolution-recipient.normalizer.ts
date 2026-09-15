import { ConversationType } from "../../generated/prisma";
import { MessagingErrorCode, MessagingProviderError } from "../messaging.contracts";

export type EvolutionRecipient = {
  conversationType: "DIRECT" | "GROUP";
  target: string;
  number?: string;
  remoteJid?: string;
  targetKind: "DIRECT_NUMBER" | "DIRECT_JID" | "DIRECT_LID" | "GROUP_JID";
};

export type EvolutionRecipientInput = {
  conversationType?: ConversationType | "DIRECT" | "GROUP" | null;
  externalChatId?: string | null;
  normalizedPhone?: string | null;
};

export function normalizeEvolutionRecipient(input: EvolutionRecipientInput): EvolutionRecipient {
  const conversationType = String(input.conversationType ?? ConversationType.DIRECT);
  if (conversationType === "GROUP") {
    const groupJid = clean(input.externalChatId);
    if (!groupJid || !groupJid.endsWith("@g.us")) {
      throw new MessagingProviderError(
        MessagingErrorCode.INVALID_RECIPIENT,
        "Evolution group recipient must be a @g.us JID.",
        false,
      );
    }
    return {
      conversationType: "GROUP",
      target: groupJid,
      number: groupJid,
      remoteJid: groupJid,
      targetKind: "GROUP_JID",
    };
  }

  const direct = clean(input.externalChatId) || clean(input.normalizedPhone);
  if (!direct) {
    throw new MessagingProviderError(
      MessagingErrorCode.INVALID_RECIPIENT,
      "Evolution direct recipient is empty.",
      false,
    );
  }
  if (direct.endsWith("@g.us")) {
    throw new MessagingProviderError(
      MessagingErrorCode.INVALID_RECIPIENT,
      "Evolution direct recipient cannot be a group JID.",
      false,
    );
  }
  if (direct.endsWith("@lid")) {
    return {
      conversationType: "DIRECT",
      target: direct,
      number: direct,
      remoteJid: direct,
      targetKind: "DIRECT_LID",
    };
  }
  if (direct.endsWith("@s.whatsapp.net") || direct.endsWith("@c.us")) {
    return {
      conversationType: "DIRECT",
      target: direct,
      number: direct,
      remoteJid: direct,
      targetKind: "DIRECT_JID",
    };
  }

  const number = direct.replace(/\D/g, "");
  if (number.length < 10) {
    throw new MessagingProviderError(
      MessagingErrorCode.INVALID_RECIPIENT,
      "Evolution direct recipient must contain at least 10 digits.",
      false,
    );
  }
  return {
    conversationType: "DIRECT",
    target: number,
    number,
    remoteJid: `${number}@s.whatsapp.net`,
    targetKind: "DIRECT_NUMBER",
  };
}

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}
