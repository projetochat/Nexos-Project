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

    expect(source).toContain(
      "useGroupContactPicker(!!group && canManageGroupParticipants, availableQuery)",
    );
  });

  it("identifies creator, administrator and the connected account with exclusive labels", () => {
    const source = readFileSync(new URL("./grupos.tsx", import.meta.url), "utf8");

    expect(source).toContain("GroupParticipantRoleBadge");
    expect(source).toContain("Criador");
    expect(source).toContain("Admin");
    expect(source).toContain('title="Número conectado ao Trixus"');
    expect(source).toContain('<Smartphone className="h-3 w-3" /> Você');
    expect(source).toContain("{roleBadge}");
    expect(source).toContain("{instanceBadge}");
    expect(source.indexOf("{instanceBadge}")).toBeLessThan(source.indexOf("{roleBadge}"));
    expect(source).not.toContain(">Suporte</Badge>");
    expect(source).not.toContain(">Meu número</Badge>");
  });

  it("renders cards without an outer balloon and keeps pagination in its own footer", () => {
    const source = readFileSync(new URL("./grupos.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3"');
    expect(source).toContain('<div className="overflow-hidden rounded-xl border border-border">');
    expect(source).toContain("<GridPaginationFooter");
    expect(source).not.toContain('<Card padding={false} className="min-w-0 overflow-hidden">');
  });
});
