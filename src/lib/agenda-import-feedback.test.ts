import { describe, expect, it } from "vitest";
import { agendaCapacityMessage, agendaImportFeedback } from "./agenda-import-feedback";

describe("agenda import feedback", () => {
  it("preserves legacy successful responses without optional counters", () => {
    expect(agendaImportFeedback({ total: 4, imported: 4 })).toEqual({
      partial: false,
      title: "Importação concluída",
      description: "4 de 4 contato(s) importado(s).",
    });
    expect(agendaCapacityMessage()).toBeNull();
  });
  it("distinguishes quota refusal from other failures in a partial result", () => {
    const result = agendaImportFeedback({ total: 10, imported: 5, limitReached: 3, failed: 2 });
    expect(result.partial).toBe(true);
    expect(result.title).toBe("Importação parcial");
    expect(result.description).toContain("5 de 10");
    expect(result.description).toContain("3 contato(s) não importado(s) por atingir o limite");
    expect(result.description).toContain("2 contato(s) não importado(s) por outras falhas");
  });
  it("warns for a partial legacy response without assuming a quota failure", () => {
    const result = agendaImportFeedback({ total: 2000, imported: 0 });
    expect(result.partial).toBe(true);
    expect(result.title).toBe("Importação parcial");
    expect(result.description).toContain("0 de 2.000");
    expect(result.description).toContain("motivo dos contatos não importados não foi informado");
    expect(result.description).not.toContain("por atingir o limite");
  });
  it("completes successfully when one imported and 99 already linked contacts fulfill the request", () => {
    const result = agendaImportFeedback({
      total: 100,
      imported: 1,
      unchanged: 99,
      failed: 0,
      limitReached: 0,
    });
    expect(result.partial).toBe(false);
    expect(result.title).toBe("Importação concluída");
    expect(result.description).toContain("1 de 100 contato(s) importado(s).");
    expect(result.description).toContain(
      "99 contato(s) já vinculado(s), sem alterações necessárias.",
    );
    expect(result.description).not.toContain("não importados não foi informado");
  });
  it.each([{ limitReached: 1 }, { failed: 1 }])("warns when any refusal remains: %j", (counts) => {
    expect(agendaImportFeedback({ total: 1, imported: 0, ...counts }).partial).toBe(true);
  });
  it("uses success only with no quota refusals or failures", () => {
    expect(
      agendaImportFeedback({ total: 2, imported: 2, limitReached: 0, failed: 0 }).partial,
    ).toBe(false);
  });
  it("explains finite and exhausted tenant capacity without truncating candidates", () => {
    const message = agendaCapacityMessage({ limit: 1000, active: 1000, available: 0 });
    expect(message).toContain("1.000 de 1.000");
    expect(message).toContain("0 vaga(s)");
    expect(message).toContain("Os contatos continuam disponíveis para seleção.");
  });
  it("describes unlimited capacity without showing zero slots", () => {
    const message = agendaCapacityMessage({ limit: null, active: 2000, available: null });
    expect(message).toContain("2.000");
    expect(message).toContain("sem limite");
    expect(message).not.toContain("0 vaga");
  });
});
