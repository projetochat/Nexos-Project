import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { expect, it, vi } from "vitest";
import { SaveScheduleDto } from "./schedules.dto";
import { SchedulesController } from "./schedules.module";
const item = {
  id: "52a2dc2a-d80b-41bb-b97a-0d5365539bc3",
  identifier: "Teste",
  type: "task",
  title: "Teste",
  destination: "Sistema",
  scheduledAt: "2099-09-20T10:00:00.000Z",
  recurrence: "once",
  delivery: false,
  status: "pending",
  connectionId: "",
  departmentId: "",
  content: "Teste",
  recipientIds: [],
  recipients: [],
  recurrenceDays: [],
  recurrenceLimit: "",
  recurrenceUntil: "",
  assignedMembershipId: "",
  attachmentName: null,
};
const attachment = {
  fileName: "lembrete.txt",
  mimeType: "text/plain",
  size: 5,
  dataUrl: "data:text/plain;base64,VGVzdGU=",
};
it("rejects client-supplied tenant ownership", async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  await expect(
    pipe.transform(item, { type: "body", metatype: SaveScheduleDto }),
  ).resolves.toMatchObject(item);
  await expect(
    pipe.transform(
      { ...item, tenantId: "another-tenant" },
      { type: "body", metatype: SaveScheduleDto },
    ),
  ).rejects.toThrow();
  await expect(
    pipe.transform({ ...item, attachment }, { type: "body", metatype: SaveScheduleDto }),
  ).resolves.toMatchObject({ attachment });
  await expect(
    pipe.transform({ ...item, attachment: null }, { type: "body", metatype: SaveScheduleDto }),
  ).resolves.toMatchObject({ attachment: null });
  await expect(
    pipe.transform(
      {
        ...item,
        content: "",
        attachment: {
          ...attachment,
          fileName: "audio.ogg",
          mimeType: "audio/ogg;codecs=opus",
          dataUrl: "data:audio/ogg;codecs=opus;base64,T2dnUw==",
        },
      },
      { type: "body", metatype: SaveScheduleDto },
    ),
  ).resolves.toMatchObject({ content: "", attachment: { mimeType: "audio/ogg;codecs=opus" } });
  await expect(
    pipe.transform(
      { ...item, attachment: { ...attachment, dataUrl: "invalid" } },
      { type: "body", metatype: SaveScheduleDto },
    ),
  ).rejects.toThrow();
});
it("uses the authenticated tenant on reads, writes and deletions", async () => {
  const prisma = {
    schedule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: item.id,
        connectionId: null,
        executionStatus: null,
        version: 0,
        payload: item,
      }),
      create: vi.fn().mockImplementation(async ({ data }) => data),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const realtime = { publish: vi.fn() };
  const controller = new SchedulesController(prisma as never, realtime as never);
  const user = { tenantId: "tenant-a", roleKey: "tenant_admin" } as never;
  await controller.save(item as never, user);
  await controller.list(user);
  await controller.remove(item.id, user);
  expect(prisma.schedule.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a" }),
    }),
  );
  expect(prisma.schedule.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { tenantId: "tenant-a" } }),
  );
  expect(prisma.schedule.deleteMany).toHaveBeenCalledWith({
    where: { tenantId: "tenant-a", id: item.id, version: 0, executionStatus: null },
  });
  expect(realtime.publish).toHaveBeenCalledWith({ tenantId: "tenant-a" }, "schedule.updated", {
    scheduleId: item.id,
  });
});
it("does not allow a restricted user to overwrite a schedule on another instance", async () => {
  const prisma = {
    schedule: {
      findUnique: vi.fn().mockResolvedValue({ connectionId: "hidden" }),
      create: vi.fn(),
    },
  };
  const controller = new SchedulesController(prisma as never, {} as never);
  await expect(
    controller.save(item as never, { tenantId: "a", roleKey: "agent", connectionIds: [] } as never),
  ).rejects.toThrow("Agendamento não encontrado");
  expect(prisma.schedule.create).not.toHaveBeenCalled();
});

it("filters schedules by an authorized conversation on the server", async () => {
  const prisma = {
    conversation: {
      findFirst: vi.fn().mockResolvedValue({ id: "conversation-a", connectionId: "connection-a" }),
    },
    schedule: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const controller = new SchedulesController(prisma as never, {} as never);
  const user = {
    tenantId: "tenant-a",
    roleKey: "agent",
    connectionIds: ["connection-a"],
  } as never;

  await controller.list(user, { conversationId: "conversation-a" });

  expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
    where: {
      id: "conversation-a",
      tenantId: "tenant-a",
      archivedAt: null,
      connectionId: { in: ["connection-a"] },
    },
    select: { id: true, connectionId: true },
  });
  expect(prisma.schedule.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        AND: [
          {
            tenantId: "tenant-a",
            OR: [{ connectionId: null }, { connectionId: { in: ["connection-a"] } }],
          },
          { payload: { path: ["conversationId"], equals: "conversation-a" } },
        ],
      },
    }),
  );
});

