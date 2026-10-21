import { describe, expect, it } from "vitest";
import { formatPlatformDateTime } from "./format";

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
