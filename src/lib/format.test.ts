import { describe, expect, it } from "vitest";
import { displayDateTime, fmtDateTime, formatPlatformDateTime, num } from "./format";

describe("displayDateTime", () => {
  const value = "2026-10-26T08:00:05.000Z";

  it("removes the separator before time while preserving default seconds", () => {
    expect(displayDateTime(value, { timeZone: "UTC" })).toBe("26/10/2026 08:00:05");
  });

  it("preserves explicit short precision and the configured timezone across midnight", () => {
    expect(
      displayDateTime("2026-10-26T02:00:00Z", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }),
    ).toBe("25/10/2026 23:00");
  });

  it("keeps options that omit the year and seconds, including fmtDateTime callers", () => {
    const timestamp = Date.parse(value);
    expect(
      displayDateTime(timestamp, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }),
    ).toBe("26/10 08:00");
    expect(fmtDateTime(new Date(2026, 9, 26, 8, 0, 5).getTime())).toBe("26/10 08:00");
  });

  it("preserves punctuation elsewhere in a long date and does not mutate its input", () => {
    const date = new Date(value);
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    } as const;
    const text = displayDateTime(date, options);
    expect(text).toContain("segunda-feira,");
    expect(text).not.toMatch(/,\s*08:00/);
    expect(date.toISOString()).toBe(value);
    expect(num(1234.5)).toBe("1.234,5");
  });

  it("handles invalid or missing values without throwing and honors each caller's fallback", () => {
    for (const input of [undefined, null, "", "not-a-date", NaN, new Date(NaN)]) {
      expect(displayDateTime(input)).toBe("—");
      expect(displayDateTime(input, undefined, "original")).toBe("original");
    }
  });
});

describe("formatPlatformDateTime", () => {
  it("formata data e hora no padrão da Platform e no fuso de São Paulo", () => {
    expect(formatPlatformDateTime("2026-10-21T15:34:00.000Z")).toBe("21/10/2026 12:34");
  });

  it("preserva corretamente a virada de dia no fuso de São Paulo", () => {
    expect(formatPlatformDateTime("2026-10-21T02:30:00.000Z")).toBe("20/10/2026 23:30");
    expect(formatPlatformDateTime("2026-10-21T03:00:00.000Z")).toBe("21/10/2026 00:00");
  });

  it("retorna um marcador neutro para datas inválidas", () => {
    expect(formatPlatformDateTime("data-invalida")).toBe("—");
  });
});
