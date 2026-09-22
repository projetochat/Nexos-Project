import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { compare, hashSync } from "bcryptjs";
import { validate } from "class-validator";
import { UsersController } from "./users.controller";
import { ActivateUserDto } from "./dto/activate-user.dto";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { UpdateUserDto } from "./dto/update-user.dto";

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
    tenantMembership: {
      findFirst: scopedFind,
      update: membershipUpdate,
      findUniqueOrThrow: vi.fn(async () => structuredClone(draft)),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    tenantMembership: { findFirst: vi.fn(async () => structuredClone(state)) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      draft = structuredClone(state);
      const result = await callback(tx);
      state = structuredClone(draft);
      return result;
    }),
  };
  return {
    controller: new UsersController(prisma as never, {} as never),
    prisma,
    tx,
    state: () => state,
  };
}

describe("atendente reactivation password", () => {
  it.each([undefined, "", "12345", "      "])(
    "rejects missing/invalid password %s before any write",
    async (password) => {
      const test = setup();
      await expect(
        test.controller.activate("membership-a", { password } as ActivateUserDto, current),
      ).rejects.toThrow("nova senha");
      expect(test.tx.user.update).not.toHaveBeenCalled();
      expect(test.tx.tenantMembership.update).not.toHaveBeenCalled();
    },
  );

  it("validates activate body before the route", async () => {
    expect(await validate(new ActivateUserDto())).not.toHaveLength(0);
    expect(
      await validate(Object.assign(new ActivateUserDto(), { password: "Nova123" })),
    ).toHaveLength(0);
  });

  it("requires a password different from the existing credential", async () => {
    const test = setup();
    await expect(
      test.controller.activate("membership-a", { password: "Anterior123" }, current),
    ).rejects.toThrow("diferente");
    expect(test.tx.user.update).not.toHaveBeenCalled();
  });

  it("hashes the new password and activates user/membership in one transaction", async () => {
    const test = setup({ userStatus: "DISABLED" });
    const response = await test.controller.activate(
      "membership-a",
      { password: "Nova123" },
      current,
    );
    expect(response.status).toBe("ACTIVE");
    expect(response.user.status).toBe("ACTIVE");
    expect(response.user).not.toHaveProperty("passwordHash");
    expect(await compare("Nova123", test.state().user.passwordHash)).toBe(true);
    expect(test.prisma.$transaction).toHaveBeenCalledOnce();
    expect(test.tx.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it.each([{ membershipStatus: "ACTIVE" }, { status: "ACTIVE" }] as UpdateUserDto[])(
    "rejects bypass through update %j without password",
    async (dto) => {
      const test = setup({ userStatus: "DISABLED" });
      await expect(test.controller.update("membership-a", dto, current)).rejects.toThrow(
        "nova senha",
      );
      expect(test.tx.user.update).not.toHaveBeenCalled();
    },
  );

  it("does not allow INVITED as a detour around a blocked membership", async () => {
    const test = setup({ status: "INVITED" });
    await expect(
      test.controller.update("membership-a", { membershipStatus: "ACTIVE" }, current),
    ).rejects.toThrow("nova senha");
  });

  it("rechecks the blocked state inside the transaction instead of trusting an older active snapshot", async () => {
    const test = setup();
    test.prisma.tenantMembership.findFirst.mockResolvedValue({ ...test.state(), status: "ACTIVE" });
    await expect(
      test.controller.update("membership-a", { membershipStatus: "ACTIVE" }, current),
    ).rejects.toThrow("nova senha");
    expect(test.tx.tenantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "membership-a", tenantId: "tenant-a" } }),
    );
    expect(test.tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects reactivation of a shared global account without modifying either credential or membership", async () => {
    const test = setup({ shared: true });
    await expect(
      test.controller.activate("membership-a", { password: "Nova123" }, current),
    ).rejects.toThrow("outra empresa");
    expect(test.tx.user.update).not.toHaveBeenCalled();
    expect(test.state().status).toBe("DISABLED");
    expect(test.state().user.passwordHash).toBe(oldHash);
  });

  it("rolls back password change if membership update fails in the transaction model", async () => {
    const test = setup({ failMembership: true });
    await expect(
      test.controller.activate("membership-a", { password: "Nova123" }, current),
    ).rejects.toThrow("simulated");
    expect(test.tx.user.update).toHaveBeenCalledOnce();
    expect(test.state().user.passwordHash).toBe(oldHash);
    expect(test.state().status).toBe("DISABLED");
  });

  it("keeps already-active activation idempotent even for a shared account", async () => {
    const test = setup({ status: "ACTIVE", shared: true });
    await test.controller.activate("membership-a", { password: "Nova123" }, current);
    expect(test.tx.user.update).not.toHaveBeenCalled();
  });

  it("preserves normal active profile editing and master protection", async () => {
    const test = setup({ status: "ACTIVE" });
    await test.controller.update("membership-a", { name: "Nome novo" }, current);
    expect(test.state().user.name).toBe("Nome novo");
    expect(test.state().user.passwordHash).toBe(oldHash);
    const master = setup({ master: true });
    await expect(
      master.controller.activate("membership-a", { password: "Nova123" }, current),
    ).rejects.toThrow("master");
    expect(master.prisma.$transaction).not.toHaveBeenCalled();
  });
});
