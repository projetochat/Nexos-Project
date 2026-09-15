import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { MessageReactionActorType } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { MessageReactionEvent } from "./messaging.contracts";

@Injectable()
export class MessagingReactionService {
  private readonly logger = new Logger(MessagingReactionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
  ) {}

  async process(event: MessageReactionEvent) {
    const message = await this.prisma.message.findFirst({
      where: {
        tenantId: event.tenantId,
        connectionId: event.connectionId,
        providerMessageId: event.providerMessageId,
      },
      select: { id: true, conversationId: true },
    });
    if (!message) return { updated: false, reason: "message_not_found" as const };

    const actorExternalId = event.actorExternalId ?? "";
    const existing = await this.prisma.messageReaction.findFirst({
      where: {
        tenantId: event.tenantId,
        messageId: message.id,
        actorType: MessageReactionActorType.EXTERNAL_PARTICIPANT,
        actorMembershipId: null,
        externalParticipantId: actorExternalId,
      },
      select: { id: true },
    });
    const data = {
      emoji: event.emoji ?? "",
      externalParticipantName: event.actorName ?? null,
      providerReactionId: event.providerReactionId ?? null,
      removedAt: event.emoji ? null : event.occurredAt,
    };
    const reaction = existing
      ? await this.prisma.messageReaction.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.messageReaction.create({
          data: {
            tenantId: event.tenantId,
            messageId: message.id,
            actorType: MessageReactionActorType.EXTERNAL_PARTICIPANT,
            actorMembershipId: null,
            externalParticipantId: actorExternalId,
            ...data,
          },
        });

    this.logger.log({
      event: "messaging.reaction.processed",
      tenantId: event.tenantId,
      connectionId: event.connectionId,
      messageId: message.id,
      providerMessageId: event.providerMessageId,
      actorExternalId: actorExternalId || null,
      removed: !event.emoji,
    });
    this.realtime?.publishMessageReactionUpdated({
      tenantId: event.tenantId,
      conversationId: message.conversationId,
      messageId: message.id,
      reaction: serializeReaction(reaction),
    });
    return { updated: true, reaction };
  }
}

function serializeReaction(reaction: {
  id: string;
  emoji: string;
  actorType: MessageReactionActorType;
  actorMembershipId: string | null;
  externalParticipantId: string | null;
  externalParticipantName: string | null;
  createdAt: Date;
  removedAt: Date | null;
}) {
  return {
    id: reaction.id,
    emoji: reaction.emoji,
    actor_type: reaction.actorType.toLowerCase(),
    actor_membership_id: reaction.actorMembershipId,
    external_participant_id: reaction.externalParticipantId,
    external_participant_name: reaction.externalParticipantName,
    created_at: reaction.createdAt.toISOString(),
    removed_at: reaction.removedAt?.toISOString() ?? null,
  };
}
