import { describe, expect, it } from "vitest";
import {
  contactCustomFieldVariableKey,
  isNativeContactFieldName,
  isNativeMessageVariableKey,
  normalizeContactCustomFieldName,
} from "./contact-custom-field-identity";

describe("contact custom field identity", () => {
  it("normalizes case, outer/duplicate spaces and Unicode equivalents", () => {
    expect(normalizeContactCustomFieldName("  Código   DO Cliente  ")).toBe(
      normalizeContactCustomFieldName("Código do cliente"),
    );
  });

  it("creates a stable technical key without translated display text", () => {
    expect(contactCustomFieldVariableKey(" Código do Cliente ")).toBe("codigo_cliente");
    expect(contactCustomFieldVariableKey("Código do Cliente")).toBe("codigo_cliente");
  });

  it("reserves every official native variable key", () => {
    for (const key of [
      "cumprimento",
      "saudacao",
      "contato",
      "nome",
      "telefone",
      "email",
      "instancia",
      "departamento",
      "cliente",
      "empresa",
    ]) {
      expect(isNativeMessageVariableKey(key)).toBe(true);
    }
    expect(isNativeMessageVariableKey("codigo_do_cliente")).toBe(false);
  });

  it("reserves native contact names independently from technical keys", () => {
    expect(isNativeContactFieldName("  E-MAIL ")).toBe(true);
    expect(isNativeContactFieldName("Departamento do Contato")).toBe(true);
    expect(isNativeContactFieldName("Código do cliente")).toBe(false);
  });
});
