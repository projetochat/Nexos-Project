import { describe, expect, it, vi } from "vitest";
import { CrmController } from "./crm.controller";
import { canReadContactAdditionalFields } from "../auth/contact-additional-fields-access";

describe("contact additional fields access", () => {
  const controller = new CrmController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    serializeContact(
      contact: unknown,
      meta: { additionalFieldsViewer: { roleKey: string; permissions: string[] } },
    ): Record<string, unknown>;
  };

  const contact = {
    id: "contact-a",
    tenantId: "tenant-a",
    name: "Contato",
    phone: "+5511999999999",
    normalizedPhone: "+5511999999999",
    avatarUrl: null,
    customerId: null,
    email: null,
    departmentName: null,
    departmentId: null,
    contactDepartmentId: null,
    contactDepartment: null,
    contactProfileId: null,
    contactProfile: null,
    companyRole: null,
    instance: null,
    instanceIds: [],
    customer: null,
    tags: [],
    customFieldValues: [
      {
        tenantId: "tenant-a",
        fieldId: "field-a",
        value: "segredo",
        field: {
          tenantId: "tenant-a",
          label: "Código",
          variableKey: "codigo",
          type: "TEXT",
          mask: null,
        },
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("omits values without the specific permission", () => {
    const result = controller.serializeContact(contact, {
      additionalFieldsViewer: { roleKey: "agent", permissions: ["contacts.read"] },
    });
    expect(result).not.toHaveProperty("customFields");
    expect(result).not.toHaveProperty("customFieldValues");
    expect(JSON.stringify(result)).not.toContain("codigo");
    expect(JSON.stringify(result)).not.toContain("segredo");
  });

  it("returns values only with the specific permission", () => {
    expect(
      canReadContactAdditionalFields({
        roleKey: "agent",
        permissions: ["contacts.additional_fields.read"],
      }),
    ).toBe(true);
    expect(canReadContactAdditionalFields({ roleKey: "tenant_admin", permissions: [] })).toBe(
      false,
    );
    expect(canReadContactAdditionalFields({ roleKey: "agent", permissions: [] })).toBe(false);
    expect(
      controller.serializeContact(contact, {
        additionalFieldsViewer: {
          roleKey: "agent",
          permissions: ["contacts.additional_fields.read"],
        },
      }),
    ).toMatchObject({
      customFields: { "field-a": "segredo" },
      customFieldValues: [
        expect.objectContaining({ fieldId: "field-a", variableKey: "codigo", value: "segredo" }),
      ],
    });
  });

  it("keeps values from another tenant hidden even for an authorized user", () => {
    const foreignValue = {
      ...contact,
      customFieldValues: [
        { ...contact.customFieldValues[0], tenantId: "tenant-b" },
        {
          ...contact.customFieldValues[0],
          fieldId: "field-b",
          field: { ...contact.customFieldValues[0].field, tenantId: "tenant-b" },
        },
      ],
    };

    const serialized = controller.serializeContact(foreignValue, {
      additionalFieldsViewer: {
        roleKey: "tenant_admin",
        permissions: ["contacts.additional_fields.read"],
      },
    });
    expect(serialized).toMatchObject({ customFields: {}, customFieldValues: [] });
  });

  it("returns only the values that belong to each authorized tenant", () => {
    const tenantBContact = {
      ...contact,
      id: "contact-b",
      tenantId: "tenant-b",
      customFieldValues: [
        {
          ...contact.customFieldValues[0],
          tenantId: "tenant-b",
          fieldId: "field-b",
          value: "tenant-b-value",
          field: {
            ...contact.customFieldValues[0].field,
            tenantId: "tenant-b",
            variableKey: "codigo_b",
          },
        },
      ],
    };

    expect(
      controller.serializeContact(contact, {
        additionalFieldsViewer: {
          roleKey: "tenant_admin",
          permissions: ["contacts.additional_fields.read"],
        },
      }),
    ).toMatchObject({
      customFields: { "field-a": "segredo" },
    });
    expect(
      controller.serializeContact(tenantBContact, {
        additionalFieldsViewer: {
          roleKey: "agent",
          permissions: ["contacts.additional_fields.read"],
        },
      }),
    ).toMatchObject({ customFields: { "field-b": "tenant-b-value" } });
  });

  it("does not return archived definitions or their values", () => {
    const archived = {
      ...contact,
      customFieldValues: [
        {
          ...contact.customFieldValues[0],
          field: { ...contact.customFieldValues[0].field, archivedAt: new Date() },
        },
      ],
    };
    const serialized = controller.serializeContact(archived, {
      additionalFieldsViewer: {
        roleKey: "tenant_admin",
        permissions: ["contacts.additional_fields.read"],
      },
    });
    expect(serialized).toMatchObject({ customFields: {}, customFieldValues: [] });
    expect(JSON.stringify(serialized)).not.toContain("codigo");
    expect(JSON.stringify(serialized)).not.toContain("segredo");
  });

  it("applies the same policy to contact list and detail endpoints", async () => {
    const prisma = {
      contact: {
        findMany: vi.fn().mockResolvedValue([contact]),
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue(contact),
      },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const endpoints = new CrmController(
      prisma as never,
      {} as never,
      {} as never,
      { enqueueMissing: vi.fn() } as never,
      {} as never,
    );
    const contactReader = {
      tenantId: "tenant-a",
      roleKey: "agent",
      permissions: ["contacts.read"],
    } as never;
    const additionalFieldReader = {
      tenantId: "tenant-a",
      roleKey: "agent",
      permissions: ["contacts.read", "contacts.additional_fields.read"],
    } as never;

    const listed = await endpoints.listContacts({} as never, contactReader);
    expect(listed.items[0]).not.toHaveProperty("customFields");
    expect(listed.items[0]).not.toHaveProperty("customFieldValues");
    expect(JSON.stringify(listed)).not.toContain("codigo");
    expect(JSON.stringify(listed)).not.toContain("segredo");

    const detailed = await endpoints.findContact("contact-a", additionalFieldReader);
    expect(detailed.customFieldValues).toEqual([
      expect.objectContaining({ variableKey: "codigo", value: "segredo" }),
    ]);
  });

  it.each([
    "listContactCustomFields",
    "createContactCustomField",
    "reorderContactCustomFields",
    "updateContactCustomField",
    "deleteContactCustomField",
  ] as const)(
    "requires the specific read permission before returning definitions from %s",
    (method) => {
      expect(Reflect.getMetadata("permissions", CrmController.prototype[method])).toContain(
        "contacts.additional_fields.read",
      );
    },
  );
});
