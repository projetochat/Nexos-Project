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
import {
  EvolutionOutboundPayloadFactory,
  evolutionMediaKind,
} from "./evolution-outbound-payload.factory";
import { normalizeEvolutionRecipient } from "./evolution-recipient.normalizer";

@Injectable()
export class EvolutionMessagingProvider implements MessagingProvider {
  readonly type = MessagingProviderType.EVOLUTION;
  readonly capabilities = [
    MessagingCapability.TEXT,
    MessagingCapability.IMAGE,
    MessagingCapability.AUDIO,
    MessagingCapability.VIDEO,
    MessagingCapability.DOCUMENT,
  ] as const;

  private readonly payloads = new EvolutionOutboundPayloadFactory();

  constructor(@Inject(EvolutionClient) private readonly client: EvolutionClient) {}

  async send(command: SendMessageCommand): Promise<SendMessageResult> {
    if (!command.providerConnectionRef) {
      throw new MessagingProviderError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Evolution connection is not configured.",
      );
    }

    const recipient = normalizeEvolutionRecipient({
      conversationType: command.externalChatId?.endsWith("@g.us") ? "GROUP" : "DIRECT",
      externalChatId: command.externalChatId,
      normalizedPhone: command.recipient.normalizedPhone,
    });
    const quoted = command.quotedProviderMessageId
      ? this.payloads.quotedKey({
          id: command.quotedProviderMessageId,
          remoteJid: command.quotedProviderChatId ?? recipient.remoteJid ?? recipient.target,
          fromMe: command.quotedFromMe,
          participant: command.quotedParticipant,
        })
      : null;
    const response =
      command.content.type === MessageType.TEXT
        ? await this.client.sendText({
            instanceName: command.providerConnectionRef,
            payload: this.payloads.text({
              recipient,
              text: command.content.text,
              quoted,
              mentions: command.mentions,
            }),
          })
        : await this.sendMedia(command, recipient, quoted);

    return {
      accepted: true,
      providerMessageId: response.key?.id ?? null,
      providerTimestamp: parseProviderTimestamp(response.messageTimestamp),
      providerStatus: response.status ?? "sent_by_evolution",
    };
  }

  private async sendMedia(
    command: SendMessageCommand,
    recipient: ReturnType<typeof normalizeEvolutionRecipient>,
    quoted: ReturnType<EvolutionOutboundPayloadFactory["quotedKey"]> | null,
  ) {
    if (command.content.type === MessageType.TEXT) {
      throw new MessagingProviderError(
        MessagingErrorCode.UNSUPPORTED_MESSAGE_TYPE,
        "Text messages must use sendText.",
        false,
      );
    }
    if (!command.content.mediaBuffer?.length) {
      throw new MessagingProviderError(
        MessagingErrorCode.MEDIA_FILE_MISSING,
        "Evolution media dispatch requires a stored media file.",
        false,
      );
    }
    const mimeType = command.content.mimeType ?? "application/octet-stream";
    const fileName = command.content.fileName ?? "media";
    if (command.content.type === MessageType.AUDIO || command.content.type === MessageType.VOICE) {
      return this.client.sendAudio({
        instanceName: command.providerConnectionRef ?? "",
        payload: this.payloads.audio({ recipient, quoted }),
        media: command.content.mediaBuffer,
        mimeType,
        fileName,
      });
    }
    return this.client.sendMedia({
      instanceName: command.providerConnectionRef ?? "",
      payload: this.payloads.media({
        recipient,
        mediatype: evolutionMediaKind(command.content.type),
        mimeType,
        fileName,
        caption: command.content.caption ?? command.content.text,
        quoted,
        mentions: command.mentions,
      }),
      media: command.content.mediaBuffer,
      mimeType,
      fileName,
    });
  }
}

function parseProviderTimestamp(value: string | number | undefined) {
  if (value === undefined) return new Date();
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return new Date();
  return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
}
