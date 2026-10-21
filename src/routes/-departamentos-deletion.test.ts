import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("department physical deletion UI contract", () => {
  it("keeps deactivation separate and exposes explicit irreversible deletion", () => {
    const source = read("./departamentos.tsx");

    expect(source).toContain("departmentDeactivationPreview");
    expect(source).toContain("deactivateDepartment");
    expect(source).toContain("aria-label={`Excluir departamento ${d.name}`}");
    expect(source).toContain("<DeletionConfirmDialog");
    expect(source).toContain("departmentDeletionPreview");
    expect(source).toContain("deleteDepartment(deleting.id, snapshotToken, signal)");
  });

  it("renders preserved tickets without a department and requires one before saving", () => {
    const source = read("./chamados.tsx");

    expect(source).toContain('ticket.department?.name ?? "Sem departamento"');
    expect(source).toContain('item.department?.name ?? "Sem departamento"');
    expect(source).toContain('pendingFields.push("Departamento responsável")');
    expect(source).toContain("showRequiredFieldsToast(pendingFields)");
  });
});
