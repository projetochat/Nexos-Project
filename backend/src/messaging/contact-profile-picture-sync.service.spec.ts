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
      number: "+5562981147652",
    });
    expect(evolution.fetchProfilePictureUrl).toHaveBeenNthCalledWith(2, {
      instanceName: "SMCLICK",
      number: "5562981147652@s.whatsapp.net",
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
    });
    expect(synced.get("contact-a")).toBe("https://whatsapp.test/douglas.jpg");
  });

  it("fetches group pictures by JID and skips contacts that already have photos", async () => {
    const prisma = prismaMock();
    const evolution = {
      fetchProfilePictureUrl: vi.fn().mockResolvedValue("https://image.test/group.jpg"),
    };
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

    expect(evolution.fetchProfilePictureUrl).toHaveBeenCalledOnce();
    expect(evolution.fetchProfilePictureUrl).toHaveBeenCalledWith({
      instanceName: "SMCLICK",
      number: "120@g.us",
    });
    expect(prisma.contact.updateMany).toHaveBeenCalledOnce();
    expect(prisma.contact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "group-a" }),
        data: { avatarUrl: "https://image.test/group.jpg" },
      }),
    );
    expect(realtime.publishContactUpdated).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      contactId: "group-a",
    });
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

  it("refreshes an existing direct-contact picture in the background", async () => {
    vi.useFakeTimers();
    try {
      const prisma = prismaMock();
      const evolution = {
        fetchProfilePictureUrl: vi.fn().mockResolvedValue("https://whatsapp.test/current.jpg"),
      };
      const realtime = { publishContactUpdated: vi.fn() };
      const service = new ContactProfilePictureSyncService(
        prisma as never,
        evolution as never,
        realtime as never,
      );

      service.enqueueMissing({
        tenantId: "tenant-a",
        contacts: [
          contact({
            id: "contact-a",
            avatarUrl: "https://whatsapp.test/stale.jpg",
            instance: "SMCLICK",
          }),
        ],
      });

      await vi.advanceTimersByTimeAsync(250);

      expect(evolution.fetchProfilePictureUrl).toHaveBeenCalled();
      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: {
          id: "contact-a",
          tenantId: "tenant-a",
          OR: [
            { avatarUrl: null },
            { avatarUrl: "" },
            { avatarUrl: { not: "https://whatsapp.test/current.jpg" } },
          ],
        },
        data: { avatarUrl: "https://whatsapp.test/current.jpg" },
      });
      expect(realtime.publishContactUpdated).toHaveBeenCalledWith({
        tenantId: "tenant-a",
        contactId: "contact-a",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("prioritizes the conversation remote JID over phone heuristics", async () => {
    const prisma = prismaMock();
    const evolution = {
      fetchProfilePictureUrl: vi.fn().mockResolvedValue("https://whatsapp.test/current.jpg"),
    };
    const realtime = { publishContactUpdated: vi.fn() };
    const service = new ContactProfilePictureSyncService(
      prisma as never,
      evolution as never,
      realtime as never,
    );

    await service.syncMissing({
      tenantId: "tenant-a",
      contacts: [contact({ remoteJid: "5562981147652@s.whatsapp.net" })],
    });

    expect(evolution.fetchProfilePictureUrl).toHaveBeenCalledOnce();
    expect(evolution.fetchProfilePictureUrl).toHaveBeenCalledWith({
      instanceName: "SMCLICK",
      number: "5562981147652@s.whatsapp.net",
    });
  });

  it("preserves manual data URL pictures during background refresh", async () => {
    vi.useFakeTimers();
    try {
      const prisma = prismaMock();
      const evolution = { fetchProfilePictureUrl: vi.fn() };
      const realtime = { publishContactUpdated: vi.fn() };
      const service = new ContactProfilePictureSyncService(
        prisma as never,
        evolution as never,
        realtime as never,
      );

      service.enqueueMissing({
        tenantId: "tenant-a",
        contacts: [contact({ avatarUrl: "data:image/png;base64,manual" })],
      });
      await vi.advanceTimersByTimeAsync(250);

      expect(evolution.fetchProfilePictureUrl).not.toHaveBeenCalled();
      expect(prisma.contact.updateMany).not.toHaveBeenCalled();
      expect(realtime.publishContactUpdated).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not publish when the provider returns the picture already stored", async () => {
    vi.useFakeTimers();
    try {
      const prisma = prismaMock();
      prisma.contact.updateMany.mockResolvedValueOnce({ count: 0 });
      const evolution = {
        fetchProfilePictureUrl: vi.fn().mockResolvedValue("https://whatsapp.test/current.jpg"),
      };
      const realtime = { publishContactUpdated: vi.fn() };
      const service = new ContactProfilePictureSyncService(
        prisma as never,
        evolution as never,
        realtime as never,
      );

      service.enqueueMissing({
        tenantId: "tenant-a",
        contacts: [contact({ avatarUrl: "https://whatsapp.test/current.jpg" })],
      });
      await vi.advanceTimersByTimeAsync(250);

      expect(prisma.contact.updateMany).toHaveBeenCalled();
      expect(realtime.publishContactUpdated).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("repairs a phone placeholder name from the provider directory", async () => {
    vi.useFakeTimers();
    try {
      const prisma = prismaMock();
      const evolution = {
        findContacts: vi.fn().mockResolvedValue([
          {
            remoteJid: "5562981147652@s.whatsapp.net",
            name: "5562981147652",
            pushName: "Douglas Rezende",
          },
        ]),
      };
      const realtime = { publishContactUpdated: vi.fn() };
      const service = new ContactProfilePictureSyncService(
        prisma as never,
        evolution as never,
        realtime as never,
      );

      service.enqueuePlaceholderNames({
        tenantId: "tenant-a",
        contacts: [
          contact({
            name: "556281147652",
            phone: "+556281147652",
            normalizedPhone: "+556281147652",
          }),
        ],
      });
      await vi.advanceTimersByTimeAsync(250);

      expect(evolution.findContacts).toHaveBeenCalledOnce();
      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { id: "contact-a", tenantId: "tenant-a", name: "556281147652" },
        data: { name: "Douglas Rezende" },
      });
      expect(realtime.publishContactUpdated).toHaveBeenCalledWith({
        tenantId: "tenant-a",
        contactId: "contact-a",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not replace a manually assigned contact name", async () => {
    vi.useFakeTimers();
    try {
      const prisma = prismaMock();
      const evolution = { findContacts: vi.fn() };
      const realtime = { publishContactUpdated: vi.fn() };
      const service = new ContactProfilePictureSyncService(
        prisma as never,
        evolution as never,
        realtime as never,
      );

      service.enqueuePlaceholderNames({
        tenantId: "tenant-a",
        contacts: [contact({ name: "Nome escolhido pela equipe" })],
      });
      await vi.advanceTimersByTimeAsync(250);

      expect(evolution.findContacts).not.toHaveBeenCalled();
      expect(prisma.contact.updateMany).not.toHaveBeenCalled();
      expect(realtime.publishContactUpdated).not.toHaveBeenCalled();
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

function contact(
  overrides: Partial<Omit<ReturnType<typeof baseContact>, "avatarUrl">> & {
    avatarUrl?: string | null;
  } = {},
) {
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
    remoteJid: null,
    instance: "SMCLICK",
    instanceIds: [],
  };
}
