import { describe, expect, it } from "vitest";
import { resolveMessageTemplate } from "./message-template";

describe("resolveMessageTemplate", () => {
  it("resolves fixed and additional contact field variables", () => {
    expect(
      resolveMessageTemplate("{{cumprimento}}, {{nome}}. CPF: {{cpf}}", {
        contactName: "Douglas",
        customFields: { CPF: "123.456.789-00" },
        now: new Date("2026-09-17T19:00:00"),
      }),
    ).toBe("Boa noite, Douglas. CPF: 123.456.789-00");
  });
});
