import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationStatus,
  ConversationType,
  MessageDirection,
  MessageStatus,
} from "../generated/prisma";
import { DepartmentInactivityClosureService } from "./department-inactivity-closure.service";

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled in isolated inactivity tests");
    }),
  ),
);
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("DepartmentInactivityClosureService", () => {
  it("queues the configured message and closes an eligible conversation atomically", async () => {
    const now = new Date("2026-10-20T18:00:00.000Z");
    const latest = {
      id: "agent-message",
      direction: MessageDirection.OUTBOUND,
      authorMembershipId: "membership-a",
      createdAt: new Date("2026-10-20T16:59:00.000Z"),
    };
    const outbound = {
      id: "inactivity-message",
      tenantId: "tenant-a",
      conversationId: "conversation-a",
      connectionId: "connection-a",
      status: MessageStatus.QUEUED,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "conversation-a" }]),
      department: {
        findFirst: vi.fn().mockResolvedValue({
          inactivityTimeoutMinutes: 60,
          inactivityClosureMessage: "Podemos continuar quando você precisar.",
        }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-a",
          tenantId: "tenant-a",
          contactId: "contact-a",
          connectionId: "connection-a",
          externalChatId: "556299999999",
          isGroup: false,
          conversationType: ConversationType.DIRECT,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      message: {
        findFirst: vi.fn().mockResolvedValueOnce(latest).mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValueOnce(outbound).mockResolvedValueOnce({ id: "system-a" }),
      },
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: "outbox-a" }) },
    };
    const prisma = {
      department: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "department-a", tenantId: "tenant-a", inactivityTimeoutMinutes: 60 },
          ]),
      },
      conversation: { findMany: vi.fn().mockResolvedValue([{ id: "conversation-a" }]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const outbox = { dispatchMessage: vi.fn().mockResolvedValue(true) };
    const realtime = {
      publishMessageCreated: vi.fn(),
      publishConversationUpdated: vi.fn(),
    };
    const service = new DepartmentInactivityClosureService(
      prisma as never,
      outbox as never,
      realtime as never,
      { get: vi.fn() } as never,
    );

    await expect(service.runOnce(now)).resolves.toEqual({ departments: 1, scanned: 1, closed: 1 });

    expect(tx.message.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          clientMessageId: "automatic:inactivity:agent-message",
          content: "Podemos continuar quando você precisar.",
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.QUEUED,
        }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateId: "inactivity-message",
        payload: { tenantId: "tenant-a", messageId: "inactivity-message" },
      }),
    });
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: "conversation-a" },
      data: expect.objectContaining({ status: ConversationStatus.FECHADA, closedAt: now }),
    });
    expect(outbox.dispatchMessage).toHaveBeenCalledWith("inactivity-message");
    expect(realtime.publishConversationUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "inactivity.closed" }),
    );
  });

  it("does not close when the client replied after the attendant", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "conversation-a" }]),
      department: {
        findFirst: vi.fn().mockResolvedValue({
          inactivityTimeoutMinutes: 60,
          inactivityClosureMessage: "Mensagem final",
        }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-a",
          tenantId: "tenant-a",
          contactId: "contact-a",
          connectionId: "connection-a",
          externalChatId: "556299999999",
          isGroup: false,
          conversationType: ConversationType.DIRECT,
        }),
      },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: "client-message",
          direction: MessageDirection.INBOUND,
          authorMembershipId: null,
          createdAt: new Date("2026-10-20T16:00:00.000Z"),
        }),
        create: vi.fn(),
      },
      outboxEvent: { create: vi.fn() },
    };
    const prisma = {
      department: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "department-a", tenantId: "tenant-a", inactivityTimeoutMinutes: 60 },
          ]),
      },
      conversation: { findMany: vi.fn().mockResolvedValue([{ id: "conversation-a" }]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const outbox = { dispatchMessage: vi.fn() };
    const service = new DepartmentInactivityClosureService(
      prisma as never,
      outbox as never,
      { publishMessageCreated: vi.fn(), publishConversationUpdated: vi.fn() } as never,
      { get: vi.fn() } as never,
    );

    await expect(service.runOnce(new Date("2026-10-20T18:00:00.000Z"))).resolves.toEqual({
      departments: 1,
      scanned: 1,
      closed: 0,
    });
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(outbox.dispatchMessage).not.toHaveBeenCalled();
  });

  it("revalidates the deadline under lock before closing", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "conversation-a" }]),
      department: {
        findFirst: vi.fn().mockResolvedValue({
          inactivityTimeoutMinutes: 60,
          inactivityClosureMessage: "Mensagem final",
        }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-a",
          tenantId: "tenant-a",
          contactId: "contact-a",
          connectionId: "connection-a",
          externalChatId: "556299999999",
          isGroup: false,
          conversationType: ConversationType.DIRECT,
        }),
      },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: "fresh-agent-message",
          direction: MessageDirection.OUTBOUND,
          authorMembershipId: "membership-a",
          createdAt: new Date("2026-10-20T17:30:00.000Z"),
        }),
        create: vi.fn(),
      },
      outboxEvent: { create: vi.fn() },
    };
    const prisma = {
      department: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "department-a", tenantId: "tenant-a", inactivityTimeoutMinutes: 60 },
          ]),
      },
      conversation: { findMany: vi.fn().mockResolvedValue([{ id: "conversation-a" }]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new DepartmentInactivityClosureService(
      prisma as never,
      { dispatchMessage: vi.fn() } as never,
      { publishMessageCreated: vi.fn(), publishConversationUpdated: vi.fn() } as never,
      { get: vi.fn() } as never,
    );

    await expect(service.runOnce(new Date("2026-10-20T18:00:00.000Z"))).resolves.toEqual({
      departments: 1,
      scanned: 1,
      closed: 0,
    });
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});

