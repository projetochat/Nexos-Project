import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Gerenciar Grupos performance contract", () => {
  it("does not load the instance filter through the generic CRM options endpoint", () => {
    const source = readFileSync(new URL("./grupos.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/crmApi\s*\.\s*contactOptions\s*\(/);
    expect(source).not.toContain("/crm/contacts/options");
  });

  it("loads cards through the lightweight group summary endpoint", () => {
    const source = readFileSync(new URL("../lib/trixus-api.ts", import.meta.url), "utf8");

    expect(source).toContain("/groups/summary");
  });
});
