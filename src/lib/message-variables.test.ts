import { describe, expect, it } from "vitest";
import {
  isNativeContactFieldName,
  normalizeCustomFieldName,
  previewCustomFieldVariableKey,
  resolveMessageVariables,
} from "./message-variables";

describe("chat message variable preview", () => {
  it("normalizes case, spacing and canonically equivalent Unicode", () => {
    expect(normalizeCustomFieldName("  Código   DO Cliente  ")).toBe(
      normalizeCustomFieldName("Código do cliente"),
    );
    expect(previewCustomFieldVariableKey("  Código   do Cliente  ")).toBe("codigo_cliente");
    expect(isNativeContactFieldName("  E-MAIL ")).toBe(true);
  });

  it.each([
    ["2026-09-17T03:00:00Z", "Bom dia"],
    ["2026-09-17T14:59:00Z", "Bom dia"],
    ["2026-09-17T15:00:00Z", "Boa tarde"],
    ["2026-09-17T20:59:00Z", "Boa tarde"],
    ["2026-09-17T21:00:00Z", "Boa noite"],
    ["2026-09-18T02:59:00Z", "Boa noite"],
  ])("uses the instance time zone at %s", (iso, expected) => {
    expect(
      resolveMessageVariables("{{saudacao}}", {
        now: new Date(iso),
        timezone: "America/Sao_Paulo",
      }),
    ).toBe(expected);
  });

  it("supports the legacy alias and isolates two instances", () => {
    const now = new Date("2026-09-17T15:30:00Z");
    expect(resolveMessageVariables("{{cumprimento}}", { now, timezone: "America/Sao_Paulo" })).toBe(
      "Boa tarde",
    );
    expect(resolveMessageVariables("{{saudacao}}", { now, timezone: "Pacific/Honolulu" })).toBe(
      "Bom dia",
    );
  });

  it("formats persisted typed values and keeps unknown tokens", () => {
    expect(
      resolveMessageVariables(
        "{{sim}}|{{nao}}|{{nulo}}|{{data}}|{{instante}}|{{lista}}|{{vazia}}|{{desconhecida}}",
        {
          timezone: "America/Sao_Paulo",
          customFieldValues: [
            { label: "Sim", variableKey: "sim", type: "checkbox", value: "true" },
            { label: "Não", variableKey: "nao", type: "checkbox", value: "false" },
            { label: "Nulo", variableKey: "nulo", type: "checkbox", value: null },
            {
              label: "Data",
              variableKey: "data",
              type: "date",
              mask: '{"date":{"variant":"date"}}',
              value: "2026-09-17T00:00:00Z",
            },
            {
              label: "Instante",
              variableKey: "instante",
              type: "date",
              mask: '{"date":{"variant":"datetime"}}',
              value: "2026-09-17T15:05:00Z",
            },
            {
              label: "Lista",
              variableKey: "lista",
              type: "list",
              mask: '{"list":{"variant":"multi"}}',
              value: '["A","B"]',
            },
            {
              label: "Vazia",
              variableKey: "vazia",
              type: "list",
              mask: '{"list":{"variant":"multi"}}',
              value: "[]",
            },
          ],
        },
      ),
    ).toBe("Sim|Não||17/09/2026|17/09/2026 12:05|- A\n- B||{{desconhecida}}");
  });

  it("does not silently use the browser zone", () => {
    const now = new Date("2026-09-17T15:00:00Z");
    expect(() => resolveMessageVariables("{{saudacao}}", { now })).toThrow("Time zone");
    expect(() =>
      resolveMessageVariables("{{saudacao}}", { now, timezone: "Invalid/Timezone" }),
    ).toThrow("Time zone");
  });

  it("keeps established aliases and resolves configurable fields by technical key", () => {
    expect(
      resolveMessageVariables("{{contato}} / {{cliente}} / {{empresa}} / {{codigo_cliente}}", {
        contactName: "Ana",
        customer: "Empresa",
        customFields: { codigo_cliente: "42" },
      }),
    ).toBe("Ana / Empresa / Empresa / 42");
  });

  it("does not let configurable fields overwrite native variables", () => {
    expect(
      resolveMessageVariables("{{nome}} / {{contato}}", {
        contactName: "Ana",
        customFields: { nome: "indevido", contato: "indevido" },
      }),
    ).toBe("Ana / Ana");
  });

  it("keeps legacy label-derived aliases for persisted templates", () => {
    expect(
      resolveMessageVariables("{{codigo_cliente}} / {{codigo_do_cliente}}", {
        customFieldValues: [
          {
            label: "Código do cliente",
            variableKey: "codigo_cliente",
            type: "text",
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
    expect(resolveMessageVariables("{{codigo_cliente}}", { customFieldValues: fields })).toBe(
      "OFICIAL",
    );
    expect(
      resolveMessageVariables("{{codigo_cliente}}", { customFieldValues: [...fields].reverse() }),
    ).toBe("OFICIAL");
  });

  it("does not format unrelated typed fields", () => {
    expect(
      resolveMessageVariables("texto literal", {
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
