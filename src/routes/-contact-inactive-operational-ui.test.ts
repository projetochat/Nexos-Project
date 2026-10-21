import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contacts = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");
const campaigns = readFileSync(new URL("./campanhas.tsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");
const orchestrator = readFileSync(
  new URL("../components/active-conversation-orchestrator.tsx", import.meta.url),
  "utf8",
);

describe("inactive contact operational UI", () => {
  it("blocks all centralized active-conversation entries", () => {
    expect(orchestrator).toContain("request?.contact.active !== false");
    expect(orchestrator).toContain("Reative o contato antes de iniciar uma conversa.");
    expect(contacts).toContain("Contato inativo — reative para abrir uma conversa");
    expect(contacts).toContain("disabled={contact.active === false}");
    expect(contacts).toContain("Desativar contato");
    expect(contacts).toContain("Reativar contato");
    expect(contacts).toContain("Salvar alterações");
    expect(contacts).toContain("Cadastrar contato");
  });

  it("removes inactive contacts from the campaign selector", () => {
    expect(campaigns).toContain(".filter((contact) => contact.active !== false)");
  });

  it("shows the inactive warning and protects the composer", () => {
    expect(inbox).toContain("Contato inativo — as mensagens recebidas continuam registradas");
    expect(inbox).toContain(
      'type DisabledReason = "closed" | "standby" | "lead" | "not-mine" | "inactive" | null',
    );
    expect(inbox).toContain('disabledReason === "inactive"');
  });
});
