import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const policies = [
  "../campaigns/campaigns.service.ts",
  "../tickets/tickets.service.ts",
  "../departments/departments.controller.ts",
  "../crm/crm.controller.ts",
  "../conversations/conversation-purge.service.ts",
  "../automations/automations.controller.ts",
  "../crm/tags.controller.ts",
  "../quick-replies/quick-replies.controller.ts",
  "../roles/roles.controller.ts",
  "../schedules/schedules.module.ts",
];

describe("physical deletion confirmation policy", () => {
  it("uses a single standard confirmation action outside messaging instance removal", () => {
    for (const relativePath of policies) {
      const source = readFileSync(resolve(__dirname, relativePath), "utf8");
      expect(source).not.toContain('level: "high"');
    }

    const combined = policies
      .map((relativePath) => readFileSync(resolve(__dirname, relativePath), "utf8"))
      .join("\n");
    const confirmationLabels = [...combined.matchAll(/confirmLabel: "([^"]+)"/g)].map(
      ([, label]) => label,
    );
    expect(confirmationLabels).toHaveLength(11);
    expect(new Set(confirmationLabels)).toEqual(new Set(["Confirmar", "Excluir"]));
  });

  it("keeps reinforced messaging instance removal in frontend and backend", () => {
    const frontend = readFileSync(resolve(__dirname, "../../../src/routes/instancias.tsx"), "utf8");
    const backend = readFileSync(
      resolve(__dirname, "../messaging/messaging-connections.controller.ts"),
      "utf8",
    );

    expect(frontend).toContain('confirmation !== "REMOVER"');
    expect(backend).toContain('dto?.confirmation !== "REMOVER"');
  });
});
