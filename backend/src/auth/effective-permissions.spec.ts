import { describe, expect, it } from "vitest";
import { effectivePermissions, moduleAwarePermissions } from "./effective-permissions";
import { TENANT_ADMIN_PERMISSIONS } from "./permissions.constants";

describe("effectivePermissions", () => {
  it("grants the complete catalog to the protected tenant administrator", () => {
    expect(effectivePermissions({ key: "tenant_admin", permissions: [] })).toEqual(
      TENANT_ADMIN_PERMISSIONS,
    );
  });

  it("uses only known permissions assigned to regular roles", () => {
    expect(
      effectivePermissions({
        key: "custom",
        permissions: [
          { permissionId: "contacts.read" },
          { permissionId: "contacts.read" },
          { permissionId: "unknown.permission" },
        ],
      }),
    ).toEqual(["contacts.read"]);
  });

  it("grants zero effective permissions while a profile is inactive", () => {
    expect(
      effectivePermissions({
        key: "custom",
        active: false,
        permissions: [{ permissionId: "contacts.read" }],
      }),
    ).toEqual([]);
    expect(effectivePermissions({ key: "tenant_admin", active: false, permissions: [] })).toEqual(
      [],
    );
  });

  it("removes disabled optional modules from the administrator catalog", async () => {
    const permissions = await moduleAwarePermissions(
      {
        tenantSubscription: {
          findFirst: async () => ({
            featuresSnapshot: { chat: true, campaigns: true, tickets: true },
          }),
        },
      },
      "tenant-a",
      { campaigns: false, tickets: false },
      { key: "tenant_admin", permissions: [] },
    );

    expect(permissions).toContain("conversations.read");
    expect(permissions.some((permission) => permission.startsWith("campaigns."))).toBe(false);
    expect(permissions.some((permission) => permission.startsWith("tickets."))).toBe(false);
  });
});

it.each(["tenant_admin", "custom"])(
  "suspends Chat grants for %s without removing shared modules or saved grants",
  async (key) => {
    const role = {
      key,
      permissions: [
        { permissionId: "conversations.read" },
        { permissionId: "messages.send" },
        { permissionId: "contacts.read" },
        { permissionId: "tickets.read" },
        { permissionId: "ai_agents.read" },
        { permissionId: "connections.read" },
      ],
    };
    const before = JSON.stringify(role);
    const prisma = {
      tenantSubscription: {
        findFirst: async () => ({
          featuresSnapshot: { chat: true, campaigns: false, tickets: true },
        }),
      },
    };
    const disabled = await moduleAwarePermissions(prisma, "tenant-a", { chat: false }, role);
    expect(disabled).toContain("contacts.read");
    expect(disabled).toContain("tickets.read");
    expect(disabled).toContain("ai_agents.read");
    expect(disabled).not.toContain("conversations.read");
    expect(disabled).not.toContain("messages.send");
    expect(disabled).not.toContain("connections.read");
    const enabled = await moduleAwarePermissions(prisma, "tenant-a", { chat: true }, role);
    expect(enabled).toContain("conversations.read");
    expect(enabled).toContain("messages.send");
    expect(JSON.stringify(role)).toBe(before);
  },
);
it("honors plan Chat false and keeps messaging connections available for Campaigns", async () => {
  const prisma = {
    tenantSubscription: {
      findFirst: async () => ({
        featuresSnapshot: { chat: false, campaigns: true, tickets: true },
      }),
    },
  };
  const result = await moduleAwarePermissions(
    prisma,
    "tenant-a",
    {},
    { key: "tenant_admin", permissions: [] },
  );
  expect(result).toContain("connections.read");
  expect(result).toContain("campaigns.create");
  expect(result).toContain("tickets.read");
  expect(result).not.toContain("conversations.read");
  expect(result).not.toContain("groups.read");
  expect(result).not.toContain("schedules.create");
});
