import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { PermissionsGuard } from "../auth/permissions.guard";
import { UsersController } from "./users.controller";

describe("profile and company session enforcement", () => {
  for (const method of [
    "me",
    "updateMyProfile",
    "company",
    "updateCompany",
    "financial",
    "updateAdministratorCredentials",
  ] as const) {
    it(`revalidates membership on ${method}`, () => {
      const guards = [
        ...(Reflect.getMetadata(GUARDS_METADATA, UsersController) ?? []),
        ...(Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype[method]) ?? []),
      ];
      expect(guards).toContain(PermissionsGuard);
    });
  }
  function setup(membership: unknown, iatMs = 100) {
    const query = vi.fn().mockResolvedValue(membership);
    const user = { userId: "u", tenantId: "t", membershipId: "m", iatMs };
    const guard = new PermissionsGuard(
      { getAllAndOverride: () => undefined } as never,
      { tenantMembership: { findFirst: query } } as never,
    );
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({ getRequest: () => ({ user, originalUrl: "/api/me", params: {} }) }),
    };
    return { guard, context, query, user };
  }
  it("rejects inactive membership even without individual permission metadata", async () => {
    const { guard, context, query } = setup(null);
    await expect(guard.canActivate(context as never)).rejects.toThrow("Membership inativa");
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
        }),
      }),
    );
  });
  it("rejects revoked session without individual permission metadata", async () => {
    const { guard, context } = setup({ tenant: { authRevokedAt: new Date(200) } });
    await expect(guard.canActivate(context as never)).rejects.toThrow("Sessão revogada");
  });
  it("preserves D001 and refreshes role and instance scope for active session", async () => {
    const { guard, context, user } = setup({
      roleId: "r",
      tenant: {},
      role: { key: "agent", metadata: { connectionIds: ["c1"] }, permissions: [] },
    });
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(user).toMatchObject({
      roleKey: "agent",
      connectionIds: ["c1"],
      permissions: expect.arrayContaining(["messages.send"]),
    });
  });
});
