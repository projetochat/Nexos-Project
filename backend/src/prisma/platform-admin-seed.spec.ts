import { describe, expect, it, vi } from "vitest";
import { PlatformRole } from "../generated/prisma";
import { ensurePlatformAdmin, resolveTrixusEnvironment } from "../../prisma/platform-admin-seed";

describe("platform admin seed policy", () => {
  it.each(["production", "homologation", "staging"])(
    "accepts the supported environment %s",
    (environment) => {
      expect(resolveTrixusEnvironment(environment)).toBe(environment);
    },
  );

  it.each([undefined, "", "development", "demo", "test", "Staging"])(
    "rejects unsupported environment %s",
    (environment) => {
      expect(() => resolveTrixusEnvironment(environment)).toThrow("TRIXUS_ENVIRONMENT_INVALID");
    },
  );

  it("creates only the missing Platform Admin", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const create = vi.fn().mockResolvedValue({ id: "platform-admin" });
    const client = { user: { findMany, create } } as never;

    await expect(
      ensurePlatformAdmin(client, {
        email: " Platform@Trixus.App ",
        password: "a-strong-bootstrap-password",
      }),
    ).resolves.toBe("created");

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        email: "platform@trixus.app",
        name: "Platform Admin",
        status: "ACTIVE",
        platformRole: PlatformRole.ADMIN,
      },
    });
    expect(create.mock.calls[0]?.[0].data.passwordHash).not.toBe("a-strong-bootstrap-password");
  });

  it("preserves an existing Platform Admin without changing credentials or profile", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "platform-admin",
        email: "platform@trixus.app",
        name: "Existing Name",
        passwordHash: "existing-hash",
        status: "DISABLED",
        platformRole: PlatformRole.ADMIN,
      },
    ]);
    const create = vi.fn();
    const client = { user: { findMany, create } } as never;

    await expect(
      ensurePlatformAdmin(client, {
        email: "platform@trixus.app",
        password: "different-password",
      }),
    ).resolves.toBe("unchanged");

    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to promote a non-admin account implicitly", async () => {
    const client = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ platformRole: PlatformRole.USER }]),
        create: vi.fn(),
      },
    } as never;

    await expect(
      ensurePlatformAdmin(client, {
        email: "existing@trixus.app",
        password: "unused-password",
      }),
    ).rejects.toThrow("PLATFORM_ADMIN_EMAIL_ALREADY_USED_BY_NON_ADMIN");
  });

  it("requires a password only when the account must be created", async () => {
    const client = {
      user: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    } as never;

    await expect(ensurePlatformAdmin(client, { email: "platform@trixus.app" })).rejects.toThrow(
      "TRIXUS_PLATFORM_ADMIN_PASSWORD_REQUIRED_FOR_CREATION",
    );
  });

  it("preserves an administrator whose legacy email casing differs", async () => {
    const client = {
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ email: "Platform@Trixus.App", platformRole: PlatformRole.ADMIN }]),
        create: vi.fn(),
      },
    } as never;

    await expect(ensurePlatformAdmin(client, { email: "platform@trixus.app" })).resolves.toBe(
      "unchanged",
    );
    expect(client.user.create).not.toHaveBeenCalled();
  });

  it("blocks ambiguous case-insensitive legacy emails", async () => {
    const client = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { email: "Platform@Trixus.App", platformRole: PlatformRole.ADMIN },
          { email: "platform@trixus.app", platformRole: PlatformRole.ADMIN },
        ]),
        create: vi.fn(),
      },
    } as never;

    await expect(ensurePlatformAdmin(client, { email: "platform@trixus.app" })).rejects.toThrow(
      "PLATFORM_ADMIN_EMAIL_AMBIGUOUS",
    );
    expect(client.user.create).not.toHaveBeenCalled();
  });

  it("re-reads and preserves an administrator created concurrently", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ platformRole: PlatformRole.ADMIN }]);
    const client = {
      user: {
        findMany,
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
      },
    } as never;

    await expect(
      ensurePlatformAdmin(client, {
        email: "platform@trixus.app",
        password: "a-strong-bootstrap-password",
      }),
    ).resolves.toBe("unchanged");
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
