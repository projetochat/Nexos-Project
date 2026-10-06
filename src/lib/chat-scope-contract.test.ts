import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("catálogos independentes do escopo do Chat", () => {
  it("não compartilha endpoint nem cache de instâncias com o CRUD", () => {
    const source = readFileSync(
      new URL("./use-connected-messaging-connections.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("connectionsApi.listChatScope");
    expect(source).toContain('"chat-messaging-connections"');
    expect(source).not.toContain("queryFn: connectionsApi.list,");
  });

  it("atualiza o cache dedicado do Chat quando a instância muda de estado", () => {
    const source = readFileSync(new URL("./realtime/hooks.ts", import.meta.url), "utf8");
    expect(source).toContain('["trixus", "chat-messaging-connections"]');
    expect(source).toContain('["trixus", "role-scope-options"]');
  });

  it("mantém o catálogo de Contatos independente e usa o escopo Chat só ao conversar", () => {
    const contacts = readFileSync(new URL("../routes/contatos.tsx", import.meta.url), "utf8");
    const orchestrator = readFileSync(
      new URL("../components/active-conversation-orchestrator.tsx", import.meta.url),
      "utf8",
    );
    expect(contacts).toContain("setInstances(sortByOptionLabel(options.instances");
    expect(contacts).toContain("<ActiveConversationOrchestrator");
    expect(orchestrator).toContain("enabled: !!request && canStart");
    expect(orchestrator).toContain("resolveConnectedContactInstances(request.contact, instances)");
  });

  it("usa os catálogos do Chat nos filtros operacionais", () => {
    const dashboard = readFileSync(
      new URL("../components/dashboard-filters.tsx", import.meta.url),
      "utf8",
    );
    const reports = readFileSync(
      new URL("../components/report-filters.tsx", import.meta.url),
      "utf8",
    );
    expect(dashboard).toContain("organizationApi.listChatDepartments");
    expect(dashboard).toContain("connectionsApi.listChatScope");
    expect(reports).toContain("organizationApi.listChatDepartments");
  });

  it("intersecta as instâncias de Contatos com o escopo permitido no modal do Inbox", () => {
    const source = readFileSync(new URL("../routes/inbox.index.tsx", import.meta.url), "utf8");
    expect(source).toContain("new Set(availableConnections.map((connection) => connection.id))");
    expect(source).toContain("filter((instance) => allowedIds.has(instance.id))");
  });
});
