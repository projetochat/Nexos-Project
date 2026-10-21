import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CrmController } from "./crm.controller";
import type { AuthenticatedUser } from "../auth/auth.types";

const cityMask = JSON.stringify({ custom: { format: "city" } });
const cityId = "550e8400-e29b-41d4-a716-446655440000";

function harness(resolveCity = vi.fn(async () => ({ cityId }))) {
  const upsert = vi.fn();
  const transaction = {
    contactCustomField: {
      findMany: vi.fn(async () => [
        {
          id: "field-city",
          tenantId: "tenant-a",
          label: "Cidade preferida",
          type: "TEXT",
          required: false,
          mask: cityMask,
          options: [],
        },
      ]),
    },
    contactCustomFieldValue: { upsert },
  };
  const controller = new CrmController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { resolveCity } as never,
  );
  const save = (
    controller as unknown as {
      saveProvidedContactCustomFields: (
        tx: unknown,
        tenantId: string,
        contactId: string,
        values: Record<string, string>,
      ) => Promise<void>;
    }
  ).saveProvidedContactCustomFields.bind(controller);
  return { save, transaction, upsert, resolveCity };
}

describe("city custom contact field persistence", () => {
  it("recognizes the Cidade format in the existing TEXT plus mask contract", async () => {
    const create = vi.fn(async ({ data }) => ({
      id: "field-city",
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      ...data,
    }));
    const controller = new CrmController(
      {
        contactCustomField: {
          findFirst: vi.fn(async () => null),
          create,
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { resolveCity: vi.fn() } as never,
    );

    await controller.createContactCustomField(
      { label: "Município de nascimento", type: "text", mask: cityMask },
      { tenantId: "tenant-a", permissions: ["contacts.create"] } as AuthenticatedUser,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "TEXT", mask: cityMask }),
      }),
    );
  });

  it("validates the central city and persists only its identifier", async () => {
    const { save, transaction, upsert, resolveCity } = harness();

    await save(transaction, "tenant-a", "contact-a", { "field-city": cityId });

    expect(resolveCity).toHaveBeenCalledWith(cityId);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ value: cityId }),
        update: { value: cityId },
      }),
    );
  });

  it("does not persist an unknown or inactive city", async () => {
    const resolveCity = vi.fn(async () => {
      throw new BadRequestException("A cidade selecionada não está disponível.");
    });
    const { save, transaction, upsert } = harness(resolveCity);

    await expect(
      save(transaction, "tenant-a", "contact-a", { "field-city": cityId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });
});
