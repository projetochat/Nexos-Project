import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("operational connection sources", () => {
  it("keeps Contact and Inbox selectors on the shared real Connections hook", () => {
    const orchestrator = source("src/components/active-conversation-orchestrator.tsx");

    expect(orchestrator).toContain("useConnectedMessagingConnections");
    expect(orchestrator).toContain("resolveConnectedContactInstances");
    for (const entry of [
      "src/routes/contatos.tsx",
      "src/routes/inbox.index.tsx",
      "src/routes/-historico-page.tsx",
    ]) {
      expect(source(entry)).toContain("<ActiveConversationOrchestrator");
    }
  });

  it("does not ship legacy instance names in operational runtime files", () => {
    const runtimeSources = [
      source("src/routes/contatos.tsx"),
      source("src/routes/inbox.index.tsx"),
      source("src/components/report-filters.tsx"),
    ].join("\n");

    expect(runtimeSources).not.toMatch(/ENORE|FLOWID|ZYVO/);
  });

  it("does not ship the removed customer simulator route", () => {
    expect(existsSync(resolve(root, "src/routes/simulador.tsx"))).toBe(false);
    expect(source("src/components/app-shell.tsx")).not.toMatch(/simulador/i);
    expect(source("src/routeTree.gen.ts")).not.toMatch(/simulador/i);
  });
});

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}
