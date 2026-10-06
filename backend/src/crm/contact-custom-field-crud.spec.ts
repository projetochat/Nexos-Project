import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CrmController } from "./crm.controller";

const current = (tenantId: string) =>
  ({
    tenantId,
    permissions: ["contacts.create", "contacts.update"],
  }) as unknown as AuthenticatedUser;

function controllerWith(prisma: unknown) {
  return new CrmController(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

function createdField(data: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...data,
  };
}

describe("contact custom field identity at CRUD boundaries", () => {
  it("allows the same normalized name in different tenants", async () => {
    const create = vi.fn(async ({ data }) => createdField(data));
    const prisma = {
      contactCustomField: {
        findFirst: vi.fn(async ({ where }) => (where.OR ? null : null)),
        create,
      },
    };
    const controller = controllerWith(prisma);

    await controller.createContactCustomField({ label: "Código", type: "text" }, current("a"));
    await controller.createContactCustomField({ label: "Código", type: "text" }, current("b"));

    expect(create.mock.calls.map(([call]) => call.data.tenantId)).toEqual(["a", "b"]);
    expect(create.mock.calls.map(([call]) => call.data.variableKey)).toEqual(["codigo", "codigo"]);
  });

  it("blocks a native variable name before writing", async () => {
    const create = vi.fn();
    const controller = controllerWith({ contactCustomField: { findFirst: vi.fn(), create } });

    await expect(
      controller.createContactCustomField({ label: "NOME", type: "text" }, current("a")),
    ).rejects.toMatchObject({
      response: {
        code: "CONTACT_CUSTOM_FIELD_ALREADY_EXISTS",
        message: "Já existe um campo com este nome. Informe um nome diferente.",
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("blocks a translated native field name independently from its technical key", async () => {
    const create = vi.fn();
    const controller = controllerWith({ contactCustomField: { findFirst: vi.fn(), create } });

    await expect(
      controller.createContactCustomField({ label: "E-mail", type: "text" }, current("a")),
    ).rejects.toMatchObject({
      response: {
        code: "CONTACT_CUSTOM_FIELD_ALREADY_EXISTS",
        message: "Já existe um campo com este nome. Informe um nome diferente.",
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("blocks an archived identity instead of releasing or deleting it", async () => {
    const controller = controllerWith({
      contactCustomField: {
        findFirst: vi.fn(async ({ where }) => (where.OR ? { id: "archived-field" } : null)),
        create: vi.fn(),
      },
    });

    await expect(
      controller.createContactCustomField({ label: "Documento", type: "text" }, current("a")),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps a concurrent unique-index race to the form conflict contract", async () => {
    const create = vi
      .fn()
      .mockImplementationOnce(async ({ data }) => createdField(data))
      .mockRejectedValueOnce({ code: "P2002" });
    const controller = controllerWith({
      contactCustomField: {
        findFirst: vi.fn(async () => null),
        create,
      },
    });

    const results = await Promise.allSettled([
      controller.createContactCustomField({ label: "Documento", type: "text" }, current("a")),
      controller.createContactCustomField({ label: "Documento", type: "text" }, current("a")),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: {
        response: {
          code: "CONTACT_CUSTOM_FIELD_ALREADY_EXISTS",
          message: "Já existe um campo com este nome. Informe um nome diferente.",
        },
      },
    });
  });

  it("normalizes an edited label without changing its persisted technical key", async () => {
    const existing = createdField({
      tenantId: "a",
      label: "Código",
      normalizedName: "código",
      variableKey: "codigo",
      type: "TEXT",
      required: false,
      mask: null,
      note: null,
      tabName: "Dados Adicionais",
      groupName: "",
      options: [],
      position: 0,
    });
    const update = vi.fn(async ({ data }) => ({
      ...existing,
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
    }));
    const findFirst = vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
    const controller = controllerWith({ contactCustomField: { findFirst, update } });

    const result = await controller.updateContactCustomField(
      existing.id,
      { label: "  Código   interno  ", type: "text" },
      current("a"),
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          label: "Código interno",
          normalizedName: "código interno",
          variableKey: undefined,
        }),
      }),
    );
    expect(result.variableKey).toBe("codigo");
  });
});
