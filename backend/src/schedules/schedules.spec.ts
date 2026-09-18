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
  scheduledAt: "2026-09-20T10:00",
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
});
it("uses the authenticated tenant on reads, writes and deletions", async () => {
  const prisma = {
    schedule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async ({ create }) => create),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const realtime = { publish: vi.fn() };
  const controller = new SchedulesController(prisma as never, realtime as never);
  const user = { tenantId: "tenant-a", roleKey: "tenant_admin" } as never;
  await controller.save(item as never, user);
  await controller.list(user);
  await controller.remove(item.id, user);
  expect(prisma.schedule.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { tenantId_id: { tenantId: "tenant-a", id: item.id } },
      create: expect.objectContaining({ tenantId: "tenant-a" }),
    }),
  );
  expect(prisma.schedule.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { tenantId: "tenant-a" } }),
  );
  expect(prisma.schedule.deleteMany).toHaveBeenCalledWith({
    where: { tenantId: "tenant-a", id: item.id },
  });
  expect(realtime.publish).toHaveBeenCalledWith({ tenantId: "tenant-a" }, "schedule.updated", {
    scheduleId: item.id,
  });
});
it("does not allow a restricted user to overwrite a schedule on another instance", async () => {
  const prisma = {
    schedule: {
      findUnique: vi.fn().mockResolvedValue({ connectionId: "hidden" }),
      upsert: vi.fn(),
    },
  };
  const controller = new SchedulesController(prisma as never, {} as never);
  await expect(
    controller.save(item as never, { tenantId: "a", roleKey: "agent", connectionIds: [] } as never),
  ).rejects.toThrow("Agendamento não encontrado");
  expect(prisma.schedule.upsert).not.toHaveBeenCalled();
});
