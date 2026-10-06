import { describe, expect, it } from "vitest";
import { resolveMessageTemplate } from "./message-template";
import { InvalidMessageTimezoneError } from "./message-local-time";

describe("resolveMessageTemplate", () => {
  it.each([
    ["2026-09-17T03:00:00.000Z", "Bom dia"],
    ["2026-09-17T14:59:00.000Z", "Bom dia"],
    ["2026-09-17T15:00:00.000Z", "Boa tarde"],
    ["2026-09-17T20:59:00.000Z", "Boa tarde"],
    ["2026-09-17T21:00:00.000Z", "Boa noite"],
    ["2026-09-18T02:59:00.000Z", "Boa noite"],
  ])("resolves saudacao at the local boundary for %s", (iso, expected) => {
    expect(
      resolveMessageTemplate("{{saudacao}}", {
        now: new Date(iso),
        timezone: "America/Sao_Paulo",
      }),
    ).toBe(expected);
  });

  it("keeps cumprimento as a compatible alias", () => {
    const context = { now: new Date("2026-09-17T15:00:00Z"), timezone: "America/Sao_Paulo" };
    expect(resolveMessageTemplate("{{saudacao}} / {{cumprimento}}", context)).toBe(
      "Boa tarde / Boa tarde",
    );
  });

  it("isolates simultaneous instances in different time zones", () => {
    const now = new Date("2026-09-17T15:30:00Z");
    expect(resolveMessageTemplate("{{saudacao}}", { now, timezone: "America/Sao_Paulo" })).toBe(
      "Boa tarde",
    );
    expect(resolveMessageTemplate("{{saudacao}}", { now, timezone: "Pacific/Honolulu" })).toBe(
      "Bom dia",
    );
  });

  it("rejects absent and invalid time zones instead of using the server zone", () => {
    const now = new Date("2026-09-17T15:00:00Z");
    expect(() => resolveMessageTemplate("{{saudacao}}", { now })).toThrow(
      InvalidMessageTimezoneError,
    );
    expect(() =>
      resolveMessageTemplate("{{saudacao}}", { now, timezone: "Invalid/Timezone" }),
    ).toThrow(InvalidMessageTimezoneError);
  });

  it("formats checkbox, date, instant and multiple list fields", () => {
    expect(
      resolveMessageTemplate(
        "{{ativo}}|{{inativo}}|{{nulo}}|{{nascimento}}|{{ultimo_acesso}}|{{interesses}}|{{vazia}}",
        {
          timezone: "America/Sao_Paulo",
          customFieldValues: [
            { label: "Ativo", variableKey: "ativo", type: "CHECKBOX", value: "true" },
            { label: "Inativo", variableKey: "inativo", type: "CHECKBOX", value: "false" },
            { label: "Nulo", variableKey: "nulo", type: "CHECKBOX", value: null },
            {
              label: "Nascimento",
              variableKey: "nascimento",
              type: "DATE",
              mask: '{"date":{"variant":"date"}}',
              value: "2026-09-17T00:00:00.000Z",
            },
            {
              label: "Último acesso",
              variableKey: "ultimo_acesso",
              type: "DATE",
              mask: '{"date":{"variant":"datetime"}}',
              value: "2026-09-17T15:05:00.000Z",
            },
            {
              label: "Interesses",
              variableKey: "interesses",
              type: "LIST",
              mask: '{"list":{"variant":"multi"}}',
              value: '["Suporte","Vendas"]',
            },
            {
              label: "Vazia",
              variableKey: "vazia",
              type: "LIST",
              mask: '{"list":{"variant":"multi"}}',
              value: "[]",
            },
          ],
        },
      ),
    ).toBe("Sim|Não||17/09/2026|17/09/2026 12:05|- Suporte\n- Vendas|");
  });

  it("preserves aliases, technical fields and unknown variables", () => {
    expect(
      resolveMessageTemplate("{{cliente}} / {{empresa}} / {{cpf}} / {{desconhecida}}", {
        customer: "Empresa Exemplo",
        customFields: { cpf: "123" },
      }),
    ).toBe("Empresa Exemplo / Empresa Exemplo / 123 / {{desconhecida}}");
  });

  it("does not let a configurable field overwrite a native variable", () => {
    expect(
      resolveMessageTemplate("{{nome}} / {{contato}}", {
        contactName: "Ana",
        customFields: { nome: "indevido", contato: "indevido" },
      }),
    ).toBe("Ana / Ana");
  });

  it("keeps legacy label-derived aliases for persisted templates", () => {
    expect(
      resolveMessageTemplate("{{codigo_cliente}} / {{codigo_do_cliente}}", {
        customFieldValues: [
          {
            label: "Código do cliente",
            variableKey: "codigo_cliente",
            type: "TEXT",
            value: "TRX-42",
          },
        ],
      }),
    ).toBe("TRX-42 / TRX-42");
  });

  it("always gives persisted technical keys precedence over legacy aliases", () => {
    const fields = [
      { label: "Outro", variableKey: "codigo_cliente", value: "OFICIAL" },
      { label: "Código do cliente", variableKey: "codigo_cliente_2", value: "LEGADO" },
    ];
    expect(resolveMessageTemplate("{{codigo_cliente}}", { customFieldValues: fields })).toBe(
      "OFICIAL",
    );
    expect(
      resolveMessageTemplate("{{codigo_cliente}}", { customFieldValues: [...fields].reverse() }),
    ).toBe("OFICIAL");
  });

  it("does not format unrelated typed fields", () => {
    expect(
      resolveMessageTemplate("texto literal", {
        timezone: "Invalid/Timezone",
        customFieldValues: [
          {
            label: "Instante",
            variableKey: "instante",
            type: "date",
            mask: '{"date":{"variant":"datetime"}}',
            value: "2026-09-17T15:05:00Z",
          },
        ],
      }),
    ).toBe("texto literal");
  });
});
