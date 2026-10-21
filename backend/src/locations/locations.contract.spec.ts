import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateCustomerDto } from "../crm/dto/create-customer.dto";
import { CreatePlatformClientDto } from "../platform/platform.dto";

const validCityId = "550e8400-e29b-41d4-a716-446655440000";

describe("international locations contract", () => {
  it("accepts a Platform client with cityId and derives the legacy address server-side", async () => {
    const dto = plainToInstance(CreatePlatformClientDto, {
      cityId: validCityId,
      name: "Cliente",
      document: "12345678000199",
      responsibleName: "Responsável",
      responsibleEmail: "responsavel@example.com",
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("keeps legacy city and state mandatory when Platform does not send cityId", async () => {
    const dto = plainToInstance(CreatePlatformClientDto, {
      name: "Cliente",
      document: "12345678000199",
      responsibleName: "Responsável",
      responsibleEmail: "responsavel@example.com",
    });
    const fields = (await validate(dto)).map((error) => error.property);
    expect(fields).toEqual(expect.arrayContaining(["city", "state"]));
  });

  it("validates cityId format in the tenant customer contract", async () => {
    const dto = plainToInstance(CreateCustomerDto, { name: "Cliente", cityId: "not-a-uuid" });
    expect((await validate(dto)).map((error) => error.property)).toContain("cityId");
  });

  it("uses an additive non-destructive migration", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20261021203000_international_locations/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "countries"');
    expect(sql).toContain('ADD COLUMN "city_id" TEXT');
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
  });
});
