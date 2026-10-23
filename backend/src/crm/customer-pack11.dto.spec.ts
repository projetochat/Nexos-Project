import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CustomerBranchDto, CustomerDepartmentDto } from "./dto/customer-structure.dto";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";

describe("PACK 11 customer contracts", () => {
  it("accepts the defined customer type, status and address fields", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      name: "Cliente Exemplo",
      personType: "LEGAL",
      status: "PROSPECT",
      document: "12.345.678/0001-90",
      addressFullEnabled: true,
      postalCode: "74000-000",
      street: "Rua Um",
      addressNumber: "10",
      city: "Goiânia",
      state: "GO",
      country: "Brasil",
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects undefined customer statuses and incomplete branches", async () => {
    const filter = plainToInstance(ListCustomersQueryDto, { status: "UNKNOWN" });
    const branch = plainToInstance(CustomerBranchDto, { name: "Matriz" });

    expect(await validate(filter)).not.toHaveLength(0);
    expect(await validate(branch)).not.toHaveLength(0);
  });

  it.each([undefined, null, "", "   "])("rejects a branch without a valid city: %s", async (city) => {
    const branch = plainToInstance(CustomerBranchDto, {
      name: "Matriz",
      city,
      state: "GO",
      status: "ACTIVE",
    });

    expect(await validate(branch)).not.toHaveLength(0);
  });

  it("accepts a branch with city and state", async () => {
    const branch = plainToInstance(CustomerBranchDto, {
      name: "Matriz",
      city: "Goiânia",
      state: "GO",
      status: "ACTIVE",
    });

    expect(await validate(branch)).toHaveLength(0);
  });

  it("accepts a customer department with an assigned manager", async () => {
    const dto = plainToInstance(CustomerDepartmentDto, {
      name: "Financeiro",
      managerContactId: "123e4567-e89b-12d3-a456-426614174000",
      active: true,
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});
