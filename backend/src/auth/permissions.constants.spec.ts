import { describe, expect, it } from "vitest";
import { isPermissionKey, PERMISSIONS } from "./permissions.constants";

describe("granular permission catalog", () => {
  it("accepts the CRUD catalog and rejects superseded aliases", () => {
    expect(isPermissionKey("dashboard.read")).toBe(true);
    expect(isPermissionKey("contacts.create")).toBe(true);
    expect(PERMISSIONS).toContain("dashboard.read");
    expect(PERMISSIONS).toContain("contacts.create");
    expect(PERMISSIONS).toContain("contacts.additional_fields.read");
    expect(PERMISSIONS).toContain("tickets.create");
    expect(PERMISSIONS).toContain("groups.leave");
    expect(PERMISSIONS).not.toContain("chat.contacts.create");
    expect(PERMISSIONS).not.toContain("chat.contacts.edit");
    expect(PERMISSIONS).not.toContain("chat.audio.send");
    expect(PERMISSIONS).not.toContain("chat.tickets.create");
    expect(PERMISSIONS).not.toContain("chat.contacts.read");
    expect(PERMISSIONS).not.toContain("chat.contacts.block");
    expect(PERMISSIONS).not.toContain("chat.customer_link.edit");
    expect(PERMISSIONS).not.toContain("conversations.manage");
    expect(PERMISSIONS).not.toContain("chat.tags.use");
    expect(isPermissionKey("users.create")).toBe(true);
    expect(isPermissionKey("users.update")).toBe(true);
    expect(isPermissionKey("users.manage")).toBe(false);
    expect(isPermissionKey("campaigns.schedule")).toBe(false);
    expect(isPermissionKey("tickets.assign")).toBe(false);
  });
});
