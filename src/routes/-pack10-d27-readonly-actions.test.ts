import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("PACK 10 D27 readonly actions", () => {
  it("opens groups through an Eye action without granting edit capabilities", () => {
    const groups = source("./grupos.tsx");

    expect(groups).toContain('permissions.includes("groups.read")');
    expect(groups).toContain('title="Visualizar grupo"');
    expect(groups).toContain('openGroupDetail(group, "view")');
    expect(groups).toContain('canManage={canUpdate && groupDetailMode === "edit"}');
  });

  it("keeps the campaign Eye action explicitly readonly", () => {
    const campaigns = source("./campanhas.tsx");

    expect(campaigns).toContain('title="Visualizar campanha"');
    expect(campaigns).toContain('setDetailMode("view")');
    expect(campaigns).toContain('canStartAction={detailMode === "manage" && canStart}');
    expect(campaigns).toContain('readOnly={detailMode === "view"}');
  });

  it("renders ticket Eye actions and a close-only readonly footer", () => {
    const tickets = source("./chamados.tsx");

    expect(tickets).toContain('title="Visualizar chamado"');
    expect(tickets).toContain('readOnly={detailMode === "view"}');
    expect(tickets).toContain("customerPortal || readOnly");
    expect(tickets).toContain("Fechar");
  });
});
