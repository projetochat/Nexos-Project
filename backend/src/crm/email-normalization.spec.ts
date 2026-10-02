import { describe, expect, it } from "vitest";
import { normalizeNullableEmail } from "./crm.controller";

describe("CRM email normalization", () => {
  it("trims and lowercases contact and customer emails", () => {
    expect(normalizeNullableEmail("  Pessoa.Teste@EXAMPLE.COM  ")).toBe("pessoa.teste@example.com");
  });

  it("preserves nullable semantics", () => {
    expect(normalizeNullableEmail(undefined)).toBeNull();
    expect(normalizeNullableEmail(null)).toBeNull();
    expect(normalizeNullableEmail("   ")).toBeNull();
  });
});
