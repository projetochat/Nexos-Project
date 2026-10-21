import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const groupsSource = readFileSync(new URL("./grupos.tsx", import.meta.url), "utf8");
const contactsSource = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");
const historySource = readFileSync(new URL("./-historico-page.tsx", import.meta.url), "utf8");

const conversationHover =
  "hover:!border-primary hover:!bg-primary hover:!text-primary-foreground focus-visible:!border-primary focus-visible:!bg-primary focus-visible:!text-primary-foreground";

describe("ações de conversa em grupos e contatos", () => {
  it("reutiliza o hover azul sólido do Histórico", () => {
    expect(historySource).toContain(conversationHover);
    expect(groupsSource.match(new RegExp(conversationHover, "g"))).toHaveLength(2);
    expect(contactsSource.match(new RegExp(conversationHover, "g"))).toHaveLength(1);
  });

  it("usa nos grupos o mesmo ícone de iniciar conversa usado em contatos", () => {
    expect(contactsSource).toContain('<MessageSquarePlus className="h-3.5 w-3.5" />');
    expect(groupsSource.match(/<MessageSquarePlus className=/g)).toHaveLength(2);
    expect(groupsSource).not.toContain("MessageSquareMore");
  });

  it("aplica o hover destrutivo completo ao botão Sair do grupo", () => {
    const leaveAction = groupsSource.slice(
      groupsSource.indexOf('title="Sair do grupo"') - 150,
      groupsSource.indexOf('title="Sair do grupo"') + 250,
    );

    expect(leaveAction).toContain('className="action-hover-destructive"');
    expect(leaveAction).not.toContain("text-destructive hover:bg-destructive/10");
  });
});
