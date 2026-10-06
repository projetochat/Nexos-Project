import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { compare, hashSync } from "bcryptjs";
import { UsersController } from "./users.controller";
import type { AuthenticatedUser } from "../auth/auth.types";

const current = {
  tenantId: "tenant-a",
  membershipId: "admin",
  userId: "admin-user",
  roleKey: "tenant_admin",
} as AuthenticatedUser;
const oldHash = hashSync("Anterior123", 4);

function setup(
  options: {
    status?: string;
    userStatus?: string;
    shared?: boolean;
    failMembership?: boolean;
    master?: boolean;
  } = {},
) {
  let state = {
    id: "membership-a",
    tenantId: "tenant-a",
    userId: "user-a",
    roleId: "role-a",
    status: options.status ?? "DISABLED",
    presentationName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    departments: [],
    role: { id: "role-a", key: options.master ? "tenant_admin" : "agent", name: "Atendente" },
    user: {
      id: "user-a",
      name: "Teste",
      email: "test@example.invalid",
      status: options.userStatus ?? "ACTIVE",
      passwordHash: oldHash,
      avatarUrl: null,
      platformRole: "USER",
    },
  };
  let draft = structuredClone(state);
  const scopedFind = vi.fn(async (query: { where: { tenantId?: unknown; userId?: string } }) =>
    query.where.userId
      ? options.shared
        ? { id: "other-membership" }
        : null
      : structuredClone(draft),
  );
  const userUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    draft.user = {
      ...draft.user,
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
    };
    return draft.user;
  });
  const membershipUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (options.failMembership) throw new Error("simulated membership write failure");
    draft = {
      ...draft,
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
    };
    return draft;
  });
  const tx = {
    $queryRaw: vi.fn(),
    user: { update: userUpdate },
    authSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tenantMembership: {
      findFirst: vi.fn(async (query: { where: { tenantId?: unknown; userId?: string } }) => {
        if (
          query.where.userId &&
          query.where.tenantId &&
          typeof query.where.tenantId === "object"
        ) {
          return options.shared ? { id: "other-membership" } : null;
        }
        return scopedFind(query);
      }),
      update: membershipUpdate,
      findUniqueOrThrow: vi.fn(async () => structuredClone(draft)),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    tenantMembership: { findFirst: vi.fn(async () => structuredClone(state)) },
    role: {
      findFirst: vi.fn().mockResolvedValue({
        id: "role-b",
        tenantId: "tenant-a",
        key: "agent",
        permissions: [{ permissionId: "contacts.read" }],
      }),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      draft = structuredClone(state);
      const result = await callback(tx);
      state = structuredClone(draft);
      return result;
    }),
  };
  const realtime = { publish: vi.fn() };
  return {
    controller: new UsersController(prisma as never, {} as never, realtime as never),
    prisma,
    tx,
    realtime,
    state: () => state,
  };
}

