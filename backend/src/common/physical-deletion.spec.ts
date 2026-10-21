import { describe, expect, it, vi } from "vitest";
import { CrmController } from "../crm/crm.controller";
import { TagsController } from "../crm/tags.controller";
import { QuickRepliesController } from "../quick-replies/quick-replies.controller";
import { RolesController } from "../roles/roles.controller";

const current = { tenantId: "tenant-a" } as never;

function transactional<T extends object>(tx: T) {
  return {
    ...tx,
    $transaction: vi.fn((callback: (client: T) => unknown) => callback(tx)),
  };
}

describe("physical deletion previews and commits", () => {
  it("blocks role deletion while attendants still require the role", async () => {
    const db = {
      role: {
        findFirst: vi.fn().mockResolvedValue({
          id: "role-a",
          key: "custom",
          name: "Supervisor",
          updatedAt: new Date("2026-10-08T12:00:00Z"),
          permissions: [],
        }),
      },
      tenantMembership: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "membership-a",
            presentationName: "Ana",
            user: { name: "Ana", email: "ana@example.test" },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      userInvitation: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const controller = new RolesController(db as never, {} as never);

    const impact = await controller.deletionPreview("role-a", current);

    expect(impact.blockedReason).toContain("possui atendentes vinculados");
    expect(impact.dependencies[0]).toMatchObject({ count: 1, operation: "unlink" });
  });

  it("deletes role invitations and the role in one transaction when no attendant is linked", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      role: {
        findFirst: vi.fn().mockResolvedValue({
          id: "role-a",
          key: "custom",
          name: "Supervisor",
          updatedAt: new Date("2026-10-08T12:00:00Z"),
          permissions: [],
        }),
        delete: vi.fn(),
      },
      tenantMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      userInvitation: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "invite-a", email: "ana@example.test", status: "PENDING" }]),
        count: vi.fn().mockResolvedValue(1),
        deleteMany: vi.fn(),
      },
    };
    const prisma = transactional(tx);
    const controller = new RolesController(prisma as never, {} as never);
    const impact = await controller.deletionPreview("role-a", current);

    await expect(
      controller.remove("role-a", { snapshotToken: impact.snapshotToken }, current),
    ).resolves.toEqual({
      status: "deleted",
    });
    expect(tx.userInvitation.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", roleId: "role-a" },
    });
    expect(tx.role.delete).toHaveBeenCalledWith({ where: { id: "role-a" } });
  });

  it("unlinks a tag from contacts and campaign audiences before physically deleting it", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      tag: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tag-a",
          name: "VIP",
          updatedAt: new Date("2026-10-08T12:00:00Z"),
        }),
        delete: vi.fn(),
      },
      contactTag: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { contactId: "contact-a", contact: { name: "Ana", phone: "+5511999999999" } },
          ]),
        deleteMany: vi.fn(),
      },
      campaign: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "campaign-a",
              name: "Campanha",
              status: "DRAFT",
              updatedAt: new Date("2026-10-08T12:00:00Z"),
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "campaign-a",
              name: "Campanha",
              status: "DRAFT",
              updatedAt: new Date("2026-10-08T12:00:00Z"),
            },
          ])
          .mockResolvedValueOnce([{ id: "campaign-a", audienceTagIds: ["tag-a", "tag-b"] }]),
        update: vi.fn(),
      },
    };
    const prisma = transactional(tx);
    const controller = new TagsController(prisma as never, {} as never);
    const impact = await controller.deletionPreview("tag-a", current);

    await controller.archive("tag-a", { snapshotToken: impact.snapshotToken }, current);

    expect(tx.contactTag.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", tagId: "tag-a" },
    });
    expect(tx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { audienceTagIds: ["tag-b"] } }),
    );
    expect(tx.tag.delete).toHaveBeenCalled();
  });

  it("physically deletes a quick reply so its shortcut can be reused", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      quickReply: {
        findFirst: vi.fn().mockResolvedValue({
          id: "reply-a",
          title: "Olá",
          shortcut: "oi",
          updatedAt: new Date("2026-10-08T12:00:00Z"),
          attachmentFileName: null,
        }),
        delete: vi.fn(),
      },
    };
    const prisma = transactional(tx);
    const controller = new QuickRepliesController(prisma as never);
    const impact = await controller.deletionPreview("reply-a", current);

    await controller.archive("reply-a", { snapshotToken: impact.snapshotToken }, current);

    expect(tx.quickReply.delete).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: "tenant-a", id: "reply-a" } },
    });
  });

  it("returns the refreshed impact without deleting when the snapshot is stale", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      quickReply: {
        findFirst: vi.fn().mockResolvedValue({
          id: "reply-a",
          title: "Olá atualizado",
          shortcut: "oi",
          updatedAt: new Date("2026-10-08T13:00:00Z"),
          attachmentFileName: null,
        }),
        delete: vi.fn(),
      },
    };
    const controller = new QuickRepliesController(transactional(tx) as never);

    const result = await controller.archive("reply-a", { snapshotToken: "0".repeat(64) }, current);

    expect(result.status).toBe("changed");
    expect(tx.quickReply.delete).not.toHaveBeenCalled();
  });

  it("blocks a custom field used in text templates and exposes every reference", async () => {
    const token = "{{codigo_cliente}}";
    const db = {
      contactCustomField: {
        findFirst: vi.fn().mockResolvedValue({
          id: "field-a",
          label: "Código",
          variableKey: "codigo_cliente",
          updatedAt: new Date("2026-10-08T12:00:00Z"),
        }),
      },
      contactCustomFieldValue: { findMany: vi.fn().mockResolvedValue([]) },
      quickReply: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "reply-a",
            title: "Consulta",
            content: token,
            messages: null,
            updatedAt: new Date(),
          },
        ]),
      },
      campaign: { findMany: vi.fn().mockResolvedValue([]) },
      automationRule: { findMany: vi.fn().mockResolvedValue([]) },
      schedule: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const controller = new CrmController(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const impact = await controller.customFieldDeletionPreview("field-a", current);

    expect(impact.blockedReason).toContain("conteúdos ativos");
    expect(impact.dependencies[1]).toMatchObject({ count: 1 });
  });

  it("deletes custom field values and the field atomically when there are no text references", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      contactCustomField: {
        findFirst: vi.fn().mockResolvedValue({
          id: "field-a",
          label: "Código",
          variableKey: "codigo_cliente",
          updatedAt: new Date("2026-10-08T12:00:00Z"),
        }),
        delete: vi.fn(),
      },
      contactCustomFieldValue: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      quickReply: { findMany: vi.fn().mockResolvedValue([]) },
      campaign: { findMany: vi.fn().mockResolvedValue([]) },
      automationRule: { findMany: vi.fn().mockResolvedValue([]) },
      schedule: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = transactional(tx);
    const controller = new CrmController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const impact = await controller.customFieldDeletionPreview("field-a", current);

    await controller.deleteContactCustomField(
      "field-a",
      { snapshotToken: impact.snapshotToken },
      current,
    );

    expect(tx.contactCustomFieldValue.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", fieldId: "field-a" },
    });
    expect(tx.contactCustomField.delete).toHaveBeenCalledWith({ where: { id: "field-a" } });
  });
});
