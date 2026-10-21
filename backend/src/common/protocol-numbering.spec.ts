import { ProtocolFormat, ProtocolModule, ProtocolReset } from "../generated/prisma";
import { formatProtocol, protocolPeriodKey } from "./protocol-numbering";
import { describe, expect, it } from "vitest";

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
});
