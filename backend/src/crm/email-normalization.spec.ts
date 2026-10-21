import { describe, expect, it } from "vitest";
import { normalizeContactCustomFieldValue, normalizeNullableEmail } from "./crm.controller";
import { ContactCustomFieldType } from "../generated/prisma";

describe("CRM email normalization", () => {
  it("trims and lowercases contact and customer emails", () => {
    expect(normalizeNullableEmail("  Pessoa.Teste@EXAMPLE.COM  ")).toBe("pessoa.teste@example.com");
  });

  it("preserves nullable semantics", () => {
    expect(normalizeNullableEmail(undefined)).toBeNull();
    expect(normalizeNullableEmail(null)).toBeNull();
    expect(normalizeNullableEmail("   ")).toBeNull();
  });

  it("lowercases a custom field configured with the e-mail format", () => {
    expect(
      normalizeContactCustomFieldValue(
        {
          type: ContactCustomFieldType.TEXT,
          mask: JSON.stringify({ custom: { format: "email" } }),
        },
        "  Financeiro@Example.COM  ",
      ),
    ).toBe("financeiro@example.com");
  });
});
