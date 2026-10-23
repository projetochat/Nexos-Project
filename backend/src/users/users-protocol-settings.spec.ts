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
      protocolSequenceCounter: { findUnique: vi.fn().mockResolvedValue(null) },
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

  it("enforces the reset period for predefined formats", async () => {
    const prisma = {
      tenantProtocolConfiguration: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)),
      },
      conversation: { count: vi.fn().mockResolvedValue(0) },
      ticket: { count: vi.fn() },
      protocolSequenceCounter: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const controller = new UsersController(prisma as never, {} as never);

    await controller.updateProtocolSettings(
      {
        module: ProtocolModule.CHAT,
        format: ProtocolFormat.YEAR_MONTH_SEQUENCE,
        digits: 2,
        reset: ProtocolReset.NEVER,
      },
      { tenantId: "tenant-a" } as never,
    );

    expect(prisma.tenantProtocolConfiguration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ digits: 2, reset: ProtocolReset.MONTHLY }),
        update: expect.objectContaining({ digits: 2, reset: ProtocolReset.MONTHLY }),
      }),
    );
  });
});
