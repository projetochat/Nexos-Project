import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("operational connection sources", () => {
  it("keeps Contact and Inbox selectors on the shared real Connections hook", () => {
    const contatos = source("src/routes/contatos.tsx");
    const inbox = source("src/routes/inbox.index.tsx");

    expect(contatos).toContain("useConnectedMessagingConnections");
    expect(inbox).toContain("useConnectedMessagingConnections");
  });

  it("does not ship legacy instance names in operational runtime files", () => {
    const runtimeSources = [
      source("src/routes/contatos.tsx"),
      source("src/routes/inbox.index.tsx"),
      source("src/components/report-filters.tsx"),
      source("src/routes/simulador.tsx"),
    ].join("\n");

    expect(runtimeSources).not.toMatch(/ENORE|FLOWID|ZYVO/);
  });
});

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}
