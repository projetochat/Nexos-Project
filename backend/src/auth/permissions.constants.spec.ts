import { describe, expect, it } from "vitest";
import { isPermissionKey, PERMISSIONS } from "./permissions.constants";

describe("granular permission catalog", () => {
  it("accepts the CRUD catalog and rejects superseded aliases", () => {
    expect(isPermissionKey("dashboard.read")).toBe(true);
    expect(isPermissionKey("chat.contacts.create")).toBe(true);
    expect(PERMISSIONS).toContain("dashboard.read");
    expect(PERMISSIONS).toContain("chat.contacts.create");
    expect(PERMISSIONS).toContain("contacts.additional_fields.read");
    expect(PERMISSIONS).toContain("chat.tickets.create");
    expect(isPermissionKey("users.create")).toBe(true);
    expect(isPermissionKey("users.update")).toBe(true);
    expect(isPermissionKey("users.manage")).toBe(false);
    expect(isPermissionKey("campaigns.schedule")).toBe(false);
    expect(isPermissionKey("tickets.assign")).toBe(false);
  });
});
