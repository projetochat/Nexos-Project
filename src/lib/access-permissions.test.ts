import { describe, expect, it } from "vitest";
import { effectiveSessionPermissions } from "@/lib/access-permissions";

describe("effectiveSessionPermissions", () => {
  it("honors the backend-filtered administrator catalog", () => {
    const permissions = effectiveSessionPermissions("admin", ["conversations.read"]);

    expect(permissions).toEqual(["conversations.read"]);
  });

  it("does not elevate a regular user", () => {
    expect(effectiveSessionPermissions("operator", ["conversations.read"])).toEqual([
      "conversations.read",
    ]);
  });
});
