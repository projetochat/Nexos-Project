import { readFileSync } from "node:fs";
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

it("uses the official toggle to edit the attendant active status", () => {
  const source = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");

  expect(source).toContain('import { Switch } from "@/components/ui/switch"');
  expect(source).toContain("onCheckedChange={(checked) => setForm({ ...form, ativo: checked })}");
  expect(source).toContain('membershipStatus: data.ativo === false ? "DISABLED" : "ACTIVE"');
  expect(source).not.toContain('type="checkbox"');
});

it("sends the selected profile when creating an attendant without referencing an edit id", () => {
  const source = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");

  expect(source).toContain("roleId: data.perfilId");
  expect(source).not.toContain("atendentes.find((atendente) => atendente.id === id)?.perfilId");
});
