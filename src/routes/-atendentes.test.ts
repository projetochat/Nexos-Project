import { expect, it } from "vitest";
import { sortAtendentes } from "@/lib/attendant-sort";

it("lists the administrator, active attendants and inactive attendants in that order", () => {
  const attendees = sortAtendentes([
    { nome: "Zilda", perfilKey: "agent", ativo: false },
    { nome: "Bruno", perfilKey: "agent", ativo: true },
    { nome: "Administrador", perfilKey: "tenant_admin", ativo: false },
    { nome: "Ana", perfilKey: "agent", ativo: true },
    { nome: "Caio", perfilKey: "agent", ativo: false },
  ]);

  expect(attendees.map((attendant) => attendant.nome)).toEqual([
    "Administrador",
    "Ana",
    "Bruno",
    "Caio",
    "Zilda",
  ]);
});
