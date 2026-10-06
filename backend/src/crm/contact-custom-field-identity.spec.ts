import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  contactCustomFieldVariableKey,
  isNativeContactFieldName,
  isNativeMessageVariableKey,
  NATIVE_CONTACT_FIELD_NAMES,
  NATIVE_RESERVED_VARIABLE_KEYS,
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
    for (const key of NATIVE_RESERVED_VARIABLE_KEYS) {
      expect(isNativeMessageVariableKey(key)).toBe(true);
    }
    expect(isNativeMessageVariableKey("codigo_do_cliente")).toBe(false);
  });

  it("reserves native contact names independently from technical keys", () => {
    for (const name of NATIVE_CONTACT_FIELD_NAMES) {
      expect(isNativeContactFieldName(name)).toBe(true);
    }
    expect(isNativeContactFieldName("WhatsApp")).toBe(true);
    expect(isNativeContactFieldName("Perfil")).toBe(true);
    expect(isNativeContactFieldName("Etiqueta")).toBe(true);
    expect(isNativeContactFieldName("Código do cliente")).toBe(false);
  });

  it("keeps the SQL migration catalog exactly aligned with the canonical runtime catalog", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "prisma/migrations/20261005210000_contact_custom_field_identity/migration.sql"),
      "utf8",
    );
    expect(sqlArray(sql, "NATIVE_NAMES")).toEqual([...NATIVE_CONTACT_FIELD_NAMES]);
    expect(sqlArray(sql, "RESERVED_KEYS")).toEqual([...NATIVE_RESERVED_VARIABLE_KEYS]);
  });
});

function sqlArray(sql: string, marker: "NATIVE_NAMES" | "RESERVED_KEYS") {
  const block = new RegExp(
    `CONTACT_CUSTOM_FIELD_${marker}_START([\\s\\S]*?)CONTACT_CUSTOM_FIELD_${marker}_END`,
  ).exec(sql)?.[1];
  if (!block) throw new Error(`Catálogo SQL ${marker} ausente.`);
  return Array.from(block.matchAll(/'([^']+)'/g), (match) => match[1]);
}
