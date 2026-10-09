import { describe, expect, it, vi } from "vitest";
import {
  AGENT_PERMISSIONS,
  SUPERVISOR_PERMISSIONS,
  TENANT_ADMIN_PERMISSIONS,
} from "../auth/permissions.constants";
import { seedTenantRoles } from "./tenant-role-seed";

describe("seedTenantRoles", () => {
  it("creates Atendimento and the three required system access profiles", async () => {
    const tx = {
      department: {
        upsert: vi.fn().mockResolvedValue({ id: "department-atendimento" }),
      },
      permission: { upsert: vi.fn().mockResolvedValue({}) },
      role: {
        upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ id: create.id })),
      },
      rolePermission: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await seedTenantRoles(tx as never, "tenant-a");

    expect(tx.department.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_name: { tenantId: "tenant-a", name: "Atendimento" } },
      }),
    );
    expect(tx.role.upsert).toHaveBeenCalledTimes(3);
    expect(Object.keys(result).sort()).toEqual(["agent", "supervisor", "tenant_admin"]);
    expect(tx.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ metadata: expect.anything() }),
        create: expect.objectContaining({
          key: "agent",
          metadata: { departmentIds: ["department-atendimento"] },
        }),
      }),
    );
    expect(tx.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: "supervisor",
          metadata: { departmentIds: ["department-atendimento"] },
        }),
      }),
    );
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: AGENT_PERMISSIONS.map((permissionId) => ({
        roleId: "tenant-a:agent",
        permissionId,
      })),
      skipDuplicates: true,
    });
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: SUPERVISOR_PERMISSIONS.map((permissionId) => ({
        roleId: "tenant-a:supervisor",
        permissionId,
      })),
      skipDuplicates: true,
    });
    expect(tx.permission.upsert).toHaveBeenCalledTimes(
      new Set([...TENANT_ADMIN_PERMISSIONS, ...SUPERVISOR_PERMISSIONS, ...AGENT_PERMISSIONS]).size,
    );
  });
});
