import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { evolutionQrBase64, MessagingConnectionsService } from "./messaging-connections.service";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  role: "tenant_admin",
  permissions: [],
  departmentIds: [],
};

describe("MessagingConnectionsService", () => {
  it("creates Evolution instances and explicitly registers webhook", async () => {
    process.env.EVOLUTION_BASE_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "key";
    process.env.EVOLUTION_WEBHOOK_PUBLIC_URL =
      "http://host.docker.internal:3001/api/webhooks/evolution";
    process.env.EVOLUTION_WEBHOOK_SECRET = "secret";

    const prisma = prismaMock();
    prisma.messagingConnection.create.mockResolvedValue(connection());
    const evolution = {
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      deleteInstance: vi.fn(),
    };

    await new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
      { name: "Suporte" },
      current as never,
    );

    expect(evolution.createInstance).toHaveBeenCalledWith({
      instanceName: expect.stringMatching(/^tenant-a-suporte-/),
    });
    expect(evolution.setWebhook).toHaveBeenCalledWith({
      instanceName: expect.stringMatching(/^tenant-a-suporte-/),
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "secret",
    });
  });

  it("returns a business error for QR when the Evolution instance is missing", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.ERROR,
    });
    const evolution = { findInstance: vi.fn().mockResolvedValue(null) };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).qrCode(
        "connection-a",
        current as never,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.messagingConnection.update).toHaveBeenCalledWith({
      where: { id: "connection-a" },
      data: { status: MessagingConnectionStatus.ERROR },
    });
  });

  it("marks a second connected same-tenant owner as error", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findUniqueOrThrow.mockResolvedValue(connection());
    prisma.messagingConnection.findFirst.mockResolvedValue({ ...connection(), id: "connection-b" });
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.ERROR,
      ownerPhoneNormalized: "+551199990000",
    });
    const evolution = {};

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).updateConnectionStatus(
        "connection-a",
        MessagingConnectionStatus.CONNECTED,
        {
          ownerExternalId: "551199990000@s.whatsapp.net",
          ownerPhoneNormalized: "+551199990000",
        },
      ),
    ).resolves.toMatchObject({ status: MessagingConnectionStatus.ERROR });

    expect(prisma.messagingConnection.update).toHaveBeenCalledWith({
      where: { id: "connection-a" },
      data: {
        status: MessagingConnectionStatus.ERROR,
        ownerExternalId: "551199990000@s.whatsapp.net",
        ownerPhoneNormalized: "+551199990000",
      },
    });
  });

  it("ignores raw instanceName and always generates a unique technical instance", async () => {
    process.env.EVOLUTION_BASE_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "key";
    process.env.EVOLUTION_WEBHOOK_PUBLIC_URL =
      "http://host.docker.internal:3001/api/webhooks/evolution";
    process.env.EVOLUTION_WEBHOOK_SECRET = "secret";

    const prisma = prismaMock();
    prisma.messagingConnection.create.mockResolvedValue(connection());
    const evolution = {
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      deleteInstance: vi.fn(),
    };

    await new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
      { name: "Suporte", instanceName: "manual-raw-name" },
      current as never,
    );

    expect(evolution.createInstance).toHaveBeenCalledWith({
      instanceName: expect.stringMatching(/^tenant-a-suporte-/),
    });
  });

  it("removes orphaned local connections without requiring an Evolution instance", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    const evolution = { findInstance: vi.fn().mockResolvedValue(null), deleteInstance: vi.fn() };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).resolves.toMatchObject({ removed: true, providerInstanceExisted: false });

    expect(evolution.deleteInstance).not.toHaveBeenCalled();
    expect(prisma.message.updateMany).toHaveBeenCalled();
    expect(prisma.conversation.updateMany).toHaveBeenCalled();
    expect(prisma.messagingConnection.delete).toHaveBeenCalled();
  });

  it("reads QR base64 from create and connect Evolution payload shapes", () => {
    expect(evolutionQrBase64({ qrcode: { base64: "create-qr" } })).toBe("create-qr");
    expect(evolutionQrBase64({ base64: "connect-qr" })).toBe("connect-qr");
    expect(evolutionQrBase64({})).toBeNull();
  });
});

function connection() {
  return {
    id: "connection-a",
    tenantId: "tenant-a",
    name: "Suporte",
    providerType: MessagingProviderType.EVOLUTION,
    status: MessagingConnectionStatus.CONNECTING,
    externalReference: "tenant-a-suporte",
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
  };
}

function prismaMock() {
  const prisma = {
    messagingConnection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: { updateMany: vi.fn() },
    conversation: { updateMany: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}
