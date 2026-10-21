import { describe, expect, it, vi } from "vitest";
import { ProtocolFormat, ProtocolModule, ProtocolReset } from "../generated/prisma";
import { UsersController } from "./users.controller";

describe("UsersController protocol settings", () => {
  it("requires confirmation when the first custom configuration changes an already-used default", async () => {
    const prisma = {
      tenantProtocolConfiguration: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      conversation: { count: vi.fn().mockResolvedValue(1) },
      ticket: { count: vi.fn() },
    };
    const controller = new UsersController(prisma as never, {} as never);

    await expect(
      controller.updateProtocolSettings(
        {
          module: ProtocolModule.CHAT,
          format: ProtocolFormat.YEAR_SEQUENCE,
          digits: 6,
          reset: ProtocolReset.YEARLY,
        },
        { tenantId: "tenant-a" } as never,
      ),
    ).resolves.toMatchObject({ confirmationRequired: true });

    expect(prisma.conversation.count).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", protocol: { not: null } },
    });
    expect(prisma.tenantProtocolConfiguration.upsert).not.toHaveBeenCalled();
  });
});
