import { describe, expect, it } from "vitest";
import { isPermissionKey, PERMISSIONS } from "./permissions.constants";

describe("granular permission catalog", () => {
  it("accepts the dashboard and contact permissions sent by the access profile editor", () => {
    expect(isPermissionKey("dashboard.read")).toBe(true);
    expect(isPermissionKey("chat.contacts.create")).toBe(true);
    expect(PERMISSIONS).toContain("dashboard.read");
    expect(PERMISSIONS).toContain("chat.contacts.create");
  });
});
