import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("histórico de conversas com atendente excluído", () => {
  it("usa o nome preservado antes de exibir Sem atendente", () => {
    const source = readFileSync(new URL("./-historico-page.tsx", import.meta.url), "utf8");
    const snapshotIndex = source.indexOf("conversation.assigned_membership_name_snapshot");
    const emptyIndex = source.indexOf('"Sem atendente"', snapshotIndex);

    expect(snapshotIndex).toBeGreaterThan(-1);
    expect(emptyIndex).toBeGreaterThan(snapshotIndex);
  });
});
