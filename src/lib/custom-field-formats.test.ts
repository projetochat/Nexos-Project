import { describe, expect, it } from "vitest";
import {
  customFieldFormat,
  customFieldError,
  formatCustomField,
  isValidCnpj,
  isValidCpf,
} from "./custom-field-formats";
describe("custom contact field formats", () => {
  it.each([
    ["12345678901", "cpf_cnpj", "123.456.789-01"],
    ["12345678000190", "cpf_cnpj", "12.345.678/0001-90"],
    ["74000000", "cep", "74.000-000"],
    ["62999990000", "phone", "(62) 99999-0000"],
    ["6233330000", "phone", "(62) 3333-0000"],
    ["+5562999990000", "phone", "+5562999990000"],
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
  it("validates formatted fields while leaving empty optional fields valid", () => {
    expect(customFieldError("ana@example.com", "email")).toBeNull();
    expect(customFieldError("", "email")).toBeNull();
    expect(customFieldError("ana@", "email")).toBe("Informe um e-mail válido.");
    expect(customFieldError("74.000-000", "cep")).toBeNull();
    expect(customFieldError("74.000-00", "cep")).toBe("Informe um CEP válido.");
    expect(customFieldError("(62) 99999-0000", "phone")).toBeNull();
    expect(customFieldError("+12125551234", "phone")).toBeNull();
    expect(customFieldError("(62) 9999-0000", "phone")).toBe("Informe um telefone válido.");
  });
  it("calculates both CPF and CNPJ verification digits", () => {
    expect(isValidCpf("016.506.251-70")).toBe(true);
    expect(isValidCpf("016.506.251-71")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCnpj("04.252.011/0001-10")).toBe(true);
    expect(isValidCnpj("04.252.011/0001-11")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(customFieldError("016.506.251-70", "cpf_cnpj")).toBeNull();
    expect(customFieldError("04.252.011/0001-10", "cpf_cnpj")).toBeNull();
    expect(customFieldError("016.506.251-71", "cpf_cnpj")).toBe("Informe um CPF ou CNPJ válido.");
  });
});
