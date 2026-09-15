import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageReactionActorType } from "../generated/prisma";
import { MessagingReactionService } from "./messaging-reaction.service";

describe("MessagingReactionService", () => {
  const prisma = {
    message: { findFirst: vi.fn() },
    messageReaction: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  };
  const realtime = { publishMessageReactionUpdated: vi.fn() };
  let service: MessagingReactionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MessagingReactionService(prisma as never, realtime as never);
  });

  it("upserts inbound external participant reactions and publishes realtime", async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: "message-a",
      conversationId: "conversation-a",
    });
    prisma.messageReaction.findFirst.mockResolvedValue(null);
    prisma.messageReaction.create.mockResolvedValue({
      id: "reaction-a",
      emoji: "\u{1f44d}",
      actorType: MessageReactionActorType.EXTERNAL_PARTICIPANT,
      actorMembershipId: null,
      externalParticipantId: "5511999999999@s.whatsapp.net",
      externalParticipantName: "Cliente",
      createdAt: new Date("2026-08-07T00:00:00.000Z"),
      removedAt: null,
    });

    await expect(
      service.process({
        tenantId: "tenant-a",
        connectionId: "connection-a",
        providerMessageId: "provider-message-a",
        providerReactionId: "reaction-provider-a",
        emoji: "\u{1f44d}",
        actorExternalId: "5511999999999@s.whatsapp.net",
        actorName: "Cliente",
        occurredAt: new Date("2026-08-07T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ updated: true });

    expect(prisma.messageReaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-a",
          messageId: "message-a",
          actorType: MessageReactionActorType.EXTERNAL_PARTICIPANT,
          actorMembershipId: null,
          externalParticipantId: "5511999999999@s.whatsapp.net",
          emoji: "\u{1f44d}",
          removedAt: null,
        }),
      }),
    );
    expect(realtime.publishMessageReactionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        conversationId: "conversation-a",
        messageId: "message-a",
      }),
    );
  });

  it("marks inbound reaction removal with removedAt", async () => {
    const occurredAt = new Date("2026-08-07T00:00:00.000Z");
    prisma.message.findFirst.mockResolvedValue({
      id: "message-a",
      conversationId: "conversation-a",
    });
    prisma.messageReaction.findFirst.mockResolvedValue({ id: "reaction-a" });
    prisma.messageReaction.update.mockResolvedValue({
      id: "reaction-a",
      emoji: "",
      actorType: MessageReactionActorType.EXTERNAL_PARTICIPANT,
      actorMembershipId: null,
      externalParticipantId: "5511999999999@s.whatsapp.net",
      externalParticipantName: "Cliente",
      createdAt: occurredAt,
      removedAt: occurredAt,
    });

    await service.process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      providerMessageId: "provider-message-a",
      emoji: null,
      actorExternalId: "5511999999999@s.whatsapp.net",
      actorName: "Cliente",
      occurredAt,
    });

    expect(prisma.messageReaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reaction-a" },
        data: expect.objectContaining({ emoji: "", removedAt: occurredAt }),
      }),
    );
  });
});