describe("atendente reactivation without password", () => {
  it("activates user and membership without changing the credential", async () => {
    const test = setup({ userStatus: "DISABLED" });
    const response = await test.controller.activate("membership-a", current);
    expect(response.status).toBe("ACTIVE");
    expect(response.user.status).toBe("ACTIVE");
    expect(response.user).not.toHaveProperty("passwordHash");
    expect(test.state().user.passwordHash).toBe(oldHash);
    expect(test.prisma.$transaction).toHaveBeenCalledOnce();
    expect(test.tx.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it("allows reactivation through edit without changing the credential", async () => {
    const test = setup({ userStatus: "DISABLED" });
    const response = await test.controller.update(
      "membership-a",
      { membershipStatus: "ACTIVE", status: "ACTIVE" },
      current,
    );
    expect(response.status).toBe("ACTIVE");
    expect(response.user.status).toBe("ACTIVE");
    expect(test.state().user.passwordHash).toBe(oldHash);
    expect(test.tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", membershipId: "membership-a", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(test.realtime.publish).toHaveBeenCalledWith(
      { membershipId: "membership-a" },
      "authorization.updated",
      { membershipId: "membership-a", reason: "membership.updated" },
    );
  });

  it("revokes the tenant session and publishes cache invalidation after a role change", async () => {
    const test = setup({ status: "ACTIVE" });
    await test.controller.update("membership-a", { roleId: "role-b" }, current);

    expect(test.tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", membershipId: "membership-a", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(test.realtime.publish).toHaveBeenCalledWith(
      { membershipId: "membership-a" },
      "authorization.updated",
      { membershipId: "membership-a", reason: "membership.updated" },
    );
  });

  it("revokes only the affected tenant membership when disabling its link", async () => {
    const test = setup({ status: "ACTIVE" });
    await test.controller.deactivate("membership-a", current);

    expect(test.tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", membershipId: "membership-a", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(test.realtime.publish).toHaveBeenCalledWith(
      { membershipId: "membership-a" },
      "authorization.updated",
      { membershipId: "membership-a", reason: "membership.status.updated" },
    );
  });

  it("reactivates an invited membership without changing the credential", async () => {
    const test = setup({ status: "INVITED" });
    await test.controller.update("membership-a", { membershipStatus: "ACTIVE" }, current);
    expect(test.state().status).toBe("ACTIVE");
    expect(test.state().user.passwordHash).toBe(oldHash);
  });

  it("rechecks the blocked state inside the transaction instead of trusting an older active snapshot", async () => {
    const test = setup();
    test.prisma.tenantMembership.findFirst.mockResolvedValue({ ...test.state(), status: "ACTIVE" });
    await test.controller.update("membership-a", { membershipStatus: "ACTIVE" }, current);
    expect(test.tx.tenantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "membership-a", tenantId: "tenant-a" } }),
    );
    expect(test.state().status).toBe("ACTIVE");
  });

  it("reactivates a shared global account without replacing its credential", async () => {
    const test = setup({ shared: true });
    await test.controller.activate("membership-a", current);
    expect(test.state().status).toBe("ACTIVE");
    expect(test.state().user.passwordHash).toBe(oldHash);
  });

  it("rolls back activation if the membership update fails in the transaction model", async () => {
    const test = setup({ failMembership: true });
    await expect(test.controller.activate("membership-a", current)).rejects.toThrow("simulated");
    expect(test.tx.user.update).toHaveBeenCalledOnce();
    expect(test.state().user.passwordHash).toBe(oldHash);
    expect(test.state().status).toBe("DISABLED");
  });

  it("keeps already-active activation idempotent even for a shared account", async () => {
    const test = setup({ status: "ACTIVE", shared: true });
    await test.controller.activate("membership-a", current);
    expect(test.tx.user.update).not.toHaveBeenCalled();
  });

  it("keeps explicit password editing available for a non-shared account", async () => {
    const test = setup({ status: "ACTIVE" });
    await test.controller.update("membership-a", { password: "Nova123" }, current);
    expect(await compare("Nova123", test.state().user.passwordHash)).toBe(true);
  });

  it("rejects global credential changes for an account shared with another tenant", async () => {
    const test = setup({ status: "ACTIVE", shared: true });
    await expect(
      test.controller.update("membership-a", { password: "Nova123" }, current),
    ).rejects.toThrow("mais de uma empresa");
    expect(test.state().user.passwordHash).toBe(oldHash);
  });

  it("stores a shared account name on the membership without changing global identity", async () => {
    const test = setup({ status: "ACTIVE", shared: true });
    await test.controller.update("membership-a", { name: "Nome local" }, current);
    expect(test.state().presentationName).toBe("Nome local");
    expect(test.state().user.name).toBe("Teste");
  });

  it("preserves normal active profile editing and master protection", async () => {
    const test = setup({ status: "ACTIVE" });
    await test.controller.update("membership-a", { name: "Nome novo" }, current);
    expect(test.state().presentationName).toBe("Nome novo");
    expect(test.state().user.name).toBe("Teste");
    expect(test.state().user.passwordHash).toBe(oldHash);
    const master = setup({ master: true });
    await expect(master.controller.activate("membership-a", current)).rejects.toThrow("master");
    expect(master.prisma.$transaction).not.toHaveBeenCalled();
  });
});