describe("inactivity closes individual conversations only", () => {
  function fixture(input: {
    isGroup: boolean;
    conversationType: ConversationType;
    externalChatId: string;
  }) {
    const now = new Date("2026-10-20T18:00:00Z");
    const conversation = {
      id: "conversation-a",
      tenantId: "tenant-a",
      contactId: "contact-a",
      connectionId: "connection-a",
      ...input,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: conversation.id }]),
      department: {
        findFirst: vi.fn().mockResolvedValue({
          inactivityTimeoutMinutes: 60,
          inactivityClosureMessage: "Mensagem sintética final",
        }),
      },
      // Deliberately return a row even when the query's group filters would reject it.
      // This models stale admission and verifies the post-lock guard before any effects.
      conversation: {
        findFirst: vi.fn().mockResolvedValue(conversation),
        update: vi.fn().mockResolvedValue({}),
      },
      message: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "agent-message",
            direction: MessageDirection.OUTBOUND,
            authorMembershipId: "member-a",
            createdAt: new Date("2026-10-20T16:00:00Z"),
          })
          .mockResolvedValueOnce(null),
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: "outbound-a" })
          .mockResolvedValueOnce({ id: "system-a" }),
      },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      department: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "department-a", tenantId: "tenant-a", inactivityTimeoutMinutes: 60 },
          ]),
      },
      conversation: { findMany: vi.fn().mockResolvedValue([{ id: conversation.id }]) },
      $transaction: vi.fn(async (callback: (db: typeof tx) => unknown) => callback(tx)),
    };
    const outbox = { dispatchMessage: vi.fn().mockResolvedValue(true) };
    const realtime = { publishMessageCreated: vi.fn(), publishConversationUpdated: vi.fn() };
    return {
      now,
      tx,
      prisma,
      outbox,
      realtime,
      service: new DepartmentInactivityClosureService(
        prisma as never,
        outbox as never,
        realtime as never,
        { get: vi.fn() } as never,
      ),
    };
  }

  it.each([
    {
      isGroup: true,
      conversationType: ConversationType.GROUP,
      externalChatId: "120363000000000@g.us",
    },
    {
      isGroup: false,
      conversationType: ConversationType.GROUP,
      externalChatId: "5511999990000@s.whatsapp.net",
    },
    {
      isGroup: true,
      conversationType: ConversationType.DIRECT,
      externalChatId: "5511999990000@s.whatsapp.net",
    },
    {
      isGroup: false,
      conversationType: ConversationType.DIRECT,
      externalChatId: "120363000000000@g.us",
    },
    {
      isGroup: false,
      conversationType: ConversationType.DIRECT,
      externalChatId: "120363000000000@G.US ",
    },
  ])(
    "refuses group identity after the lock even if admission returned a stale/inconsistent row: %j",
    async (input) => {
      const f = fixture(input);
      await expect(f.service.runOnce(f.now)).resolves.toEqual({
        departments: 1,
        scanned: 1,
        closed: 0,
      });
      expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
      expect(f.tx.message.findFirst).not.toHaveBeenCalled();
      expect(f.tx.message.create).not.toHaveBeenCalled();
      expect(f.tx.outboxEvent.create).not.toHaveBeenCalled();
      expect(f.tx.conversation.update).not.toHaveBeenCalled();
      expect(f.outbox.dispatchMessage).not.toHaveBeenCalled();
      expect(f.realtime.publishMessageCreated).not.toHaveBeenCalled();
      expect(f.realtime.publishConversationUpdated).not.toHaveBeenCalled();
    },
  );

  it.each(["5511999990000@s.whatsapp.net", "123456789@lid", "5511999990000"])(
    "preserves eligible individual closure and tenant-scoped admission for %s",
    async (externalChatId) => {
      const f = fixture({
        isGroup: false,
        conversationType: ConversationType.DIRECT,
        externalChatId,
      });
      await expect(f.service.runOnce(f.now)).resolves.toEqual({
        departments: 1,
        scanned: 1,
        closed: 1,
      });
      const scope = {
        tenantId: "tenant-a",
        departmentId: "department-a",
        isGroup: false,
        conversationType: ConversationType.DIRECT,
        NOT: { externalChatId: { endsWith: "@g.us", mode: "insensitive" } },
        archivedAt: null,
        status: { in: [ConversationStatus.EM_ANDAMENTO, ConversationStatus.AGUARDANDO] },
      };
      expect(f.prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining(scope) }),
      );
      expect(f.tx.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ...scope, id: "conversation-a" }),
        }),
      );
      expect(f.tx.message.create).toHaveBeenCalledTimes(2);
      expect(f.tx.outboxEvent.create).toHaveBeenCalledOnce();
      expect(f.tx.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ConversationStatus.FECHADA }),
        }),
      );
      expect(f.outbox.dispatchMessage).toHaveBeenCalledWith("outbound-a");
    },
  );
});
