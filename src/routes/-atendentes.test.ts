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

it("uses the standard grid header and compact integrated footer", () => {
  const source = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");

  expect(source).toContain(
    'className={viewMode === "list" ? "hidden overflow-hidden p-0 md:block" : "hidden"}',
  );
  expect(source).toContain(
    '<thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">',
  );
  expect(source).toContain(
    "border-t border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4",
  );
  expect(source).toContain("Mostrando {num(paginated.length)} de {num(filtered.length)}");
  expect(source).toContain('aria-label="Registros por página"');
  expect(source).toContain('className="!h-6 !min-h-6 !w-16 !rounded-md !px-2 !py-0 !pr-7 text-xs"');
  expect(source.match(/className="!h-7 !min-h-7 !w-7 !p-0"/g)).toHaveLength(2);
});

it("reserva espaço suficiente para todas as ações da grade", () => {
  const source = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");

  expect(source).toContain('<div className="overflow-x-auto">');
  expect(source).toContain('className="w-full min-w-[1100px] table-fixed text-sm"');
  expect(source).toContain('className="w-[16%] rounded-tr-lg px-2 py-3 text-center font-medium"');
  expect(source).toContain('className="mx-auto grid w-[156px] grid-cols-4 gap-1"');
  expect(source).toContain('size="icon"');
});

it("alinha as ações sem oferecer bloqueio ou desbloqueio", () => {
  const source = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");

  expect(source).toContain('className="mx-auto grid w-[156px] grid-cols-4 gap-1"');
  expect(source).not.toContain('title={a.ativo ? "Bloquear" : "Desbloquear"}');
  expect(source).not.toContain("Bloquear Atendente?");
  expect(source).toContain("aria-label={`Excluir ${a.nome}`}");
});

it("separa as ações por uma linha no card mobile", () => {
  const source = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");
  const cardStart = source.indexOf("const renderAttendantCard = (a: Atendente) =>");
  const paginationStart = source.indexOf("const paginationControls =", cardStart);
  const attendantCard = source.slice(cardStart, paginationStart);

  expect(attendantCard).toContain('<Card key={a.id} padding={false} className="overflow-hidden">');
  expect(attendantCard).toContain('<div className="flex min-w-0 items-center gap-3 p-4">');
  expect(attendantCard).toContain('<div className="ml-auto shrink-0 self-start">');
  expect(attendantCard).toContain('<Badge tone={a.ativo ? "success" : "destructive"}>');
  expect(attendantCard).toContain('{a.ativo ? "Ativo" : "Inativo"}');
  expect(attendantCard).toContain(
    '<div className="mx-4 flex justify-end gap-1 border-t border-border py-2">',
  );
  expect(source).toContain('<div className="space-y-3 md:hidden">');
  expect(source).toContain("{!isLoading && paginated.map(renderAttendantCard)}");
});

it("alterna entre cards e lista de atendentes no desktop", () => {
  const source = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");

  expect(source).toContain('useState<AttendantViewMode>("list")');
  expect(source).toContain('aria-label="Visualização de atendentes"');
  expect(source).toContain('aria-label="Visualizar atendentes em cards"');
  expect(source).toContain('aria-label="Visualizar atendentes em lista"');
  expect(source).toContain('<LayoutGrid className="h-4 w-4" />');
  expect(source).toContain('<List className="h-4 w-4" />');
  expect(source).toContain('{viewMode === "cards" && (');
  expect(source).toContain('className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"');
  expect(source).toContain(
    'className={viewMode === "list" ? "hidden overflow-hidden p-0 md:block" : "hidden"}',
  );
  expect(source.match(/\{paginationControls\}/g)).toHaveLength(3);
  expect(source).toContain(
    'className="flex items-center justify-between gap-2 overflow-hidden rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4"',
  );
});
