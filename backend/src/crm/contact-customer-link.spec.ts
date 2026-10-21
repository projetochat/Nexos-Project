import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CrmController } from "./crm.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-a",
  roleKey: "agent",
  platformRole: "USER",
  permissions: ["contacts.create", "contacts.update"],
} satisfies AuthenticatedUser;

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-a",
    tenantId: "tenant-a",
    customerId: "customer-old",
    departmentId: null,
    contactDepartmentId: null,
    contactProfileId: null,
    name: "Nome preservado",
    phone: "+5562981147652",
    normalizedPhone: "5562981147652",
    email: "preservado@example.com",
    avatarUrl: null,
    departmentName: null,
    companyRole: null,
    instance: null,
    instanceIds: [],
    customerBranchId: null,
    customerDepartmentId: null,
    customerAccessProfile: null,
    active: true,
    portalMembershipId: null,
    portalAccessActive: false,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    customer: null,
    customerBranch: null,
    customerDepartment: null,
    contactDepartment: null,
    contactProfile: null,
    customFieldValues: [],
    tags: [],
    ...overrides,
  };
}

function controllerWith(prisma: Record<string, unknown>) {
  const realtime = { publishContactUpdated: vi.fn() };
  const entitlements = {
    assertTenantOperational: vi.fn(),
    assertWithinLimit: vi.fn(),
  };
  return {
    controller: new CrmController(
      prisma as never,
      realtime as never,
      entitlements as never,
      {} as never,
      {} as never,
      {} as never,
    ),
    realtime,
    entitlements,
  };
}

describe("vínculo de contato existente ao cliente", () => {
  it("exige confirmação antes de transferir um contato vinculado a outro cliente", async () => {
    const existing = contact({
      customer: { id: "customer-old", name: "Cliente atual", color: "#111111" },
    });
    const updateMany = vi.fn();
    const prisma = {
      customer: {
        findFirst: vi.fn().mockResolvedValue({ id: "customer-new", name: "Novo cliente" }),
      },
      contact: { findFirst: vi.fn().mockResolvedValue(existing), updateMany },
    };
    const { controller } = controllerWith(prisma);

    await expect(
      controller.createContact(
        {
          name: "Nome preservado",
          phone: "+5562981147652",
          customerId: "customer-new",
          linkExistingToCustomer: true,
        },
        current,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "CONTACT_CUSTOMER_TRANSFER_REQUIRED",
        details: {
          contact: { id: "contact-a", name: "Nome preservado" },
          currentCustomer: { id: "customer-old", name: "Cliente atual" },
          targetCustomer: { id: "customer-new", name: "Novo cliente" },
        },
      },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("preserva os dados globais e transfere somente após confirmação válida", async () => {
    const existing = contact();
    const updated = contact({
      customerId: "customer-new",
      customerAccessProfile: "COLLABORATOR",
      active: false,
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirstOrThrow = vi.fn().mockResolvedValue(updated);
    const create = vi.fn();
    const count = vi.fn();
    const prisma = {
      customer: { findFirst: vi.fn().mockResolvedValue({ id: "customer-new" }) },
      contact: {
        findFirst: vi.fn().mockResolvedValue(existing),
        findFirstOrThrow,
        updateMany,
        create,
        count,
      },
    };
    const { controller, realtime, entitlements } = controllerWith(prisma);

    const result = await controller.createContact(
      {
        name: "Nome que não deve substituir",
        phone: "+5562981147652",
        email: "novo@example.com",
        customerId: "customer-new",
        customerAccessProfile: "COLLABORATOR",
        active: false,
        linkExistingToCustomer: true,
        confirmCustomerTransfer: true,
        expectedCustomerId: "customer-old",
      },
      current,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "contact-a",
        tenantId: "tenant-a",
        archivedAt: null,
        customerId: "customer-old",
      },
      data: {
        customerId: "customer-new",
        customerBranchId: null,
        customerDepartmentId: null,
        customerAccessProfile: "COLLABORATOR",
        active: false,
      },
    });
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty("name");
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty("email");
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty("phone");
    expect(findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "contact-a", tenantId: "tenant-a", archivedAt: null },
      include: expect.any(Object),
    });
    expect(create).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
    expect(entitlements.assertWithinLimit).not.toHaveBeenCalled();
    expect(realtime.publishContactUpdated).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      contactId: "contact-a",
    });
    expect(result).toMatchObject({ lifecycle: "linked", active: false });
  });

  it("recusa uma confirmação feita para um vínculo anterior", async () => {
    const updateMany = vi.fn();
    const prisma = {
      customer: {
        findFirst: vi.fn().mockResolvedValue({ id: "customer-new", name: "Novo cliente" }),
      },
      contact: {
        findFirst: vi.fn().mockResolvedValue(
          contact({
            customerId: "customer-third",
            customer: { id: "customer-third", name: "Terceiro cliente", color: "#222222" },
          }),
        ),
        updateMany,
      },
    };
    const { controller } = controllerWith(prisma);

    await expect(
      controller.createContact(
        {
          name: "Contato",
          phone: "+5562981147652",
          customerId: "customer-new",
          linkExistingToCustomer: true,
          confirmCustomerTransfer: true,
          expectedCustomerId: "customer-old",
        },
        current,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "CONTACT_CUSTOMER_TRANSFER_REQUIRED",
        details: expect.objectContaining({
          currentCustomer: { id: "customer-third", name: "Terceiro cliente" },
        }),
      }),
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("detecta alteração concorrente antes de gravar a transferência", async () => {
    const prisma = {
      customer: { findFirst: vi.fn().mockResolvedValue({ id: "customer-new" }) },
      contact: {
        findFirst: vi.fn().mockResolvedValue(contact()),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirstOrThrow: vi.fn(),
      },
    };
    const { controller } = controllerWith(prisma);

    await expect(
      controller.createContact(
        {
          name: "Contato",
          phone: "+5562981147652",
          customerId: "customer-new",
          linkExistingToCustomer: true,
          confirmCustomerTransfer: true,
          expectedCustomerId: "customer-old",
        },
        current,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CONTACT_CUSTOMER_LINK_CHANGED" }),
    });
    expect(prisma.contact.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("mantém o conflito anterior quando o modo de vínculo não é solicitado", async () => {
    const prisma = {
      customer: { findFirst: vi.fn() },
      contact: {
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue(contact()),
        updateMany: vi.fn(),
      },
    };
    const { controller } = controllerWith(prisma);

    await expect(
      controller.createContact({ name: "Contato", phone: "+5562981147652" }, current),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CONTACT_ALREADY_EXISTS" }),
    });
    expect(prisma.contact.updateMany).not.toHaveBeenCalled();
  });
});
