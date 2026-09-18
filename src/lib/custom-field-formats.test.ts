import { describe, expect, it } from "vitest";
import { customFieldFormat, customFieldError, formatCustomField } from "./custom-field-formats";
describe("custom contact field formats", () => {
  it.each([
    ["12345678901", "cpf_cnpj", "123.456.789-01"],
    ["12345678000190", "cpf_cnpj", "12.345.678/0001-90"],
    ["74000000", "cep", "74000-000"],
    ["62999990000", "phone", "(62) 99999-0000"],
    ["6233330000", "phone", "(62) 3333-0000"],
    ["  Ana@example.com  ", "email", "Ana@example.com"],
  ] as const)(
    "formats %s as %s and preserves an already formatted value",
    (raw, format, expected) => {
      expect(formatCustomField(raw, format)).toBe(expected);
      expect(formatCustomField(expected, format)).toBe(expected);
    },
  );
  it("keeps formats on reload and leaves existing field types alone", () => {
    for (const format of ["cpf_cnpj", "cep", "phone", "email"] as const) {
      expect(
        customFieldFormat({ type: "text", mask: JSON.stringify({ custom: { format } }) }),
      ).toBe(format);
    }
    expect(customFieldFormat({ type: "text", mask: '{"text":{"variant":"html"}}' })).toBeNull();
    expect(customFieldFormat({ type: "number", mask: "0,00" })).toBeNull();
    expect(customFieldFormat({ type: "text", mask: "invalid" })).toBeNull();
  });
  it("validates email while leaving empty optional fields valid", () => {
    expect(customFieldError("ana@example.com", "email")).toBeNull();
    expect(customFieldError("", "email")).toBeNull();
    expect(customFieldError("ana@", "email")).toBe("Informe um e-mail válido.");
  });
});
