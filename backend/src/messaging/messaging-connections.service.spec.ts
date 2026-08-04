import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { MessagingErrorCode, MessagingProviderError } from "./messaging.contracts";
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
  beforeEach(() => {
    process.env.EVOLUTION_BASE_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "key";
    process.env.EVOLUTION_WEBHOOK_PUBLIC_URL =
      "http://host.docker.internal:3001/api/webhooks/evolution";
    process.env.EVOLUTION_WEBHOOK_SECRET = "secret";
  });

  it("creates Evolution instances and explicitly registers webhook", async () => {
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
    const evolution = { setWebhook: vi.fn().mockResolvedValue({ ok: true }) };

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

  it("archives a connected connection after Evolution delete returns 204", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.REMOVED,
      externalReference: null,
      archivedAt: new Date("2026-08-04T00:00:00.000Z"),
    });
    const evolution = { deleteInstance: vi.fn().mockResolvedValue({}) };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).resolves.toMatchObject({
      removed: true,
      archived: true,
      status: "removed",
      providerInstanceExisted: true,
      idempotent: false,
    });

    expect(evolution.deleteInstance).toHaveBeenCalledWith("tenant-a-suporte");
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.delete).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: "tenant-a", id: "connection-a" } },
      data: {
        status: MessagingConnectionStatus.REMOVED,
        externalReference: null,
        ownerExternalId: null,
        ownerPhoneNormalized: null,
        archivedAt: expect.any(Date),
      },
    });
  });

  it("treats Evolution 404 as an idempotent archive success", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.REMOVED,
      externalReference: null,
      archivedAt: new Date("2026-08-04T00:00:00.000Z"),
    });
    const evolution = {
      deleteInstance: vi
        .fn()
        .mockRejectedValue(
          new MessagingProviderError(
            MessagingErrorCode.PROVIDER_UNAVAILABLE,
            "Instance not found",
            false,
            404,
          ),
        ),
    };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).resolves.toMatchObject({
      removed: true,
      providerInstanceExisted: false,
      idempotent: true,
    });
    expect(prisma.messagingConnection.update).toHaveBeenCalled();
  });

  it("maps temporary Evolution failures to canonical 503 without archiving locally", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    const evolution = {
      deleteInstance: vi
        .fn()
        .mockRejectedValue(
          new MessagingProviderError(
            MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
            "Evolution unavailable",
            true,
            503,
          ),
        ),
    };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.messagingConnection.update).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.delete).not.toHaveBeenCalled();
  });

  it("returns success for duplicate remove requests when the connection is already archived", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.REMOVED,
      archivedAt: new Date("2026-08-04T00:00:00.000Z"),
    });
    const evolution = { deleteInstance: vi.fn() };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).resolves.toMatchObject({ removed: true, archived: true, idempotent: true });

    expect(evolution.deleteInstance).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.update).not.toHaveBeenCalled();
  });

  it("ensures webhook again when QR reconnect is requested", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTING,
    });
    const evolution = {
      findInstance: vi.fn().mockResolvedValue({ name: "tenant-a-suporte" }),
      connect: vi.fn().mockResolvedValue({ base64: "qr" }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
    };

    await new MessagingConnectionsService(prisma as never, evolution as never).qrCode(
      "connection-a",
      current as never,
    );

    expect(evolution.setWebhook).toHaveBeenCalledTimes(1);
    expect(evolution.setWebhook).toHaveBeenCalledWith({
      instanceName: "tenant-a-suporte",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "secret",
    });
  });

  it("ensures webhook exactly once when reconciliation sees a connected instance", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
      ownerExternalId: "551199990000@s.whatsapp.net",
      ownerPhoneNormalized: "+551199990000",
    });
    const evolution = {
      findInstance: vi.fn().mockResolvedValue({
        name: "tenant-a-suporte",
        ownerJid: "551199990000@s.whatsapp.net",
        Webhook: { url: "old-url" },
      }),
      connectionState: vi.fn().mockResolvedValue({ instance: { state: "open" } }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
    };

    await new MessagingConnectionsService(prisma as never, evolution as never).status(
      "connection-a",
      current as never,
    );

    expect(evolution.setWebhook).toHaveBeenCalledTimes(1);
    expect(prisma.messagingConnection.update).toHaveBeenCalledWith({
      where: { id: "connection-a" },
      data: {
        status: MessagingConnectionStatus.CONNECTED,
        ownerExternalId: "551199990000@s.whatsapp.net",
        ownerPhoneNormalized: "+551199990000",
      },
    });
  });

  it("exposes an idempotent webhook ensure operation", async () => {
    const prisma = prismaMock();
    const evolution = { setWebhook: vi.fn().mockResolvedValue({ ok: true }) };
    const service = new MessagingConnectionsService(prisma as never, evolution as never);

    await service.ensureWebhookConfigured("tenant-a-suporte");
    await service.ensureWebhookConfigured("tenant-a-suporte");

    expect(evolution.setWebhook).toHaveBeenCalledTimes(2);
    expect(evolution.setWebhook).toHaveBeenLastCalledWith({
      instanceName: "tenant-a-suporte",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "secret",
    });
  });

  it("reapplies the current webhook secret on every ensure call", async () => {
    const prisma = prismaMock();
    const evolution = { setWebhook: vi.fn().mockResolvedValue({ ok: true }) };
    const service = new MessagingConnectionsService(prisma as never, evolution as never);

    process.env.EVOLUTION_WEBHOOK_SECRET = "secret-before-restart";
    await service.ensureWebhookConfigured("tenant-a-suporte");
    process.env.EVOLUTION_WEBHOOK_SECRET = "secret-after-restart";
    await service.ensureWebhookConfigured("tenant-a-suporte");

    expect(evolution.setWebhook).toHaveBeenNthCalledWith(1, {
      instanceName: "tenant-a-suporte",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "secret-before-restart",
    });
    expect(evolution.setWebhook).toHaveBeenNthCalledWith(2, {
      instanceName: "tenant-a-suporte",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "secret-after-restart",
    });
  });

  it("audits webhook secret parity without exposing the secret value", async () => {
    const prisma = prismaMock();
    process.env.EVOLUTION_WEBHOOK_SECRET = "secret";
    const evolution = {
      findInstance: vi.fn().mockResolvedValue({
        name: "tenant-a-suporte",
        Webhook: {
          enabled: true,
          url: "http://host.docker.internal:3001/api/webhooks/evolution",
          events: ["MESSAGES_UPSERT"],
          headers: { jwt_key: "secret" },
        },
      }),
    };

    await expect(
      new MessagingConnectionsService(
        prisma as never,
        evolution as never,
      ).auditWebhookConfiguration("tenant-a-suporte"),
    ).resolves.toEqual({
      instanceName: "tenant-a-suporte",
      urlCorrect: true,
      messagesUpsertPresent: true,
      secretBackendConfigured: true,
      secretEvolutionConfigured: true,
      secretMatch: true,
      headerJwtKeyPresent: true,
    });
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
    archivedAt: null,
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
      count: vi.fn().mockResolvedValue(0),
    },
    message: { updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    conversation: { updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    campaign: { count: vi.fn().mockResolvedValue(0) },
    campaignRecipient: { count: vi.fn().mockResolvedValue(0) },
    ticket: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}
