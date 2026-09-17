import { describe, expect, it } from "vitest";
import { resolveMessageVariables } from "./message-variables";

describe("chat message variables", () => {
  it("replaces every documented variable using the active conversation", () => {
    expect(
      resolveMessageVariables(
        "{{cumprimento}}, {{nome}}. {{telefone}} · {{email}} · {{instancia}} · {{cliente}} · {{departamento}}",
        {
          contactName: "Ana",
          phone: "(62) 99999-0000",
          email: "ana@exemplo.com",
          instance: "Comercial",
          customer: "Empresa Exemplo",
          department: "Suporte",
          now: new Date("2026-09-17T14:00:00"),
        },
      ),
    ).toBe(
      "Boa tarde, Ana. (62) 99999-0000 · ana@exemplo.com · Comercial · Empresa Exemplo · Suporte",
    );
  });

  it("keeps unknown variables unchanged and accepts spaces and case variations", () => {
    expect(
      resolveMessageVariables("{{ NOME }} {{ desconhecida }}", {
        contactName: "Ana",
        now: new Date("2026-09-17T09:00:00"),
      }),
    ).toBe("Ana {{ desconhecida }}");
  });
});
