import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { MessagingErrorCode, MessagingProviderError } from "./messaging.contracts";
import {
  evolutionQrBase64,
  MessagingConnectionsService,
  parseImportStartDate,
} from "./messaging-connections.service";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  role: "tenant_admin",
  roleId: "role-admin",
  roleKey: "tenant_admin",
  permissions: [],
  departmentIds: [],
};

describe("MessagingConnectionsService", () => {
  it("separates the full administrative catalog from the Chat scope", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findMany.mockResolvedValue([connection()]);
    const service = new MessagingConnectionsService(prisma as never, {} as never);

    await service.list({ ...current, roleKey: "agent", connectionIds: ["connection-a"] } as never);
    expect(prisma.messagingConnection.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ id: expect.anything() }),
      }),
    );

    await service.listChatScope({
      ...current,
      roleKey: "agent",
      connectionIds: ["connection-a"],
    } as never);
    expect(prisma.messagingConnection.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["connection-a"] } }),
      }),
    );
  });

  it("does not depend on the automatic group synchronization service", () => {
    const source = readFileSync(resolve(__dirname, "messaging-connections.service.ts"), "utf8");

    expect(source).not.toContain("GroupsSyncService");
    expect(source).not.toContain("groupsSync");
  });

  it("treats the selected import date as midnight in São Paulo", () => {
    expect(parseImportStartDate("2026-09-17")?.toISOString()).toBe("2026-09-17T03:00:00.000Z");
    expect(parseImportStartDate("2026-02-31")).toBeNull();
  });

  it.each([
    [null, "Conecte a instância ao WhatsApp para cadastrar o número antes de editá-la."],
    ["5511999999999", "Esta instância não está disponível para edição."],
  ])(
    "rejects editing a connecting instance with phone %s without saving changes",
    async (ownerPhoneNormalized, message) => {
      const prisma = prismaMock();
      prisma.messagingConnection.findFirst.mockResolvedValue({
        ...connection(),
        status: MessagingConnectionStatus.CONNECTING,
        ownerPhoneNormalized,
      });

      await expect(
        new MessagingConnectionsService(prisma as never, {} as never).update(
          "connection-a",
          { name: "Novo nome" },
          current as never,
        ),
      ).rejects.toThrow(message);
      expect(prisma.messagingConnection.update).not.toHaveBeenCalled();
    },
  );

  it("validates and saves media configured for welcome messages", async () => {
    const prisma = prismaMock();
    const currentConnection = {
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
      ownerPhoneNormalized: "5511999999999",
      welcomeEnabled: false,
      welcomeNewMessage: null,
      welcomeExistingMessage: null,
      welcomeNewAttachment: null,
      welcomeExistingAttachment: null,
      absenceEnabled: false,
      absenceMessage: null,
      absenceAttachment: null,
    };
    const attachment = {
      fileName: "boas-vindas.png",
      mimeType: "image/png",
      size: 8,
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    };
    prisma.messagingConnection.findFirst.mockResolvedValue(currentConnection);
    prisma.messagingConnection.update.mockImplementation(async ({ data }) => ({
      ...currentConnection,
      ...data,
    }));

    await new MessagingConnectionsService(prisma as never, {} as never).update(
      "connection-a",
      {
        welcomeEnabled: true,
        welcomeNewMessage: "Olá!",
        welcomeExistingMessage: "Olá novamente!",
        welcomeNewAttachment: attachment,
        absenceEnabled: true,
        absenceMessage: "Voltamos em breve!",
        absenceAttachment: attachment,
      },
      current as never,
    );

    expect(prisma.messagingConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          welcomeNewAttachment: attachment,
          absenceAttachment: attachment,
        }),
      }),
    );
  });

  it("does not persist the removed instance default department field", async () => {
    const prisma = prismaMock();
    const currentConnection = {
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
      ownerPhoneNormalized: "5511999999999",
      welcomeEnabled: false,
      welcomeNewMessage: null,
      welcomeExistingMessage: null,
      welcomeNewAttachment: null,
      welcomeExistingAttachment: null,
      absenceEnabled: false,
      absenceMessage: null,
      absenceAttachment: null,
    };
    prisma.messagingConnection.findFirst.mockResolvedValue(currentConnection);
    prisma.messagingConnection.update.mockImplementation(async ({ data }) => ({
      ...currentConnection,
      ...data,
    }));

    await new MessagingConnectionsService(prisma as never, {} as never).update(
      "connection-a",
      { defaultDepartmentId: "department-sales" } as never,
      current as never,
    );

    expect(prisma.messagingConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ defaultDepartmentId: expect.anything() }),
      }),
    );
  });

  beforeEach(() => {
    process.env.EVOLUTION_BASE_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "key";
    process.env.EVOLUTION_WEBHOOK_PUBLIC_URL =
      "http://host.docker.internal:3001/api/webhooks/evolution";
    process.env.EVOLUTION_WEBHOOK_SECRET = "secret";
    process.env.TRIXUS_EVOLUTION_QR_RECONNECT_WAIT_MS = "5000";
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
      { name: "Suporte", color: "#A855F7" },
      current as never,
    );

    expect(prisma.messagingConnection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Suporte", color: "#A855F7" }),
    });
    expect(evolution.createInstance).toHaveBeenCalledWith({
      instanceName: expect.stringMatching(/^tenant-a-suporte-/),
    });
    expect(evolution.setWebhook).toHaveBeenCalledWith({
      instanceName: expect.stringMatching(/^tenant-a-suporte-/),
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "secret",
    });
  });

  it("reuses an idempotent onboarding connection without creating another provider instance", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    const evolution = {
      findInstance: vi.fn().mockResolvedValue({ connectionStatus: "connecting" }),
      connect: vi.fn().mockResolvedValue({ base64: "same-qr" }),
      createInstance: vi.fn(),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
    };

    const result = await new MessagingConnectionsService(
      prisma as never,
      evolution as never,
    ).createEvolution(
      { name: "Suporte", idempotencyKey: "onboarding-instance-a" },
      current as never,
    );

    expect(result).toMatchObject({ id: "connection-a", qrCodeBase64: "same-qr" });
    expect(evolution.createInstance).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("reuses an idempotent onboarding connection without consuming another plan slot", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    const evolution = {
      findInstance: vi.fn().mockResolvedValue({ connectionStatus: "connecting" }),
      connect: vi.fn().mockResolvedValue({ base64: "same-qr" }),
      createInstance: vi.fn(),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
    };
    const entitlements = {
      assertTenantOperational: vi.fn().mockResolvedValue(undefined),
      getUsage: vi.fn().mockResolvedValue({ connections: 1 }),
      assertWithinLimit: vi.fn(),
    };

    await expect(
      new MessagingConnectionsService(
        prisma as never,
        evolution as never,
        entitlements as never,
      ).createEvolution(
        { name: "Suporte", idempotencyKey: "onboarding-instance-a" },
        current as never,
      ),
    ).resolves.toMatchObject({ id: "connection-a", qrCodeBase64: "same-qr" });

    expect(entitlements.assertTenantOperational).toHaveBeenCalledWith("tenant-a");
    expect(entitlements.getUsage).not.toHaveBeenCalled();
    expect(entitlements.assertWithinLimit).not.toHaveBeenCalled();
    expect(evolution.createInstance).not.toHaveBeenCalled();
  });

  it("reconciles an ambiguous provider create failure before persisting once", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.create.mockResolvedValue(connection());
    const evolution = {
      findInstance: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ connectionStatus: "connecting" }),
      createInstance: vi.fn().mockRejectedValue(new Error("timeout")),
      connect: vi.fn().mockResolvedValue({ base64: "recovered-qr" }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      deleteInstance: vi.fn(),
    };

    const result = await new MessagingConnectionsService(
      prisma as never,
      evolution as never,
    ).createEvolution(
      { name: "Suporte", idempotencyKey: "onboarding-instance-a" },
      current as never,
    );

    expect(result).toMatchObject({ qrCodeBase64: "recovered-qr" });
    expect(prisma.messagingConnection.create).toHaveBeenCalledOnce();
    expect(evolution.deleteInstance).not.toHaveBeenCalled();
  });

  it("recovers a database uniqueness race without deleting the shared provider", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(connection());
    prisma.messagingConnection.create.mockRejectedValue({ code: "P2002" });
    const evolution = {
      findInstance: vi.fn().mockResolvedValue(null),
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      deleteInstance: vi.fn(),
    };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
        { name: "Suporte", idempotencyKey: "onboarding-instance-a" },
        current as never,
      ),
    ).resolves.toMatchObject({ id: "connection-a" });
    expect(evolution.deleteInstance).not.toHaveBeenCalled();
  });

  it("removes its provider instance when a uniqueness failure has no winning idempotent row", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.create.mockRejectedValue({ code: "P2002" });
    const evolution = {
      findInstance: vi.fn().mockResolvedValue(null),
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi.fn(),
      deleteInstance: vi.fn().mockResolvedValue({ ok: true }),
    };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
        { name: "Suporte", idempotencyKey: "onboarding-instance-a" },
        current as never,
      ),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(evolution.deleteInstance).toHaveBeenCalledOnce();
  });

  it("compensates a provider instance when the local transaction fails after its callback", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.create.mockResolvedValue(connection());
    prisma.$transaction.mockImplementation(async (callback) => {
      await callback(prisma);
      throw new Error("transaction commit failed");
    });
    const evolution = {
      findInstance: vi.fn().mockResolvedValue(null),
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi.fn(),
      deleteInstance: vi.fn().mockResolvedValue({ ok: true }),
    };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
        { name: "Suporte", idempotencyKey: "onboarding-instance-a" },
        current as never,
      ),
    ).rejects.toThrow("transaction commit failed");

    expect(evolution.deleteInstance).toHaveBeenCalledOnce();
    expect(evolution.setWebhook).not.toHaveBeenCalled();
  });

  it("finishes the provider call before opening the budgeted local transaction", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.create.mockResolvedValue(connection());
    const evolution = {
      findInstance: vi.fn().mockResolvedValue(null),
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
    };

    await new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
      { name: "Suporte", idempotencyKey: "onboarding-instance-a" },
      current as never,
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(evolution.createInstance.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$transaction.mock.invocationCallOrder[0],
    );
  });

  it("rejects reusing an idempotency key with a different instance name", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      name: "Comercial",
    });
    const evolution = { findInstance: vi.fn() };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
        { name: "Suporte", idempotencyKey: "onboarding-instance-a" },
        current as never,
      ),
    ).rejects.toMatchObject({
      response: { code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" },
    });
    expect(evolution.findInstance).not.toHaveBeenCalled();
  });

  it("does not add a newly created administrative instance to the creator Chat scope", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.create.mockResolvedValue(connection());
    prisma.role.findFirstOrThrow.mockResolvedValue({
      metadata: { color: "#2563EB", connectionIds: ["connection-existing"] },
    });
    const evolution = {
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      deleteInstance: vi.fn(),
    };

    await new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
      { name: "Suporte" },
      {
        ...current,
        roleId: "role-agent",
        roleKey: "agent",
        connectionIds: ["connection-existing"],
      } as never,
    );

    expect(prisma.role.update).not.toHaveBeenCalled();
  });

  it("uses the configured connection limit as the single rule for additional instances", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.create.mockResolvedValue(connection());
    const evolution = {
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      deleteInstance: vi.fn(),
    };
    const entitlements = {
      assertTenantOperational: vi.fn().mockResolvedValue(undefined),
      getUsage: vi.fn().mockResolvedValue({ connections: 1 }),
      assertWithinLimit: vi.fn().mockResolvedValue(undefined),
    };

    await new MessagingConnectionsService(
      prisma as never,
      evolution as never,
      entitlements as never,
    ).createEvolution({ name: "Comercial" }, current as never);

    expect(entitlements.assertWithinLimit).toHaveBeenCalledWith("tenant-a", "maxConnections", 1);
    expect(evolution.createInstance).toHaveBeenCalledOnce();
  });

  it("rejects a duplicate active instance name before calling Evolution", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({ id: "connection-existing" });
    const evolution = { createInstance: vi.fn() };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
        { name: "  SUPORTE " },
        current as never,
      ),
    ).rejects.toThrow("Já existe uma instância com este nome.");

    expect(evolution.createInstance).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        archivedAt: null,
        id: undefined,
        name: { equals: "SUPORTE", mode: "insensitive" },
      },
      select: { id: true },
    });
  });

  it("rejects renaming an instance to another active instance name", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst
      .mockResolvedValueOnce({
        ...connection(),
        status: MessagingConnectionStatus.CONNECTED,
        ownerPhoneNormalized: "5511999999999",
      })
      .mockResolvedValueOnce({ id: "connection-b" });

    await expect(
      new MessagingConnectionsService(prisma as never, {} as never).update(
        "connection-a",
        { name: "Comercial" },
        current as never,
      ),
    ).rejects.toThrow("Já existe uma instância com este nome.");

    expect(prisma.messagingConnection.update).not.toHaveBeenCalled();
  });

  it("keeps the created instance when webhook registration fails temporarily", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.create.mockResolvedValue(connection());
    const evolution = {
      createInstance: vi.fn().mockResolvedValue({ instance: { status: "connecting" } }),
      setWebhook: vi
        .fn()
        .mockRejectedValue(
          new MessagingProviderError(
            MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
            "Evolution webhook unavailable",
            true,
            503,
          ),
        ),
      deleteInstance: vi.fn(),
    };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
        { name: "Suporte" },
        current as never,
      ),
    ).resolves.toMatchObject({ id: "connection-a", status: "connecting" });

    expect(prisma.messagingConnection.create).toHaveBeenCalled();
    expect(evolution.deleteInstance).not.toHaveBeenCalled();
  });

  it("returns a controlled provider error when Evolution create fails", async () => {
    const prisma = prismaMock();
    const evolution = {
      createInstance: vi
        .fn()
        .mockRejectedValue(
          new MessagingProviderError(
            MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
            "Evolution unavailable",
            true,
            503,
          ),
        ),
      setWebhook: vi.fn(),
      deleteInstance: vi.fn(),
    };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).createEvolution(
        { name: "Suporte" },
        current as never,
      ),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prisma.messagingConnection.create).not.toHaveBeenCalled();
  });

  it("recreates only the external Evolution session when it is missing", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTING,
    });
    const evolution = {
      findInstance: vi.fn().mockResolvedValue(null),
      createInstance: vi.fn().mockResolvedValue({ base64: "cmVjcmVhdGVkLXFy" }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      connect: vi.fn(),
    };

    const result = await new MessagingConnectionsService(
      prisma as never,
      evolution as never,
    ).qrCode("connection-a", current as never);

    expect(result).toMatchObject({
      connectionId: "connection-a",
      qrCodeBase64: "data:image/png;base64,cmVjcmVhdGVkLXFy",
      status: "connecting",
    });
    expect(evolution.createInstance).toHaveBeenCalledWith({ instanceName: "tenant-a-suporte" });
    expect(evolution.connect).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.create).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.update).toHaveBeenCalledWith({
      where: { id: "connection-a" },
      data: { status: MessagingConnectionStatus.CONNECTING },
    });
  });

  it("returns a delayed webhook QR through the polling contract", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    const service = new MessagingConnectionsService(prisma as never, {} as never);

    await service.captureEvolutionQrCode(
      "connection-a",
      "tenant-a-suporte",
      "data:image/png;base64,cXItZGVsYXllZA==",
    );

    await expect(service.qrCodeStatus("connection-a", current as never)).resolves.toEqual({
      connectionId: "connection-a",
      qrCodeBase64: "data:image/png;base64,cXItZGVsYXllZA==",
      status: "connecting",
    });
  });

  it("reconciles a connected provider during QR polling when its webhook was missed", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.messagingConnection.findUniqueOrThrow.mockResolvedValue(connection());
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    const evolution = {
      connectionState: vi.fn().mockResolvedValue({ instance: { state: "open" } }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      fetchProfilePictureUrl: vi.fn().mockResolvedValue(null),
    };
    const service = new MessagingConnectionsService(prisma as never, evolution as never);
    await service.captureEvolutionQrCode(
      "connection-a",
      "tenant-a-suporte",
      "data:image/png;base64,c3RhbGUtcXI=",
    );

    await expect(service.qrCodeStatus("connection-a", current as never)).resolves.toEqual({
      connectionId: "connection-a",
      qrCodeBase64: null,
      status: "connected",
    });
    expect(prisma.messagingConnection.update).toHaveBeenCalledWith({
      where: { id: "connection-a" },
      data: expect.objectContaining({ status: MessagingConnectionStatus.CONNECTED }),
    });
  });

  it("marks the connection disconnected even when Evolution logout is already unavailable", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.DISCONNECTED,
    });
    const evolution = {
      logout: vi
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
      new MessagingConnectionsService(prisma as never, evolution as never).logout(
        "connection-a",
        current as never,
      ),
    ).resolves.toMatchObject({ status: "disconnected" });

    expect(prisma.messagingConnection.update).toHaveBeenCalledWith({
      where: { id: "connection-a" },
      data: { status: MessagingConnectionStatus.DISCONNECTED },
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

  it("physically deletes a connected instance and its linked operational data", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conversation-a",
        messages: [{ id: "message-a", mediaStorageKey: "tenants/tenant-a/messages/file.jpg" }],
      },
    ]);
    prisma.message.findMany.mockResolvedValue([
      { id: "message-a", mediaStorageKey: "tenants/tenant-a/messages/file.jpg" },
    ]);
    prisma.conversation.deleteMany.mockResolvedValue({ count: 1 });
    const mediaStorage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
    const evolution = { deleteInstance: vi.fn().mockResolvedValue({}) };

    await expect(
      new MessagingConnectionsService(
        prisma as never,
        evolution as never,
        undefined,
        undefined,
        undefined,
        undefined,
        mediaStorage as never,
      ).remove("connection-a", current as never),
    ).resolves.toMatchObject({
      deleted: true,
      deletedConversationCount: 1,
      deletedMessageCount: 1,
      mediaCleanup: "completed",
      providerInstanceExisted: true,
      idempotent: false,
    });

    expect(evolution.deleteInstance).toHaveBeenCalledWith("tenant-a-suporte");
    expect(prisma.messagingConnection.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "connection-a",
        tenantId: "tenant-a",
        archivedAt: null,
        status: MessagingConnectionStatus.CONNECTED,
        updatedAt: new Date("2026-07-30T00:00:00.000Z"),
      },
      data: { status: MessagingConnectionStatus.ERROR, serviceEnabled: false },
    });
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", conversationId: { in: ["conversation-a"] } },
      data: { conversationId: null },
    });
    expect(prisma.conversation.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", connectionId: "connection-a" },
    });
    expect(prisma.messagingConnection.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        id: "connection-a",
        status: MessagingConnectionStatus.ERROR,
        serviceEnabled: false,
      },
    });
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        OR: [
          { instanceIds: { hasSome: ["connection-a", "tenant-a-suporte"] } },
          { instance: { in: ["connection-a", "tenant-a-suporte"] } },
        ],
      },
      select: { id: true, instance: true, instanceIds: true },
    });
    expect(mediaStorage.deleteObject).toHaveBeenCalledWith("tenants/tenant-a/messages/file.jpg");
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-a",
        type: "messaging.media.cleanup.requested",
        aggregateId: "connection-a",
        payload: {
          connectionId: "connection-a",
          objectKeys: ["tenants/tenant-a/messages/file.jpg"],
        },
      },
      select: { id: true },
    });
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: "cleanup-a" },
      data: expect.objectContaining({ status: "PROCESSED", lastError: null }),
    });
  });

  it("preserves contacts while removing only references to the deleted instance", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    prisma.contact.findMany.mockResolvedValue([
      {
        id: "contact-a",
        instance: "tenant-a-suporte",
        instanceIds: ["connection-a", "connection-b"],
      },
      {
        id: "contact-b",
        instance: "connection-b",
        instanceIds: ["connection-b", "connection-a"],
      },
    ]);
    const evolution = { deleteInstance: vi.fn().mockResolvedValue({}) };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).resolves.toMatchObject({ deleted: true, unlinkedContactCount: 2 });

    expect(prisma.contact.update).toHaveBeenNthCalledWith(1, {
      where: { id: "contact-a" },
      data: { instance: "connection-b", instanceIds: ["connection-b"] },
    });
    expect(prisma.contact.update).toHaveBeenNthCalledWith(2, {
      where: { id: "contact-b" },
      data: { instance: "connection-b", instanceIds: ["connection-b"] },
    });
  });

  it("deletes campaigns, recipients, conversations, messages and auxiliary records", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    prisma.conversation.findMany.mockResolvedValue([{ id: "conversation-active", messages: [] }]);
    prisma.conversation.deleteMany.mockResolvedValue({ count: 1 });
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: "campaign-a",
        status: "COMPLETED",
        recipients: [{ id: "recipient-a", status: "SENT" }],
      },
    ]);
    prisma.campaign.deleteMany.mockResolvedValue({ count: 1 });
    prisma.campaignRecipient.deleteMany.mockResolvedValue({ count: 1 });
    const evolution = { deleteInstance: vi.fn().mockResolvedValue({}) };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).resolves.toMatchObject({
      deletedConversationCount: 1,
      deletedCampaignCount: 1,
      deletedCampaignRecipientCount: 1,
    });

    expect(prisma.conversation.deleteMany).toHaveBeenCalled();
    expect(prisma.campaignRecipient.deleteMany).toHaveBeenCalled();
    expect(prisma.campaign.deleteMany).toHaveBeenCalled();
    expect(prisma.notification.deleteMany).toHaveBeenCalled();
    expect(prisma.schedule.deleteMany).toHaveBeenCalled();
  });

  it("blocks physical deletion while a campaign is active", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: "campaign-running",
        status: "RUNNING",
        recipients: [],
      },
    ]);
    const evolution = { deleteInstance: vi.fn() };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).rejects.toThrow("Existem mensagens ou campanhas em processamento");

    expect(evolution.deleteInstance).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.deleteMany).not.toHaveBeenCalled();
  });

  it("blocks physical deletion while a scheduled message is claimed", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    prisma.schedule.findMany.mockResolvedValue([{ id: "schedule-a", executionStatus: "CLAIMED" }]);
    const evolution = { deleteInstance: vi.fn() };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).rejects.toThrow("Existem mensagens agendadas em processamento");

    expect(evolution.deleteInstance).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.deleteMany).not.toHaveBeenCalled();
  });

  it("removes only the deleted instance from role metadata", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
    });
    prisma.role.findMany.mockResolvedValue([
      {
        id: "role-a",
        metadata: {
          connectionIds: ["connection-a", "connection-b"],
          chatScopes: [
            { connectionId: "connection-a", departmentIds: ["department-a"] },
            { connectionId: "connection-b", departmentIds: ["department-b"] },
          ],
          customValue: "preserve-me",
        },
      },
    ]);
    const evolution = { deleteInstance: vi.fn().mockResolvedValue({}) };

    await new MessagingConnectionsService(prisma as never, evolution as never).remove(
      "connection-a",
      current as never,
    );

    expect(prisma.role.update).toHaveBeenCalledWith({
      where: { id: "role-a" },
      data: {
        metadata: {
          connectionIds: ["connection-b"],
          chatScopes: [{ connectionId: "connection-b", departmentIds: ["department-b"] }],
          customValue: "preserve-me",
        },
      },
    });
  });

  it("treats Evolution 404 as an idempotent provider success and purges locally", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
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
      deleted: true,
      providerInstanceExisted: false,
      idempotent: true,
    });
    expect(prisma.messagingConnection.deleteMany).toHaveBeenCalled();
  });

  it("does not finish local removal when Evolution is temporarily unavailable", async () => {
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
    ).rejects.toThrow("Nenhuma remoção local foi concluída");
    expect(prisma.messagingConnection.update).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "connection-a",
        tenantId: "tenant-a",
        archivedAt: null,
        status: MessagingConnectionStatus.ERROR,
        serviceEnabled: false,
        externalReference: "tenant-a-suporte",
      },
      data: {
        status: MessagingConnectionStatus.CONNECTING,
        serviceEnabled: true,
      },
    });
    expect(prisma.messagingConnection.delete).not.toHaveBeenCalled();
  });

  it("keeps a blocked retryable record when local finalization fails after provider removal", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.CONNECTED,
      serviceEnabled: true,
    });
    prisma.$transaction.mockRejectedValueOnce(new Error("database unavailable"));
    const evolution = { deleteInstance: vi.fn().mockResolvedValue({}) };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).remove(
        "connection-a",
        current as never,
      ),
    ).rejects.toThrow("database unavailable");

    expect(evolution.deleteInstance).toHaveBeenCalledWith("tenant-a-suporte");
    expect(prisma.messagingConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: MessagingConnectionStatus.ERROR, serviceEnabled: false },
      }),
    );
    expect(prisma.messagingConnection.update).not.toHaveBeenCalled();
  });

  it("finishes a pending removal when retry confirms the provider instance is already absent", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.ERROR,
      serviceEnabled: false,
    });
    prisma.messagingConnection.update.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.REMOVED,
      serviceEnabled: false,
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
    ).resolves.toMatchObject({ deleted: true, idempotent: true });

    expect(prisma.messagingConnection.deleteMany).toHaveBeenCalled();
  });

  it("physically purges a legacy record that was already archived", async () => {
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
    ).resolves.toMatchObject({ deleted: true, idempotent: true });

    expect(evolution.deleteInstance).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "connection-a" },
    });
  });

  it("blocks provider reconciliation while a removal retry is pending", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      status: MessagingConnectionStatus.ERROR,
      serviceEnabled: false,
    });
    const evolution = { findInstance: vi.fn(), connectionState: vi.fn() };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).status(
        "connection-a",
        current as never,
      ),
    ).rejects.toThrow("remoção pendente");
    expect(evolution.findInstance).not.toHaveBeenCalled();
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
      connectionState: vi.fn().mockResolvedValue({ instance: { state: "close" } }),
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

  it("replaces only a confirmed closed external session when connect returns no QR", async () => {
    vi.useFakeTimers();
    try {
      const prisma = prismaMock();
      prisma.messagingConnection.findFirst.mockResolvedValue(connection());
      prisma.messagingConnection.update.mockResolvedValue({
        ...connection(),
        status: MessagingConnectionStatus.CONNECTING,
      });
      const evolution = {
        findInstance: vi.fn().mockResolvedValue({ name: "tenant-a-suporte" }),
        connectionState: vi
          .fn()
          .mockResolvedValueOnce({ instance: { state: "close" } })
          .mockResolvedValueOnce({ instance: { state: "close" } }),
        connect: vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ base64: "bmV3LXFy" }),
        setWebhook: vi.fn().mockResolvedValue({ ok: true }),
        deleteInstance: vi.fn().mockResolvedValue({ ok: true }),
        createInstance: vi.fn().mockResolvedValue({}),
      };

      const request = new MessagingConnectionsService(prisma as never, evolution as never).qrCode(
        "connection-a",
        current as never,
      );
      await vi.advanceTimersByTimeAsync(5_250);

      await expect(request).resolves.toMatchObject({
        connectionId: "connection-a",
        qrCodeBase64: "data:image/png;base64,bmV3LXFy",
        status: "connecting",
      });
      expect(evolution.deleteInstance).toHaveBeenCalledWith("tenant-a-suporte");
      expect(evolution.createInstance).toHaveBeenCalledWith({ instanceName: "tenant-a-suporte" });
      expect(prisma.messagingConnection.create).not.toHaveBeenCalled();
      expect(prisma.messagingConnection.delete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never replaces the external session when the connect result is an error", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    const evolution = {
      findInstance: vi.fn().mockResolvedValue({ name: "tenant-a-suporte" }),
      connectionState: vi.fn().mockResolvedValue({ instance: { state: "close" } }),
      connect: vi
        .fn()
        .mockRejectedValue(
          new MessagingProviderError(
            MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
            "Evolution unavailable",
            true,
            503,
          ),
        ),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
      deleteInstance: vi.fn(),
      createInstance: vi.fn(),
    };

    await expect(
      new MessagingConnectionsService(prisma as never, evolution as never).qrCode(
        "connection-a",
        current as never,
      ),
    ).rejects.toThrow(MessagingProviderError);

    expect(evolution.deleteInstance).not.toHaveBeenCalled();
    expect(evolution.createInstance).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.delete).not.toHaveBeenCalled();
  });

  it("does not replace a closed external session after losing the distributed lock", async () => {
    vi.useFakeTimers();
    try {
      const prisma = prismaMock();
      prisma.messagingConnection.findFirst.mockResolvedValue(connection());
      const evolution = {
        findInstance: vi.fn().mockResolvedValue({ name: "tenant-a-suporte" }),
        connectionState: vi
          .fn()
          .mockResolvedValueOnce({ instance: { state: "close" } })
          .mockResolvedValueOnce({ instance: { state: "close" } }),
        connect: vi.fn().mockResolvedValue({}),
        setWebhook: vi.fn().mockResolvedValue({ ok: true }),
        deleteInstance: vi.fn(),
        createInstance: vi.fn(),
      };
      const qrCodes = {
        acquireGenerationLock: vi.fn().mockResolvedValue("owner-token"),
        renewGenerationLock: vi.fn().mockResolvedValue(false),
        releaseGenerationLock: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        clear: vi.fn().mockResolvedValue(undefined),
      };
      const service = new MessagingConnectionsService(
        prisma as never,
        evolution as never,
        undefined,
        undefined,
        undefined,
        qrCodes as never,
      );

      const request = service.qrCode("connection-a", current as never);
      const rejection = expect(request).rejects.toThrow("Outra tentativa de reconexão");
      await vi.advanceTimersByTimeAsync(5_250);

      await rejection;
      expect(evolution.deleteInstance).not.toHaveBeenCalled();
      expect(evolution.createInstance).not.toHaveBeenCalled();
      expect(prisma.messagingConnection.delete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

    process.env.EVOLUTION_WEBHOOK_SECRET = ["secret", "before", "restart"].join("-");
    await service.ensureWebhookConfigured("tenant-a-suporte");
    process.env.EVOLUTION_WEBHOOK_SECRET = ["secret", "after", "restart"].join("-");
    await service.ensureWebhookConfigured("tenant-a-suporte");

    expect(evolution.setWebhook).toHaveBeenNthCalledWith(1, {
      instanceName: "tenant-a-suporte",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: ["secret", "before", "restart"].join("-"),
    });
    expect(evolution.setWebhook).toHaveBeenNthCalledWith(2, {
      instanceName: "tenant-a-suporte",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: ["secret", "after", "restart"].join("-"),
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
      messagesEditedPresent: false,
      messagesDeletePresent: false,
      qrCodeUpdatedPresent: false,
      connectionUpdatePresent: false,
      secretBackendConfigured: true,
      secretEvolutionConfigured: true,
      secretMatch: true,
      headerJwtKeyPresent: true,
    });
  });

  it("repairs a connected instance whose deletion webhook is missing", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findMany.mockResolvedValue([
      { id: "connection-a", tenantId: "tenant-a", externalReference: "tenant-a-suporte" },
    ]);
    const evolution = {
      findInstance: vi
        .fn()
        .mockResolvedValueOnce({
          name: "tenant-a-suporte",
          Webhook: {
            url: "http://host.docker.internal:3001/api/webhooks/evolution",
            headers: { jwt_key: "secret" },
            events: ["MESSAGES_UPSERT"],
          },
        })
        .mockResolvedValueOnce({
          name: "tenant-a-suporte",
          Webhook: {
            url: "http://host.docker.internal:3001/api/webhooks/evolution",
            events: ["MESSAGES_UPSERT", "MESSAGES_EDITED", "MESSAGES_DELETE"],
            headers: { jwt_key: "secret" },
          },
        }),
      setWebhook: vi.fn().mockResolvedValue({ ok: true }),
    };

    await expect(
      new MessagingConnectionsService(
        prisma as never,
        evolution as never,
      ).reconcileConnectedWebhooks(),
    ).resolves.toMatchObject({ scanned: 1, healthy: 0, repaired: 1, failed: 0 });
    expect(evolution.setWebhook).toHaveBeenCalledWith({
      instanceName: "tenant-a-suporte",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "secret",
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
    serviceEnabled: true,
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
      findUniqueOrThrow: vi.fn().mockResolvedValue(connection()),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    message: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    campaign: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    campaignRecipient: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    department: { findFirst: vi.fn() },
    role: {
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    ticket: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    schedule: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    notification: {
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    messagingHistoryImport: { count: vi.fn().mockResolvedValue(0) },
    outboxEvent: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "cleanup-a" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ tenantId: "tenant-a" }]),
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}
