import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./inbox.index.tsx", import.meta.url), "utf8");

describe("Inbox visual requirements", () => {
  it("keeps the new-conversation modal and its result area at stable sizes", () => {
    expect(source).toContain("h-[calc(100dvh-1rem)]");
    expect(source).toContain("flex h-full min-h-0 flex-col gap-3");
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto rounded-lg");
  });

  it("uses the approved bulk-close label and light semantic hover", () => {
    expect(source).toContain("Fechar Conversas em Massa");
    expect(source).not.toContain(">Fechar Conversas</DropdownMenuItem>");
    expect(source).toContain("data-[highlighted]:bg-surface-2");
  });
});
