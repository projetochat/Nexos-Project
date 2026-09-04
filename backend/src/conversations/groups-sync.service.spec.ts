import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { GroupsSyncService } from "./groups-sync.service";

describe("GroupsSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs group data without blocking on group profile picture lookups", async () => {
    const prisma = prismaMock();
    const evolution = evolutionMock({ imageUrl: null });
    const service = new GroupsSyncService(prisma as never, evolution as never);

    const result = await service.sync({ tenantId: "tenant-a", connectionId: "connection-a" });

    expect(evolution.fetchGroups).toHaveBeenCalledWith({
      instanceName: "instance-a",
      getParticipants: true,
    });
    expect(evolution.findGroupInfo).toHaveBeenCalledWith({
      instanceName: "instance-a",
      groupJid: "120363@g.us",
    });
    expect(evolution.fetchProfilePictureUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      synced: 1,
      created: 1,
      updated: 0,
      failed: 0,
      connections: 1,
      groups: 1,
      participants: 1,
    });
    expect(prisma.messagingConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ groupsSyncStatus: "SUCCESS" }) }),
    );
  });

  it("runs a light group sync without fetching participants or details", async () => {
    const prisma = prismaMock();
    const evolution = evolutionMock({ imageUrl: null });
    evolution.fetchGroups.mockResolvedValue([
      {
        groupJid: "120363@g.us",
        subject: "Grupo Suporte",
        imageUrl: null,
        createdAt: new Date("2026-09-04T10:00:00.000Z"),
        participants: [],
      },
    ]);
    const service = new GroupsSyncService(prisma as never, evolution as never);

    const result = await service.sync({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      includeParticipants: false,
    });

    expect(evolution.fetchGroups).toHaveBeenCalledWith({
      instanceName: "instance-a",
      getParticipants: false,
    });
    expect(evolution.findGroupInfo).not.toHaveBeenCalled();
    expect(prismaTx.conversationParticipant.upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      synced: 1,
      participants: 0,
      includeParticipants: false,
      participantNamesUpdated: 0,
    });
  });

  it("marks participants missing from the latest group snapshot as inactive", async () => {
    const prisma = prismaMock();
    const evolution = evolutionMock({ imageUrl: "https://image.test/group.jpg" });
    const service = new GroupsSyncService(prisma as never, evolution as never);

    await service.sync({ tenantId: "tenant-a", connectionId: "connection-a" });

    expect(prismaTx.conversationParticipant.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        conversationId: "conversation-a",
        active: true,
        externalParticipantId: { notIn: ["5562985125113@s.whatsapp.net"] },
      },
      data: { active: false },
    });
  });

  it("reconciles group participant names from saved contacts and the connection owner", async () => {
    const prisma = prismaMock();
    prisma.conversationParticipant.findMany.mockResolvedValue([
      participant({ id: "participant-owner", phone: "5562992728679" }),
      participant({ id: "participant-contact", phone: "5562985125113" }),
    ]);
    prisma.contact.findMany.mockResolvedValue([
      { normalizedPhone: "+5562985125113", name: "Douglas Rezende" },
    ]);
    const service = new GroupsSyncService(prisma as never, evolutionMock({ imageUrl: null }) as never);

    const result = await service.reconcileGroupParticipantNames({ tenantId: "tenant-a" });

    expect(result).toEqual({ checked: 2, updated: 2 });
    expect(prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "participant-owner" },
      data: { displayName: "Você" },
    });
    expect(prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "participant-contact" },
      data: { displayName: "Douglas Rezende" },
    });
  });
});

const prismaTx = {
  contact: {
    upsert: vi.fn(),
  },
  conversation: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  conversationParticipant: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
};

function prismaMock() {
  prismaTx.contact.upsert.mockResolvedValue({ id: "contact-a" });
  prismaTx.conversation.findFirst.mockResolvedValue(null);
  prismaTx.conversation.create.mockResolvedValue({ id: "conversation-a" });
  prismaTx.conversation.update.mockResolvedValue({ id: "conversation-a" });
  prismaTx.conversationParticipant.upsert.mockResolvedValue({ id: "participant-a" });
  prismaTx.conversationParticipant.updateMany.mockResolvedValue({ count: 1 });

  return {
    messagingConnection: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "connection-a",
          tenantId: "tenant-a",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          externalReference: "instance-a",
          archivedAt: null,
        },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    conversationParticipant: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn((input: unknown) => {
      if (typeof input === "function") return input(prismaTx);
      return Promise.all(input as Promise<unknown>[]);
    }),
  };
}

function evolutionMock(input: { imageUrl: string | null }) {
  return {
    fetchGroups: vi.fn().mockResolvedValue([
      {
        groupJid: "120363@g.us",
        subject: "Grupo Suporte",
        imageUrl: input.imageUrl,
        createdAt: new Date("2026-09-04T10:00:00.000Z"),
        participants: [
          {
            externalParticipantId: "5562985125113@s.whatsapp.net",
            phone: "5562985125113",
            displayName: "Contato A",
            isAdmin: true,
            isSuperAdmin: false,
          },
        ],
      },
    ]),
    findGroupInfo: vi.fn().mockResolvedValue(null),
    fetchProfilePictureUrl: vi.fn().mockResolvedValue("https://image.test/group.jpg"),
  };
}
function participant(overrides: Partial<ReturnType<typeof baseParticipant>> = {}) {
  return { ...baseParticipant(), ...overrides };
}

function baseParticipant() {
  return {
    id: "participant-a",
    phone: "5562985125113",
    externalParticipantId: "5562985125113@s.whatsapp.net",
    displayName: null,
    conversation: {
      connection: { ownerPhoneNormalized: "+5562992728679" },
    },
  };
}
