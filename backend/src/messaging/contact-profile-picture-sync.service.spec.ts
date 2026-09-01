import { describe, expect, it, vi } from "vitest";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { ContactProfilePictureSyncService } from "./contact-profile-picture-sync.service";

describe("ContactProfilePictureSyncService", () => {
  it("fills missing WhatsApp profile pictures for existing contacts", async () => {
    const prisma = prismaMock();
    const evolution = {
      fetchProfilePictureUrl: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("https://whatsapp.test/douglas.jpg"),
    };
    const realtime = { publishContactUpdated: vi.fn() };
    const service = new ContactProfilePictureSyncService(
      prisma as never,
      evolution as never,
      realtime as never,
    );

    const synced = await service.syncMissing({
      tenantId: "tenant-a",
      contacts: [
        contact({
          id: "contact-a",
          phone: "(62) 8114-7652",
          normalizedPhone: "+556281147652",
          instance: "SMCLICK",
        }),
      ],
    });

    expect(evolution.fetchProfilePictureUrl).toHaveBeenNthCalledWith(1, {
      instanceName: "SMCLICK",
      number: "+556281147652",
    });
    expect(evolution.fetchProfilePictureUrl).toHaveBeenNthCalledWith(2, {
      instanceName: "SMCLICK",
      number: "556281147652@s.whatsapp.net",
    });
    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: {
        id: "contact-a",
        tenantId: "tenant-a",
        OR: [{ avatarUrl: null }, { avatarUrl: "" }],
      },
      data: { avatarUrl: "https://whatsapp.test/douglas.jpg" },
    });
    expect(realtime.publishContactUpdated).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      contactId: "contact-a",
      contact: { id: "contact-a", avatar_url: "https://whatsapp.test/douglas.jpg" },
    });
    expect(synced.get("contact-a")).toBe("https://whatsapp.test/douglas.jpg");
  });

  it("does not fetch profile pictures for groups or contacts that already have photos", async () => {
    const prisma = prismaMock();
    const evolution = { fetchProfilePictureUrl: vi.fn() };
    const realtime = { publishContactUpdated: vi.fn() };
    const service = new ContactProfilePictureSyncService(
      prisma as never,
      evolution as never,
      realtime as never,
    );

    await service.syncMissing({
      tenantId: "tenant-a",
      contacts: [
        contact({ id: "group-a", normalizedPhone: "group:120@g.us", phone: "120@g.us" }),
        contact({ id: "contact-b", avatarUrl: "https://image.test/avatar.jpg" }),
      ],
    });

    expect(evolution.fetchProfilePictureUrl).not.toHaveBeenCalled();
    expect(prisma.contact.updateMany).not.toHaveBeenCalled();
    expect(realtime.publishContactUpdated).not.toHaveBeenCalled();
  });

  it("queues profile picture lookups without blocking the caller", async () => {
    vi.useFakeTimers();
    try {
      const prisma = prismaMock();
      const evolution = {
        fetchProfilePictureUrl: vi.fn().mockResolvedValue("https://whatsapp.test/douglas.jpg"),
      };
      const realtime = { publishContactUpdated: vi.fn() };
      const service = new ContactProfilePictureSyncService(
        prisma as never,
        evolution as never,
        realtime as never,
      );

      service.enqueueMissing({
        tenantId: "tenant-a",
        contacts: [contact({ id: "contact-a", instance: "SMCLICK" })],
      });

      expect(evolution.fetchProfilePictureUrl).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(250);

      expect(evolution.fetchProfilePictureUrl).toHaveBeenCalled();
      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { avatarUrl: "https://whatsapp.test/douglas.jpg" },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

function prismaMock() {
  return {
    messagingConnection: {
      findFirst: vi.fn().mockResolvedValue({
        externalReference: "SMCLICK",
      }),
    },
    contact: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function contact(overrides: Partial<ReturnType<typeof baseContact>> = {}) {
  return { ...baseContact(), ...overrides };
}

function baseContact() {
  return {
    id: "contact-a",
    tenantId: "tenant-a",
    name: "Douglas Rezende",
    phone: "+556281147652",
    normalizedPhone: "+556281147652",
    avatarUrl: null,
    instance: "SMCLICK",
    instanceIds: [],
  };
}
