import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/trixus-api.ts", import.meta.url), "utf8");

describe("attendant physical deletion UI contract", () => {
  it("uses the shared preview and snapshot-confirmed deletion dialog", () => {
    expect(route).toContain("<DeletionConfirmDialog");
    expect(route).toContain("organizationApi.userDeletionPreview(removing.id, signal)");
    expect(route).toContain("organizationApi.deleteUser(removing.id, snapshotToken, signal)");
  });

  it("exposes the preview and DELETE contracts without a block/unblock action", () => {
    expect(api).toContain("`/users/${id}/deletion-preview`");
    expect(api).toContain("apiRequest<ApiDeletionConfirmationResult>(`/users/${id}`");
    expect(route).not.toContain("organizationApi.deactivateUser(atendente.id)");
    expect(route).not.toContain("organizationApi.activateUser(atendente.id)");
    expect(route).not.toContain("Bloquear Atendente?");
    expect(route).not.toContain("Desbloquear Atendente?");
  });
});
