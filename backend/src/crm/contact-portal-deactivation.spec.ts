import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CrmController } from "./crm.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "agent-membership",
  roleId: "role-agent",
  roleKey: "agent",
  platformRole: "USER",
  permissions: ["contacts.update"],
} satisfies AuthenticatedUser;

function contact(active: boolean) {
  return {
    id: "contact-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    departmentId: null,
    contactDepartmentId: null,
    contactProfileId: null,
    name: "Clara",
    phone: "+5562981147652",
    normalizedPhone: "5562981147652",
    email: "clara@example.test",
    avatarUrl: null,
    departmentName: null,
    companyRole: null,
    instance: null,
    instanceIds: [],
    customerBranchId: null,
    customerDepartmentId: null,
    customerAccessProfile: "COLLABORATOR",
    active,
    portalMembershipId: "portal-membership",
    portalAccessActive: active,
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
  };
}

function setup(initialActive: boolean) {
  const updated = contact(!initialActive);
  const prisma = {
    contact: {
      findFirst: vi.fn().mockResolvedValue(contact(initialActive)),
      update: vi.fn().mockResolvedValue(updated),
    },
    userInvitation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tenantMembership: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    authSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const realtime = { publishContactUpdated: vi.fn() };
  const controller = new CrmController(
    prisma as never,
    realtime as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { controller, prisma };
}

describe("portal de contato inativo", () => {
  it("revoga convites, membership e sessões na mesma transação ao desativar", async () => {
    const { controller, prisma } = setup(true);

    await controller.updateContact("contact-a", { active: false }, current);

    expect(prisma.userInvitation.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", contactId: "contact-a", status: "PENDING" },
      data: { status: "REVOKED", revokedAt: expect.any(Date) },
    });
    expect(prisma.tenantMembership.updateMany).toHaveBeenCalledWith({
      where: {
        id: "portal-membership",
        tenantId: "tenant-a",
        role: { key: "customer_portal" },
      },
      data: { status: "DISABLED" },
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        membershipId: "portal-membership",
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: false, portalAccessActive: false }),
      }),
    );
  });

  it("reativa o cadastro sem religar membership, sessão ou acesso ao portal", async () => {
    const { controller, prisma } = setup(false);

    await controller.updateContact("contact-a", { active: true }, current);

    expect(prisma.userInvitation.updateMany).not.toHaveBeenCalled();
    expect(prisma.tenantMembership.updateMany).not.toHaveBeenCalled();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: true, portalAccessActive: undefined }),
      }),
    );
  });
});
