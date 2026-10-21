import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");

describe("PACK 12 · D15 · rolagem com protocolos abertos", () => {
  it("mantém a área central rolável quando o painel lateral está aberto", () => {
    expect(source).toContain('className="inbox-message-background min-w-0 flex-1 overflow-y-auto');
    expect(source).toContain(
      'className="absolute inset-0 z-10 cursor-default bg-transparent 2xl:hidden"',
    );
    expect(source).toContain("scrollRef.current?.scrollBy({ top: event.deltaY");
  });
});