it("lists schedules by scheduled time and then creation time in ascending order", async () => {
  const makeRow = (id: string, scheduledAt: string, createdAt: string) => ({
    id,
    payload: { ...item, id, scheduledAt },
    createdAt: new Date(createdAt),
  });
  const prisma = {
    schedule: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          makeRow("later", "2099-09-21T10:00:00.000Z", "2099-01-01T00:00:00.000Z"),
          makeRow("tie-newer", "2099-09-20T10:00:00.000Z", "2099-01-02T00:00:00.000Z"),
          makeRow("tie-older", "2099-09-20T10:00:00.000Z", "2099-01-01T00:00:00.000Z"),
        ]),
    },
  };
  const controller = new SchedulesController(prisma as never, {} as never);

  const result = await controller.list({ tenantId: "tenant-a", roleKey: "tenant_admin" } as never);

  expect(result.map((schedule) => schedule.id)).toEqual(["tie-older", "tie-newer", "later"]);
  expect(prisma.schedule.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  );
});

it("derives the schedule connection from the authorized conversation", async () => {
  const message = {
    ...item,
    type: "message",
    conversationId: "conversation-a",
    connectionId: "",
  };
  const prisma = {
    conversation: {
      findFirst: vi.fn().mockResolvedValue({ id: "conversation-a", connectionId: "connection-a" }),
    },
    schedule: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => data),
    },
    contact: { count: vi.fn().mockResolvedValue(0) },
  };
  const controller = new SchedulesController(prisma as never, { publish: vi.fn() } as never);

  const saved = await controller.save(
    message as never,
    {
      tenantId: "tenant-a",
      membershipId: "membership-a",
      roleKey: "agent",
      connectionIds: ["connection-a"],
    } as never,
  );

  expect(prisma.schedule.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ connectionId: "connection-a" }) }),
  );
  expect(saved).toMatchObject({ conversationId: "conversation-a", connectionId: "connection-a" });
  expect(prisma.schedule.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        executionStatus: "PENDING",
        dueAt: new Date("2099-09-20T10:00:00.000Z"),
        createdByMembershipId: "membership-a",
      }),
    }),
  );
});

it("derives executable state on the server and rejects unsafe edits or invalid delivery data", async () => {
  const conversation = {
    findFirst: vi.fn().mockResolvedValue({ id: "conversation-a", connectionId: "connection-a" }),
  };
  const baseMessage = {
    ...item,
    type: "message",
    conversationId: "conversation-a",
    connectionId: "",
  };
  const user = {
    tenantId: "tenant-a",
    membershipId: "membership-a",
    roleKey: "tenant_admin",
  } as never;

  const past = new SchedulesController(
    { conversation, schedule: { findUnique: vi.fn().mockResolvedValue(null) } } as never,
    {} as never,
  );
  await expect(
    past.save({ ...baseMessage, scheduledAt: "2020-01-01T00:00:00.000Z" } as never, user),
  ).rejects.toThrow("data e horário futuros");

  const oversized = new SchedulesController(
    { conversation, schedule: { findUnique: vi.fn().mockResolvedValue(null) } } as never,
    {} as never,
  );
  await expect(
    oversized.save({ ...baseMessage, content: "x".repeat(4001) } as never, user),
  ).rejects.toThrow("no máximo 4000");

  const queued = new SchedulesController(
    {
      schedule: {
        findUnique: vi.fn().mockResolvedValue({
          connectionId: "connection-a",
          executionStatus: "QUEUED",
        }),
      },
    } as never,
    {} as never,
  );
  await expect(queued.save(baseMessage as never, user)).rejects.toThrow("já iniciou a execução");
});

it("keeps recurring and recipient fan-out records outside the executable state", async () => {
  const prisma = {
    conversation: {
      findFirst: vi.fn().mockResolvedValue({ id: "conversation-a", connectionId: "connection-a" }),
    },
    schedule: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => data),
    },
    contact: { count: vi.fn().mockResolvedValue(1) },
  };
  const controller = new SchedulesController(prisma as never, { publish: vi.fn() } as never);
  const user = {
    tenantId: "tenant-a",
    membershipId: "membership-a",
    roleKey: "tenant_admin",
  } as never;

  await controller.save(
    {
      ...item,
      type: "message",
      conversationId: "conversation-a",
      recurrence: "weekly",
    } as never,
    user,
  );
  await controller.save(
    {
      ...item,
      id: "2f5e210f-bcb0-4df9-bb11-3ffcff514bf8",
      type: "message",
      recipientIds: ["30bd5cbc-b1fc-4fbf-8527-22fe6971ac03"],
      recipients: [{ id: "30bd5cbc-b1fc-4fbf-8527-22fe6971ac03", name: "Contato" }],
    } as never,
    user,
  );

  for (const call of prisma.schedule.create.mock.calls) {
    expect(call[0].data).toMatchObject({ executionStatus: null, dueAt: null, messageId: null });
  }
});

