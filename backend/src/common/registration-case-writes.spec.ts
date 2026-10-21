import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("registration uppercase write integration", () => {
  it.each([
    ["contacts", "../crm/crm.controller.ts"],
    ["contactCompanies", "../crm/crm.controller.ts"],
    ["contactDepartments", "../crm/crm.controller.ts"],
    ["contactProfiles", "../crm/crm.controller.ts"],
    ["attendants", "../users/users.controller.ts"],
    ["accessProfiles", "../roles/roles.controller.ts"],
    ["departments", "../departments/departments.controller.ts"],
    ["tags", "../crm/tags.controller.ts"],
    ["automations", "../automations/automations.controller.ts"],
    ["ticketTitles", "../tickets/tickets.service.ts"],
  ])("applies %s before writes", (key, file) => {
    const fileSource = source(file);
    expect(fileSource).toContain("normalizeRegistrationText");
    expect(fileSource).toContain(`"${key}"`);
  });

  it("keeps attendant display names tenant-scoped under D-004", () => {
    const users = source("../users/users.controller.ts");
    expect(users).toContain("presentationName,");
    expect(users).toContain("presentationName: await normalizeRegistrationText(");
    expect(users).not.toContain("data: { name: await normalizeRegistrationText(");
  });

  it("does not invent persistence for bot flows or AI agents", () => {
    const schema = source("../../prisma/schema.prisma");
    expect(schema).not.toMatch(/model (BotFlow|AiAgent|AIAgent)/);
  });
});
