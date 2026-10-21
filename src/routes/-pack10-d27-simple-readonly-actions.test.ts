import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("PACK 10 D27 readonly actions for catalog forms", () => {
  it("protects the tag viewer with chat.tags.read and a readonly form", () => {
    const tags = source("./etiquetas.tsx");

    expect(tags).toContain('permissions?.includes("chat.tags.read")');
    expect(tags).toContain("<Eye");
    expect(tags).toContain("readOnly");
    expect(tags).toContain('readOnly ? "Fechar" : "Cancelar"');
  });

  it("opens quick replies through a read-only Eye action", () => {
    const quickReplies = source("./mensagens-rapidas.tsx");

    expect(quickReplies).toContain('permissions?.includes("chat.quick_replies.read")');
    expect(quickReplies).toContain("openView(reply)");
    expect(quickReplies).toContain("readOnly={!!viewing}");
    expect(quickReplies).toContain('readOnly ? "Fechar" : "Cancelar"');
  });

  it("keeps department visualization separate from editing", () => {
    const departments = source("./departamentos.tsx");

    expect(departments).toContain('permissions.includes("departments.read")');
    expect(departments).toContain("setViewing(d)");
    expect(departments).toContain('"Visualizar Departamento"');
    expect(departments).toContain("<fieldset disabled={readOnly}");
  });

  it("provides Eye actions for mobile and desktop schedules with a close-only viewer", () => {
    const schedules = source("./agendamentos.tsx");

    expect(schedules).toContain('permissions?.includes("schedules.read")');
    expect(schedules.match(/onView=\{\(\) => setViewing\(item\)\}/g)).toHaveLength(2);
    expect(schedules).toContain('title={readOnly ? "Visualizar Agendamento" : "Agendamento"}');
    expect(schedules).toContain("!readOnly && (");
  });
});
