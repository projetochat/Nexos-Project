import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const groups = readFileSync(new URL("./grupos.tsx", import.meta.url), "utf8");
const profiles = readFileSync(new URL("./perfis.tsx", import.meta.url), "utf8");
const instances = readFileSync(new URL("./instancias.tsx", import.meta.url), "utf8");

describe("consistência das ações e toggles solicitados", () => {
  it("usa nos editores internos de Grupo o mesmo size sm do botão do card", () => {
    const modalStart = groups.indexOf('title={canManageGroupParticipants ? "Editar Grupo"');
    expect(modalStart).toBeGreaterThanOrEqual(0);
    const participantsStart = groups.indexOf("Participantes", modalStart);
    const editorHeader = groups.slice(modalStart, participantsStart);

    expect(editorHeader).toMatch(/size="sm"[\s\S]*?title=\{editingName/);
    expect(editorHeader).toMatch(/size="sm"[\s\S]*?title=\{editingDescription/);
    expect(editorHeader).not.toMatch(/size="icon"[\s\S]*?title=\{editing(Name|Description)/);
  });

  it("usa o Switch padrão em Habilitar Jornada", () => {
    const editorStart = profiles.indexOf("export function WorkScheduleEditor");
    const editor = profiles.slice(editorStart);

    expect(editor).toContain("<Switch");
    expect(editor).toContain("checked={enabled}");
    expect(editor).toContain("onCheckedChange={(checked) =>");
    expect(editor).toContain("noSchedule: !checked");
    expect(editor).not.toContain("h-7 w-12");
  });

  it("usa o Switch padrão nas mensagens de saudação e ausência", () => {
    const optionStart = instances.indexOf("function ImportOption");
    const optionEnd = instances.indexOf("function InstanceInfoNotice", optionStart);
    const option = instances.slice(optionStart, optionEnd);

    expect(option).toContain("<Switch");
    expect(option).toContain("onCheckedChange={onCheckedChange}");
    expect(option).not.toContain('role="switch"');
    expect(instances).toContain('label="Ativar mensagem de saudação"');
    expect(instances).toContain('label="Ativar mensagem de ausência"');
  });
});
