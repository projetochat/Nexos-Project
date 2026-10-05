import { describe, expect, it } from "vitest";
import { resolveMessageTemplate } from "./message-template";

describe("resolveMessageTemplate", () => {
  it("keeps cliente and empresa as aliases for the registered company", () => {
    expect(
      resolveMessageTemplate("{{cliente}} / {{empresa}}", { customer: "Empresa Exemplo" }),
    ).toBe("Empresa Exemplo / Empresa Exemplo");
  });

  it("resolves fixed and additional contact field variables", () => {
    expect(
      resolveMessageTemplate("{{cumprimento}}, {{nome}} da {{cliente}}. CPF: {{cpf}}", {
        contactName: "Douglas",
        customer: "Empresa Exemplo",
        customFields: { CPF: "123.456.789-00" },
        now: new Date("2026-09-17T22:00:00.000Z"),
      }),
    ).toBe("Boa noite, Douglas da Empresa Exemplo. CPF: 123.456.789-00");
  });

  it("resolves the greeting in the configured timezone at every boundary", () => {
    expect(
      resolveMessageTemplate("{{cumprimento}}", {
        now: new Date("2026-09-17T14:59:00.000Z"),
        timezone: "America/Sao_Paulo",
      }),
    ).toBe("Bom dia");
    expect(
      resolveMessageTemplate("{{cumprimento}}", {
        now: new Date("2026-09-17T15:00:00.000Z"),
        timezone: "America/Sao_Paulo",
      }),
    ).toBe("Boa tarde");
    expect(
      resolveMessageTemplate("{{cumprimento}}", {
        now: new Date("2026-09-17T21:00:00.000Z"),
        timezone: "America/Sao_Paulo",
      }),
    ).toBe("Boa noite");
  });

  it("falls back to America/Sao_Paulo when the timezone is absent or invalid", () => {
    const now = new Date("2026-09-17T14:00:00.000Z");
    expect(resolveMessageTemplate("{{cumprimento}}", { now })).toBe("Bom dia");
    expect(resolveMessageTemplate("{{cumprimento}}", { now, timezone: "Invalid/Timezone" })).toBe(
      "Bom dia",
    );
  });
});