it("persists and returns an attachment while synchronizing the legacy name", async () => {
  const scheduled = { ...item, attachmentName: "nome-divergente.txt", attachment };
  let stored: { id: string; payload: object } | undefined;
  const prisma = {
    schedule: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => {
        stored = { id: data.id, payload: data.payload };
        return data;
      }),
      findMany: vi.fn().mockImplementation(async () => (stored ? [stored] : [])),
    },
  };
  const controller = new SchedulesController(prisma as never, { publish: vi.fn() } as never);

  const saved = await controller.save(
    scheduled as never,
    { tenantId: "tenant-a", roleKey: "tenant_admin" } as never,
  );

  expect(prisma.schedule.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          attachment,
          attachmentName: attachment.fileName,
        }),
      }),
    }),
  );
  expect(saved).toMatchObject({ attachment, attachmentName: attachment.fileName });
  await expect(
    controller.list({ tenantId: "tenant-a", roleKey: "tenant_admin" } as never),
  ).resolves.toEqual([
    expect.objectContaining({ attachment, attachmentName: attachment.fileName }),
  ]);
});

it("rejects attachments with inconsistent data or a disallowed media type", async () => {
  const prisma = {
    schedule: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
  };
  const controller = new SchedulesController(prisma as never, {} as never);
  const user = { tenantId: "tenant-a", roleKey: "tenant_admin" } as never;

  await expect(
    controller.save(
      { ...item, attachment: { ...attachment, size: attachment.size + 1 } } as never,
      user,
    ),
  ).rejects.toThrow("Os dados do anexo agendado são inválidos.");
  await expect(
    controller.save(
      {
        ...item,
        attachment: {
          fileName: "conteudo.exe",
          mimeType: "application/x-msdownload",
          size: 1,
          dataUrl: "data:application/x-msdownload;base64,AA==",
        },
      } as never,
      user,
    ),
  ).rejects.toThrow("Tipo de mídia não permitido.");
  expect(prisma.schedule.create).not.toHaveBeenCalled();
});

it("rejects listing and saving schedules for a conversation outside the connection scope", async () => {
  const prisma = {
    conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    schedule: {
      findMany: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
  };
  const controller = new SchedulesController(prisma as never, {} as never);
  const user = { tenantId: "tenant-a", roleKey: "agent", connectionIds: [] } as never;
  const message = { ...item, type: "message", conversationId: "conversation-a" };

  await expect(controller.list(user, { conversationId: "conversation-a" })).rejects.toThrow(
    "Conversa não encontrada.",
  );
  await expect(controller.save(message as never, user)).rejects.toThrow("Conversa não encontrada.");
  expect(prisma.schedule.findMany).not.toHaveBeenCalled();
  expect(prisma.schedule.create).not.toHaveBeenCalled();
});

it("does not let an agent delete a legacy message schedule from an inaccessible conversation", async () => {
  const prisma = {
    conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    schedule: {
      findUnique: vi.fn().mockResolvedValue({
        id: item.id,
        tenantId: "tenant-a",
        connectionId: null,
        payload: { ...item, type: "message", conversationId: "conversation-hidden" },
      }),
      deleteMany: vi.fn(),
    },
  };
  const controller = new SchedulesController(prisma as never, {} as never);

  await expect(
    controller.remove(item.id, {
      tenantId: "tenant-a",
      roleKey: "agent",
      connectionIds: [],
    } as never),
  ).rejects.toThrow("Conversa não encontrada.");

  expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id: "conversation-hidden",
        tenantId: "tenant-a",
        connectionId: { in: [] },
      }),
    }),
  );
  expect(prisma.schedule.deleteMany).not.toHaveBeenCalled();
});

it("rejects an edit when execution wins the CAS race, including a legacy null state", async () => {
  const existing = {
    id: item.id,
    tenantId: "tenant-a",
    connectionId: null,
    executionStatus: null,
    version: 7,
    createdByMembershipId: null,
    payload: item,
  };
  const prisma = {
    schedule: {
      findUnique: vi.fn().mockResolvedValue(existing),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const controller = new SchedulesController(prisma as never, {} as never);

  await expect(
    controller.save(item as never, { tenantId: "tenant-a", roleKey: "tenant_admin" } as never),
  ).rejects.toThrow("iniciou a execução ou foi alterado");
  expect(prisma.schedule.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ version: 7, executionStatus: null }),
    }),
  );
});

it("rejects deletion when execution wins after the authorization read", async () => {
  const prisma = {
    schedule: {
      findUnique: vi.fn().mockResolvedValue({
        id: item.id,
        tenantId: "tenant-a",
        connectionId: null,
        executionStatus: "PENDING",
        version: 4,
        payload: item,
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const controller = new SchedulesController(prisma as never, {} as never);

  await expect(
    controller.remove(item.id, { tenantId: "tenant-a", roleKey: "tenant_admin" } as never),
  ).rejects.toThrow("iniciou a execução ou foi alterado");
  expect(prisma.schedule.deleteMany).toHaveBeenCalledWith({
    where: {
      tenantId: "tenant-a",
      id: item.id,
      version: 4,
      executionStatus: "PENDING",
    },
  });
});
