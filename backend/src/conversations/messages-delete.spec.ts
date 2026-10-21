import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MessageDirection } from "../generated/prisma";
import { MessagesService } from "./messages.service";

function context() {
  return {
    id: "conversation-a",
    externalChatId: null,
    connection: {
      id: "connection-a",
      externalReference: "instance-a",
      serviceEnabled: true,
    },
  };
}

function outboundMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "message-a",
    conversationId: "conversation-a",
    tenantId: "tenant-a",
    direction: MessageDirection.OUTBOUND,
    providerMessageId: "provider-message-a",
    providerChatId: "5511999990000@s.whatsapp.net",
    interactiveData: null,
    ...overrides,
  };
}

function current() {
  return { tenantId: "tenant-a", roleKey: "tenant_admin" } as never;
}

describe("message deletion for everyone", () => {
  it("does not mark the local message when the provider identity is incomplete", async () => {
    const prisma = {
      message: {
        findFirst: vi.fn().mockResolvedValue(outboundMessage({ providerChatId: null })),
        update: vi.fn(),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(context()) },
    };
    const evolution = { deleteMessage: vi.fn() };
    const service = new MessagesService(
      prisma as never,
      {} as never,
      {} as never,
      undefined,
      evolution as never,
    );
    vi.spyOn(service, "findVisibleConversation").mockResolvedValue({} as never);

    await expect(service.delete("conversation-a", "message-a", current())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(evolution.deleteMessage).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it("marks the local message only after a confirmed remote deletion", async () => {
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          $queryRaw: vi.fn().mockResolvedValue([{ serviceEnabled: true }]),
        }),
      ),
      message: {
        findFirst: vi.fn().mockResolvedValue(outboundMessage()),
        update: vi.fn().mockResolvedValue({}),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(context()) },
    };
    const evolution = {
      deleteMessage: vi.fn().mockResolvedValue({ key: { id: "provider-message-a" } }),
    };
    const service = new MessagesService(
      prisma as never,
      {} as never,
      {} as never,
      undefined,
      evolution as never,
    );
    vi.spyOn(service, "findVisibleConversation").mockResolvedValue({} as never);
    vi.spyOn(service, "get").mockResolvedValue({ id: "message-a" } as never);

    await service.delete("conversation-a", "message-a", current());

    expect(evolution.deleteMessage).toHaveBeenCalledWith({
      instanceName: "instance-a",
      remoteJid: "5511999990000@s.whatsapp.net",
      messageId: "provider-message-a",
    });
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          interactiveData: expect.objectContaining({ deletedForEveryone: true }),
        }),
      }),
    );
  });

  it("keeps the local content when Evolution rejects the deletion", async () => {
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          $queryRaw: vi.fn().mockResolvedValue([{ serviceEnabled: true }]),
        }),
      ),
      message: {
        findFirst: vi.fn().mockResolvedValue(outboundMessage()),
        update: vi.fn(),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(context()) },
    };
    const evolution = { deleteMessage: vi.fn().mockRejectedValue(new Error("outside window")) };
    const service = new MessagesService(
      prisma as never,
      {} as never,
      {} as never,
      undefined,
      evolution as never,
    );
    vi.spyOn(service, "findVisibleConversation").mockResolvedValue({} as never);

    await expect(service.delete("conversation-a", "message-a", current())).rejects.toThrow(
      "outside window",
    );
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});
