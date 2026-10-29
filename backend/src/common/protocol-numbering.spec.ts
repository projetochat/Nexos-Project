import { ProtocolFormat, ProtocolModule, ProtocolReset } from "../generated/prisma";
import {
  effectiveProtocolReset,
  formatProtocol,
  protocolPeriodKey,
  nextProtocol,
  previewNextProtocol,
  storedProtocolReset,
  defaultProtocolConfig,
  readProtocolConfig,
} from "./protocol-numbering";
import { describe, expect, it, vi } from "vitest";

describe("protocol numbering", () => {
  const at = new Date("2026-09-30T12:00:00.000Z");
  const base = {
    module: ProtocolModule.CHAT,
    digits: 5,
    reset: ProtocolReset.NEVER,
    customPattern: null,
  };

  it.each([
    [ProtocolFormat.YEAR_SEQUENCE, "2026.00012"],
    [ProtocolFormat.YEAR_MONTH_SEQUENCE, "2026.09.00012"],
    [ProtocolFormat.SEQUENCE, "00012"],
    [ProtocolFormat.DATE_SEQUENCE, "20260930.00012"],
  ])("formats %s", (format, expected) => {
    expect(formatProtocol({ ...base, format }, 12, at)).toBe(expected);
  });

  it("supports a custom pattern and independent reset keys", () => {
    expect(
      formatProtocol(
        { ...base, format: ProtocolFormat.CUSTOM, customPattern: "CHAT.{YEAR}.{SEQ}" },
        12,
        at,
      ),
    ).toBe("CHAT.2026.00012");
    expect(protocolPeriodKey(ProtocolReset.YEARLY, at)).toBe("2026");
    expect(protocolPeriodKey(ProtocolReset.MONTHLY, at)).toBe("2026-09");
    expect(protocolPeriodKey(ProtocolReset.NEVER, at)).toBe("GLOBAL");
  });

  it("derives the reset policy for predefined formats", () => {
    expect(effectiveProtocolReset(ProtocolFormat.YEAR_SEQUENCE, ProtocolReset.NEVER)).toBe(
      ProtocolReset.YEARLY,
    );
    expect(effectiveProtocolReset(ProtocolFormat.YEAR_MONTH_SEQUENCE, ProtocolReset.NEVER)).toBe(
      ProtocolReset.MONTHLY,
    );
    expect(effectiveProtocolReset(ProtocolFormat.DATE_SEQUENCE, ProtocolReset.MONTHLY)).toBe(
      "DAILY",
    );
    expect(effectiveProtocolReset(ProtocolFormat.CUSTOM, ProtocolReset.MONTHLY)).toBe(
      ProtocolReset.MONTHLY,
    );
  });
  it("keeps sequence digits as minimum width through annual overflow", () => {
    const config = { ...base, format: ProtocolFormat.YEAR_SEQUENCE, digits: 3 };
    expect(formatProtocol(config, 30, at)).toBe("2026.030");
    expect(formatProtocol(config, 999, at)).toBe("2026.999");
    expect(formatProtocol(config, 1000, at)).toBe("2026.1000");
  });

  it("uses the same UTC day for the date prefix and DAILY period without a database enum change", () => {
    const midnight = new Date("2026-10-01T00:00:00.000Z");
    expect(protocolPeriodKey("DAILY", new Date(midnight.getTime() - 1))).toBe("2026-09-30");
    expect(protocolPeriodKey("DAILY", midnight)).toBe("2026-10-01");
    expect(
      formatProtocol(
        { ...base, format: ProtocolFormat.DATE_SEQUENCE, reset: "DAILY" },
        1,
        midnight,
      ),
    ).toBe("20261001.00001");
    expect(storedProtocolReset(ProtocolFormat.DATE_SEQUENCE, "DAILY")).toBe(ProtocolReset.NEVER);
  });

  it("previews above the existing daily maximum without writing counters", async () => {
    const upsert = vi.fn();
    const tx = {
      protocolSequenceCounter: { findUnique: vi.fn().mockResolvedValue({ lastNumber: 3 }), upsert },
      $queryRaw: vi.fn().mockResolvedValue([{ lastNumber: 500 }]),
    };
    expect(
      await previewNextProtocol(
        tx as never,
        "tenant-a",
        { ...base, format: ProtocolFormat.DATE_SEQUENCE, reset: "DAILY" },
        at,
      ),
    ).toBe("20260930.00501");
    expect(tx.protocolSequenceCounter.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_module_periodKey: {
          tenantId: "tenant-a",
          module: ProtocolModule.CHAT,
          periodKey: "2026-09-30",
        },
      },
      select: { lastNumber: true },
    });
    const sql = tx.$queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sql.values).toContain("^20260930\\.([0-9]+)$");
    expect(sql.values).toContain("tenant-a");
    expect(sql.sql).toContain('FROM "conversations"');
    expect(upsert).not.toHaveBeenCalled();
  });

  it("allocates DAILY using the atomic persisted-floor query and tenant/module counter", async () => {
    const upsert = vi.fn();
    const tx = {
      tenantProtocolConfiguration: {
        findUnique: vi.fn().mockResolvedValue({
          format: ProtocolFormat.DATE_SEQUENCE,
          digits: 3,
          reset: ProtocolReset.NEVER,
          customPattern: null,
        }),
      },
      protocolSequenceCounter: { upsert },
      $queryRaw: vi.fn().mockResolvedValue([{ lastNumber: 501 }]),
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    expect(await nextProtocol(tx as never, "tenant-a", ProtocolModule.CHAT, at)).toEqual({
      protocol: "20260930.501",
      sequence: 501,
    });
    const sql = tx.$queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sql.sql).toContain('ON CONFLICT ("tenantId", "module", "periodKey")');
    expect(sql.sql).toContain("GREATEST");
    expect(sql.values).toEqual(
      expect.arrayContaining(["tenant-a", ProtocolModule.CHAT, "2026-09-30"]),
    );
    expect(upsert).not.toHaveBeenCalled();
  });
  it.each([ProtocolModule.CHAT, ProtocolModule.TICKET])(
    "defaults only unsaved %s settings to a unique sequence",
    async (module) => {
      expect(defaultProtocolConfig(module)).toEqual({
        module,
        format: ProtocolFormat.SEQUENCE,
        digits: 6,
        reset: ProtocolReset.NEVER,
        customPattern: null,
      });
      const saved = {
        format: ProtocolFormat.CUSTOM,
        digits: 6,
        reset: ProtocolReset.NEVER,
        customPattern: "TKT-{SEQ}",
      };
      expect(
        await readProtocolConfig(
          {
            tenantProtocolConfiguration: { findUnique: vi.fn().mockResolvedValue(saved) },
          } as never,
          "tenant-a",
          module,
        ),
      ).toEqual({ ...saved, module });
    },
  );

  it.each([2147483647, 2147483648, 1e30])(
    "does not preview an unallocatable daily sequence above Int capacity %s",
    async (lastNumber) => {
      const tx = {
        protocolSequenceCounter: { findUnique: vi.fn().mockResolvedValue(null) },
        $queryRaw: vi.fn().mockResolvedValue([{ lastNumber }]),
      };
      await expect(
        previewNextProtocol(
          tx as never,
          "tenant-a",
          { ...base, format: ProtocolFormat.DATE_SEQUENCE, reset: "DAILY" },
          at,
        ),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
});
