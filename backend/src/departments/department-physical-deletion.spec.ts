import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DepartmentsController } from "./departments.controller";
import { TicketsService } from "../tickets/tickets.service";

const current = { tenantId: "tenant-a", membershipId: "membership-a" } as never;

function deletionClient() {
  const empty = () => ({ findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() });
  const tx = {
    $queryRaw: vi.fn(),
    department: {
      findFirst: vi.fn().mockResolvedValue({
        id: "department-a",
        name: "Suporte",
        active: true,
        updatedAt: new Date("2026-10-08T12:00:00Z"),
      }),
      delete: vi.fn(),
    },
    departmentMembership: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "link-a",
          membership: {
            id: "membership-a",
            presentationName: "Ana",
            user: { name: "Ana", email: "ana@example.test" },
          },
        },
      ]),
      deleteMany: vi.fn(),
    },
    departmentConnection: {
      findMany: vi.fn().mockResolvedValue([
        { connectionId: "connection-a", connection: { name: "WhatsApp" } },
      ]),
      deleteMany: vi.fn(),
    },
    contact: empty(),
    conversation: empty(),
    ticket: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "ticket-a",
          protocol: "TKT-000001",
          title: "Ajuda",
          updatedAt: new Date("2026-10-08T12:00:00Z"),
        },
      ]),
      updateMany: vi.fn(),
    },
    lead: empty(),
    quickReply: empty(),
    automationRule: empty(),
    notification: empty(),
    role: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "role-a",
          name: "Atendente",
          metadata: {
            chatScopes: [
              {
                connectionId: "connection-a",
                departmentIds: ["department-a", "department-b"],
                favoriteDepartmentId: "department-a",
              },
              {
                connectionId: "connection-b",
                departmentIds: ["department-a"],
                favoriteDepartmentId: null,
              },
            ],
            connectionIds: ["connection-a", "connection-b"],
            departmentIds: ["department-a", "department-b"],
          },
          updatedAt: new Date("2026-10-08T12:00:00Z"),
        },
      ]),
      update: vi.fn(),
    },
    userInvitation: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "invite-a",
          email: "convite@example.test",
          departmentIds: ["department-a", "department-b"],
          updatedAt: new Date("2026-10-08T12:00:00Z"),
        },
      ]),
      update: vi.fn(),
    },
  };
  return {
    tx,
    prisma: {
      ...tx,
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
}

describe("department physical deletion", () => {
  it("previews preserved records with a single confirmation action", async () => {
    const { prisma } = deletionClient();
    const controller = new DepartmentsController(prisma as never, {} as never, undefined, undefined);

    const impact = await controller.deletionPreview("department-a", current);

    expect(impact.confirmation).toEqual({ level: "standard", confirmLabel: "Confirmar" });
    expect(impact.dependencies.find((item) => item.id === "memberships")).toMatchObject({
      count: 1,
      operation: "unlink",
    });
    expect(impact.dependencies.find((item) => item.id === "tickets")).toMatchObject({ count: 1 });
  });

  it("unlinks every supported dependency and sanitizes role and invitation scopes", async () => {
    const { prisma, tx } = deletionClient();
    const controller = new DepartmentsController(prisma as never, {} as never, undefined, undefined);
    const impact = await controller.deletionPreview("department-a", current);

    await expect(
      controller.remove("department-a", { snapshotToken: impact.snapshotToken }, current),
    ).resolves.toEqual({ status: "deleted" });

    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", departmentId: "department-a" },
      data: { departmentId: null },
    });
    expect(tx.departmentMembership.deleteMany).toHaveBeenCalled();
    expect(tx.departmentConnection.deleteMany).toHaveBeenCalled();
    expect(tx.role.update).toHaveBeenCalledWith({
      where: { id: "role-a" },
      data: {
        metadata: {
          chatScopes: [
            {
              connectionId: "connection-a",
              departmentIds: ["department-b"],
              favoriteDepartmentId: null,
            },
          ],
          connectionIds: ["connection-a"],
          departmentIds: ["department-b"],
        },
      },
    });
    expect(tx.userInvitation.update).toHaveBeenCalledWith({
      where: { id: "invite-a" },
      data: { departmentIds: ["department-b"] },
    });
    expect(tx.department.delete).toHaveBeenCalledWith({ where: { id: "department-a" } });
  });

  it("does not mutate data when the snapshot is stale", async () => {
    const { prisma, tx } = deletionClient();
    const controller = new DepartmentsController(prisma as never, {} as never, undefined, undefined);

    const result = await controller.remove(
      "department-a",
      { snapshotToken: "0".repeat(64) },
      current,
    );

    expect(result.status).toBe("changed");
    expect(tx.department.delete).not.toHaveBeenCalled();
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("keeps ticket creation strict and blocks editing an orphaned ticket", async () => {
    const prisma = {
      ticket: {
        findFirst: vi.fn().mockResolvedValue({ id: "ticket-a", departmentId: null }),
      },
    };
    const service = new TicketsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.update("ticket-a", { title: "Novo" }, current)).rejects.toThrow(
      "Selecione um departamento antes de editar este chamado.",
    );
  });

  it("declares nullable tickets and safe SetNull constraints without applying a database", () => {
    const schema = readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../prisma/migrations/20261008224500_department_physical_delete/migration.sql",
      ),
      "utf8",
    );
    const frontend = readFileSync(resolve(__dirname, "../../../src/routes/departamentos.tsx"), "utf8");

    expect(schema).toMatch(/model Ticket[\s\S]*departmentId\s+String\?/);
    expect(schema).toMatch(
      /model Notification[\s\S]*department\s+Department\?[\s\S]*onDelete: SetNull/,
    );
    expect(migration).toContain('ON DELETE SET NULL ("departmentId")');
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(migration.indexOf('ALTER TABLE "notifications"')).toBeLessThan(
      migration.lastIndexOf("COMMIT;"),
    );
    expect(frontend).toContain("<DeletionConfirmDialog");
    expect(frontend).toContain("Excluir departamento");
  });
});
