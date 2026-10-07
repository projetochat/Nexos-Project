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

  it("separates permission to leave a group from permission to edit it", () => {
    const source = readFileSync(new URL("./grupos.tsx", import.meta.url), "utf8");

    expect(source).toContain('const canLeave = permissions.includes("groups.leave")');
    expect(source).toContain("canEdit={canUpdate}");
    expect(source).toContain("onLeave={canLeave ?");
    expect(source).toContain("{canLeave && (");
  });

  it("does not load the contact picker while a group is open in read-only mode", () => {
    const source = readFileSync(new URL("./grupos.tsx", import.meta.url), "utf8");

    expect(source).toContain("useGroupContactPicker(!!group && canManage, availableQuery)");
  });
});
