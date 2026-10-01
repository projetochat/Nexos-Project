import { describe, expect, it } from "vitest";
import { CrmController } from "./crm.controller";

describe("contact additional fields access", () => {
  const controller = new CrmController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    canReadAdditionalFields(current: unknown): boolean;
    serializeContact(
      contact: unknown,
      meta: { includeAdditionalFields: boolean },
    ): {
      customFields: Record<string, unknown>;
      customFieldValues: unknown[];
    };
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
        fieldId: "field-a",
        value: "segredo",
        field: { label: "Código", type: "TEXT" },
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("omits values without the specific permission", () => {
    const allowed = controller.canReadAdditionalFields({ roleKey: "agent", permissions: [] });
    expect(
      controller.serializeContact(contact, { includeAdditionalFields: allowed }),
    ).toMatchObject({ customFields: {}, customFieldValues: [] });
  });

  it("returns values with the specific permission and for the administrator", () => {
    expect(
      controller.canReadAdditionalFields({
        roleKey: "custom",
        permissions: ["contacts.additional_fields.read"],
      }),
    ).toBe(true);
    expect(controller.canReadAdditionalFields({ roleKey: "tenant_admin", permissions: [] })).toBe(
      true,
    );
    expect(controller.serializeContact(contact, { includeAdditionalFields: true })).toMatchObject({
      customFields: { "field-a": "segredo" },
    });
  });
});
