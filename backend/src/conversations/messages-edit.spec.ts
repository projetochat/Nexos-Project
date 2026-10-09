import { describe, expect, it, vi } from "vitest";
import { MessageDirection, MessageStatus, MessageType } from "../generated/prisma";
import { MessagesService } from "./messages.service";

describe("message editing", () => {
  it("serializes the original content retained for an edited contact message", () => {
    const service = new MessagesService({} as never, {} as never, {} as never);
    const serialize = (
      service as unknown as {
        serialize: (message: Record<string, unknown>) => Record<string, unknown>;
      }
    ).serialize.bind(service);

    expect(
      serialize({
        id: "message-inbound",
        tenantId: "tenant-a",
        conversationId: "conversation-a",
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        status: MessageStatus.CREATED,
        content: "CBA",
        interactiveData: {
          originalContent: "ABC",
          editedAt: "2026-10-08T17:47:00.000Z",
        },
        reactions: [],
      }),
    ).toMatchObject({
      content: "CBA",
      original_content: "ABC",
      edited_at: "2026-10-08T17:47:00.000Z",
    });
  });

  it("keeps an edited image caption consistent in content and media metadata", async () => {
    const prisma = {
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: "message-image",
          conversationId: "conversation-a",
          tenantId: "tenant-a",
          direction: MessageDirection.OUTBOUND,
          type: MessageType.IMAGE,
          interactiveData: null,
          providerMessageId: null,
          providerChatId: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({ id: "conversation-a", connection: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new MessagesService(prisma as never, {} as never, {} as never);
    vi.spyOn(service, "findVisibleConversation").mockResolvedValue({} as never);
    vi.spyOn(service, "get").mockResolvedValue({ id: "message-image" } as never);

    await service.edit("conversation-a", "message-image", " Legenda atualizada ", {
      tenantId: "tenant-a",
      roleKey: "tenant_admin",
    } as never);

    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "Legenda atualizada",
          mediaCaption: "Legenda atualizada",
        }),
      }),
    );
  });
});
