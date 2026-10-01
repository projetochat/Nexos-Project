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

  it("requires a valid CNPJ outside prospecting", async () => {
    const missing = await validate(clientDto("ACTIVE"));
    const invalid = await validate(clientDto("ACTIVE", "123"));
    expect(missing.some((error) => error.property === "document")).toBe(true);
    expect(invalid.some((error) => error.property === "document")).toBe(true);
  });
});
