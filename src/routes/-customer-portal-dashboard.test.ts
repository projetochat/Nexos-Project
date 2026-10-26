import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("./portal-cliente_.dashboard.tsx", import.meta.url), "utf8");
const session = readFileSync(new URL("../lib/session.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/trixus-api.ts", import.meta.url), "utf8");

describe("dashboard exclusivo do Portal do Cliente", () => {
  it("possui rota própria e usa somente indicadores retornados pela API", () => {
    expect(dashboard).toContain('createFileRoute("/portal-cliente_/dashboard")');
    expect(dashboard).toContain("ticketApi.portalDashboard");
    expect(api).toContain("`/tickets/portal/dashboard${queryString(params)}`");
    expect(dashboard).toContain("Chamados por departamento");
    expect(dashboard).toContain("Chamados por filial");
    expect(dashboard).toContain("Tipos de chamado");
    expect(dashboard).toContain("Distribuição por prioridade");
    expect(dashboard).not.toContain("Pacote de horas");
  });

  it("restringe menu, home e rota ao perfil Acesso Full", () => {
    expect(session).toContain('portalAccessProfile === "FULL_ACCESS"');
    expect(session).toContain("CUSTOMER_PORTAL_DASHBOARD_PATH");
    expect(shell).toContain('portalAccessProfile === "FULL_ACCESS"');
    expect(api).toContain("portalAccessProfile: data.portalAccess?.accessProfile");
  });
});
