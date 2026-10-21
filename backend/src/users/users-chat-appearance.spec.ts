import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { UsersController } from "./users.controller";

describe("UsersController chat appearance", () => {
  it("rejects solid background mode without a background color", async () => {
    const membership = {
      id: "membership-1",
      userId: "user-1",
      user: {
        id: "user-1",
        name: "Usuário",
        passwordHash: "unused",
        chatBackgroundColor: null,
        chatBackgroundMode: "IMAGE",
      },
      tenant: { id: "tenant-1" },
      role: { key: "agent" },
      departments: [],
    };
    const prisma = {
      tenantMembership: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(membership),
      },
      $transaction: vi.fn(),
    };
    const controller = new UsersController(prisma as never, {} as never);

    await expect(
      controller.updateMyProfile({ chatBackgroundMode: "COLOR", chatBackgroundColor: null }, {
        membershipId: "membership-1",
        roleKey: "agent",
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
