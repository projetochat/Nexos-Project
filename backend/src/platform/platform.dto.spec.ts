import "reflect-metadata";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreatePlatformClientDto } from "./platform.dto";

function clientDto(status: "ACTIVE" | "PROSPECTING", document?: string) {
  return Object.assign(new CreatePlatformClientDto(), {
    name: "Cliente",
    document,
    responsibleName: "Responsável",
    responsibleEmail: "responsavel@example.com",
    city: "Goiânia",
    state: "GO",
    status,
  });
}

describe("CreatePlatformClientDto", () => {
  it("accepts a prospecting client without a CNPJ", async () => {
    await expect(validate(clientDto("PROSPECTING"))).resolves.toHaveLength(0);
  });

  it("accepts a prospecting client without responsible contact data", async () => {
    const prospect = clientDto("PROSPECTING");
    prospect.responsibleName = undefined;
    prospect.responsibleEmail = undefined;

    await expect(validate(prospect)).resolves.toHaveLength(0);
  });

  it("validates the responsible e-mail when a prospect provides one", async () => {
    const prospect = clientDto("PROSPECTING");
    prospect.responsibleEmail = "invalido";

    const errors = await validate(prospect);

    expect(errors.some((error) => error.property === "responsibleEmail")).toBe(true);
  });

  it("requires a valid CNPJ outside prospecting", async () => {
    const missing = await validate(clientDto("ACTIVE"));
    const invalid = await validate(clientDto("ACTIVE", "123"));
    expect(missing.some((error) => error.property === "document")).toBe(true);
    expect(invalid.some((error) => error.property === "document")).toBe(true);
  });

  it("requires responsible contact data outside prospecting", async () => {
    const active = clientDto("ACTIVE", "00000000000000");
    active.responsibleName = undefined;
    active.responsibleEmail = undefined;

    const errors = await validate(active);

    expect(errors.some((error) => error.property === "responsibleName")).toBe(true);
    expect(errors.some((error) => error.property === "responsibleEmail")).toBe(true);
  });
});
