import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AutomationsController } from "./automations.controller";

const current = {
  tenantId: "tenant-a",
  membershipId: "membership-a",
} as AuthenticatedUser;

describe("AutomationsController physical deletion", () => {
  it("shows the current department dependency and a stable snapshot", async () => {
    const prisma = automationPrisma();
    const impact = await new AutomationsController(prisma as never).deletionPreview(
      "automation-a",
      current,
    );

    expect(impact.snapshotToken).toHaveLength(64);
    expect(impact.dependencies).toEqual([
      expect.objectContaining({ id: "department", count: 1, operation: "unlink" }),
    ]);
    expect(prisma.automationRule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "automation-a", tenantId: "tenant-a" } }),
    );
  });

  it("revalidates and physically deletes the tenant-scoped automation", async () => {
    const prisma = automationPrisma();
    const controller = new AutomationsController(prisma as never);
    const impact = await controller.deletionPreview("automation-a", current);

    await expect(
      controller.remove("automation-a", { snapshotToken: impact.snapshotToken }, current),
    ).resolves.toEqual({ status: "deleted" });

    expect(prisma.automationRule.delete).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: "tenant-a", id: "automation-a" } },
    });
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-a",
          type: "automation.deleted.audit",
          aggregateId: "automation-a",
        }),
      }),
    );
  });

  it("returns the refreshed preview and does not delete on a stale snapshot", async () => {
    const prisma = automationPrisma();
    const result = await new AutomationsController(prisma as never).remove(
      "automation-a",
      { snapshotToken: "0".repeat(64) },
      current,
    );

    expect(result.status).toBe("changed");
    expect(prisma.automationRule.delete).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });
});

function automationPrisma() {
  const prisma = {
    automationRule: {
      findFirst: vi.fn().mockResolvedValue({
        id: "automation-a",
        name: "Encaminhar suporte",
        matchText: "suporte",
        status: "ACTIVE",
        actionType: "ASSIGN_DEPARTMENT",
        departmentId: "department-a",
        updatedAt: new Date("2026-10-08T12:00:00Z"),
        department: { id: "department-a", name: "Suporte" },
      }),
      delete: vi.fn(),
    },
    outboxEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
    callback(prisma),
  );
  return prisma;
}
