import { describe, expect, it } from "vitest";
import { conversationListMetadataLabel } from "./conversation-list-metadata";

describe("conversationListMetadataLabel", () => {
  it("joins company, department and profile when they exist", () => {
    expect(
      conversationListMetadataLabel({
        company: "Empresa A",
        department: "Comercial",
        profile: "Gerente",
      }),
    ).toBe("Empresa A - Comercial - Gerente");
  });

  it.each([
    [{ department: "Comercial", profile: "Gerente" }, "Comercial - Gerente"],
    [{ company: "Empresa A", profile: "Gerente" }, "Empresa A - Gerente"],
    [{ company: "Empresa A", department: "Comercial" }, "Empresa A - Comercial"],
  ])("omits each missing value without leaving an empty separator", (metadata, expected) => {
    expect(conversationListMetadataLabel(metadata)).toBe(expected);
  });

  it("prefers current catalogs and falls back to legacy values", () => {
    expect(
      conversationListMetadataLabel({
        department: "Financeiro",
        legacyDepartment: "Departamento legado",
        profile: "Decisor",
        legacyProfile: "Perfil legado",
      }),
    ).toBe("Financeiro - Decisor");
    expect(
      conversationListMetadataLabel({
        department: "   ",
        legacyDepartment: "Departamento legado",
        profile: "",
        legacyProfile: "Perfil legado",
      }),
    ).toBe("Departamento legado - Perfil legado");
  });

  it("returns null when every value is empty", () => {
    expect(conversationListMetadataLabel({ company: "   " })).toBeNull();
  });
});
