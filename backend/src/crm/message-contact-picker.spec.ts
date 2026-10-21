import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS_KEY } from "../auth/permissions.decorator";
import { CrmController } from "./crm.controller";

describe("message contact picker", () => {
  it("is authorized by messages.send without requiring contacts.read", () => {
    const handler = Object.getOwnPropertyDescriptor(
      CrmController.prototype,
      "listContactsForMessagePicker",
    )?.value;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["messages.send"]);
  });

  it("returns only the fields required to build contact cards", async () => {
    const prisma = {
      contact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "contact-a",
            name: "Contato A",
            phone: "62999999999",
            normalizedPhone: "5562999999999",
            avatarUrl: null,
            instance: "connection-a",
            instanceIds: ["connection-a"],
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      messagingConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-a",
          name: "Comercial",
          ownerPhoneNormalized: "5562988888888",
        }),
      },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const controller = new CrmController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listContactsForMessagePicker(
      { page: 1, pageSize: 25, priorityInstance: "connection-a" },
      { tenantId: "tenant-a" } as never,
    );

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-a", archivedAt: null, active: true }),
        select: {
          id: true,
          name: true,
          phone: true,
          normalizedPhone: true,
          avatarUrl: true,
          instance: true,
          instanceIds: true,
        },
      }),
    );
    expect(result.items).toEqual([
      {
        id: "contact-a",
        nome: "Contato A",
        telefone: "62999999999",
        normalizedPhone: "5562999999999",
        avatar_url: null,
        active: true,
        instancia: "connection-a",
        instanceIds: ["connection-a"],
      },
    ]);
    expect(result.items[0]).not.toHaveProperty("email");
    expect(result.items[0]).not.toHaveProperty("customer");
    expect(result.items[0]).not.toHaveProperty("tags");
  });
});
