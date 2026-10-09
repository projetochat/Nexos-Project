import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const automations = readFileSync(new URL("./automacoes.tsx", import.meta.url), "utf8");
const tickets = readFileSync(new URL("./chamados.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/trixus-api.ts", import.meta.url), "utf8");

describe("physical deletion UI contracts", () => {
  it("keeps the unfinished automation module disabled while retaining the reviewed flow", () => {
    expect(automations).toContain("const MODULE_AVAILABLE = false");
    expect(automations).toContain("<DeletionConfirmDialog");
    expect(automations).toContain("automationApi.deletionPreview");
    expect(automations).toContain("automationApi.remove");
  });

  it("uses the dynamic deletion dialog for tickets", () => {
    expect(tickets).toContain("<DeletionConfirmDialog");
    expect(tickets).toContain("ticketApi.deletionPreview");
    expect(tickets).toContain("ticketApi.remove");
    expect(tickets).not.toContain('title="Excluir chamado?"');
  });

  it("exposes preview and snapshot-confirmed DELETE endpoints", () => {
    expect(api).toContain("`/automations/${id}/deletion-preview`");
    expect(api).toContain("apiRequest<ApiDeletionConfirmationResult>(`/automations/${id}`");
    expect(api).toContain("`/tickets/${id}/deletion-preview`");
    expect(api).toContain("apiRequest<ApiDeletionConfirmationResult>(`/tickets/${id}`");
    expect(api).toContain("snapshotToken");
  });
});
