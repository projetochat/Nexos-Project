import { describe, expect, it, vi } from "vitest";
import { SenderDisplayNameService } from "./sender-display-name.service";

const administrator = {
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleKey: "tenant_admin",
};

describe("SenderDisplayNameService", () => {
  it("uses the administrator presentation name and never its immutable user name", async () => {
    const db = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          presentationName: "Natã Rabelo",
          user: { name: "Admin Homologacao" },
        }),
      },
    };

    await expect(new SenderDisplayNameService().resolve(db as never, administrator as never)).resolves.toBe(
      "Natã Rabelo",
    );
  });

  it("uses a neutral label for legacy administrators without a presentation name", async () => {
    const db = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          presentationName: null,
          user: { name: "Admin Homologacao" },
        }),
      },
    };

    await expect(new SenderDisplayNameService().resolve(db as never, administrator as never)).resolves.toBe(
      "Administrador",
    );
  });

  it("uses the attendant name for non-administrator memberships", async () => {
    const db = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          presentationName: null,
          user: { name: "Rafael" },
        }),
      },
    };

    await expect(
      new SenderDisplayNameService().resolve(
        db as never,
        { ...administrator, roleKey: "operator" } as never,
      ),
    ).resolves.toBe("Rafael");
  });
});
