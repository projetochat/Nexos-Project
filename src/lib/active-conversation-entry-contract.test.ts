import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const entryPoints = [
  "src/routes/contatos.tsx",
  "src/routes/inbox.index.tsx",
  "src/routes/-historico-page.tsx",
];

describe.each(entryPoints)("active conversation entry %s", (entryPoint) => {
  it("delegates the post-contact flow to the shared orchestrator", () => {
    const source = readFileSync(resolve(process.cwd(), entryPoint), "utf8");
    expect(source).toContain("<ActiveConversationOrchestrator");
    expect(source).toContain("ActiveConversationRequest");
  });
});
