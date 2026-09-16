import { describe, expect, it } from "vitest";
import { connectionAccess, connectionIdAccess, roleConnectionIds } from "./connection-access";

describe("instance access", () => {
  it("limits custom profiles to their selected instances even with all chat permissions", () => {
    const connectionIds = roleConnectionIds({ key: "custom", metadata: { connectionIds: ["vocical", "vocical", 1] } });
    expect(connectionIds).toEqual(["vocical"]);
    expect(connectionAccess({ roleKey: "custom", connectionIds })).toEqual({ connectionId: { in: ["vocical"] } });
    expect(connectionIdAccess({ roleKey: "custom", connectionIds })).toEqual({ id: { in: ["vocical"] } });
  });
  it("denies access when a non-administrator has no configured instances", () => {
    expect(roleConnectionIds({ key: "agent", metadata: {} })).toEqual([]);
    expect(connectionAccess({ roleKey: "agent" })).toEqual({ connectionId: { in: [] } });
  });
  it("keeps the tenant administrator unrestricted within their tenant", () => {
    expect(roleConnectionIds({ key: "tenant_admin" })).toBeNull();
    expect(connectionAccess({ roleKey: "tenant_admin" })).toEqual({});
  });
});
