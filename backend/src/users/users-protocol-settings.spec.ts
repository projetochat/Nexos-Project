import { describe, expect, it, vi } from "vitest";
import { ProtocolFormat, ProtocolModule, ProtocolReset } from "../generated/prisma";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UsersController, UpdateProtocolSettingsDto } from "./users.controller";

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
  it("accepts DAILY through the request DTO only for DATE_SEQUENCE", async () => {
    const dto = {
      module: ProtocolModule.CHAT,
      format: ProtocolFormat.DATE_SEQUENCE,
      digits: 3,
      reset: "DAILY",
    };
    expect(await validate(plainToInstance(UpdateProtocolSettingsDto, dto))).toEqual([]);
    const errors = await validate(
      plainToInstance(UpdateProtocolSettingsDto, {
        ...dto,
        format: ProtocolFormat.CUSTOM,
        customPattern: "{DATE}.{SEQ}",
      }),
    );
    expect(errors.some((error) => error.property === "reset")).toBe(true);
  });

  it("returns derived DAILY while persisting the compatible NEVER database value", async () => {
    const prisma = {
      tenantProtocolConfiguration: {
        findUnique: vi.fn().mockResolvedValue({
          format: ProtocolFormat.DATE_SEQUENCE,
          digits: 3,
          reset: ProtocolReset.NEVER,
          customPattern: null,
        }),
        upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)),
      },
      conversation: { count: vi.fn() },
      protocolSequenceCounter: { findUnique: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn().mockResolvedValue([{ lastNumber: 30 }]),
    };
    const controller = new UsersController(prisma as never, {} as never);
    const result = await controller.updateProtocolSettings(
      {
        module: ProtocolModule.CHAT,
        format: ProtocolFormat.DATE_SEQUENCE,
        digits: 3,
        reset: "DAILY",
      },
      { tenantId: "tenant-a" } as never,
    );
    expect(result).toMatchObject({ reset: "DAILY", confirmationRequired: false });
    expect(prisma.tenantProtocolConfiguration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reset: ProtocolReset.NEVER }),
        update: expect.objectContaining({ reset: ProtocolReset.NEVER }),
      }),
    );
    expect(prisma.conversation.count).not.toHaveBeenCalled();
  });

  it("rejects DAILY for custom patterns before any persistence", async () => {
    const prisma = { tenantProtocolConfiguration: { findUnique: vi.fn(), upsert: vi.fn() } };
    const controller = new UsersController(prisma as never, {} as never);
    await expect(
      controller.updateProtocolSettings(
        {
          module: ProtocolModule.CHAT,
          format: ProtocolFormat.CUSTOM,
          digits: 3,
          reset: "DAILY",
          customPattern: "{DATE}.{SEQ}",
        },
        { tenantId: "tenant-a" } as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.tenantProtocolConfiguration.findUnique).not.toHaveBeenCalled();
    expect(prisma.tenantProtocolConfiguration.upsert).not.toHaveBeenCalled();
  });
});
