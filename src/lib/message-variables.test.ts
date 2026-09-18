import { describe, expect, it } from "vitest";
import { resolveMessageVariables } from "./message-variables";

describe("chat message variables", () => {
  it("resolves the contato token offered in quick replies", () => {
    expect(resolveMessageVariables("Olá {{contato}}", { contactName: "Ana" })).toBe("Olá Ana");
  });
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

  it("replaces variables for configurable contact fields by their visible label", () => {
    expect(
      resolveMessageVariables("CPF: {{cpf}} | Código: {{ codigo do cliente }}", {
        customFields: { CPF: "123.456.789-00", "Código do cliente": "TRX-42" },
      }),
    ).toBe("CPF: 123.456.789-00 | Código: TRX-42");
  });
});
