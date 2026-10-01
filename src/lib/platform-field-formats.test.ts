import { describe, expect, it } from "vitest";
import {
  formatPlatformCurrency,
  formatPlatformMoneyInput,
  maskPlatformMoney,
  parsePlatformMoneyToCents,
} from "./platform-field-formats";

describe("formatos monetários da Platform", () => {
  it("aplica duas casas e separador de milhar durante a digitação", () => {
    expect(maskPlatformMoney("1")).toBe("0,01");
    expect(maskPlatformMoney("100000")).toBe("1.000,00");
  });

  it("converte entre texto, centavos e exibição em reais", () => {
    expect(parsePlatformMoneyToCents("1.234,56")).toBe(123456);
    expect(formatPlatformMoneyInput(123456)).toBe("1.234,56");
    expect(formatPlatformCurrency(30000)).toMatch(/R\$\s300,00/);
  });
});
