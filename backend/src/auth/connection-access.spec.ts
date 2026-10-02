import { describe, expect, it } from "vitest";
import {
  connectionAccess,
  connectionIdAccess,
  departmentAccess,
  departmentIdAccess,
  conversationChatScopeAccess,
  roleChatDepartmentIds,
  roleChatScopes,
  roleConnectionIds,
} from "./connection-access";

describe("instance access", () => {
  it("limits custom profiles to their selected instances even with all chat permissions", () => {
    const connectionIds = roleConnectionIds({
      key: "custom",
      metadata: { connectionIds: ["vocical", "vocical", 1] },
    });
    expect(connectionIds).toEqual(["vocical"]);
    expect(connectionAccess({ roleKey: "custom", connectionIds })).toEqual({
      connectionId: { in: ["vocical"] },
    });
    expect(connectionIdAccess({ roleKey: "custom", connectionIds })).toEqual({
      id: { in: ["vocical"] },
    });
  });
  it("denies access when a non-administrator has no configured instances", () => {
    expect(roleConnectionIds({ key: "agent", metadata: {} })).toEqual([]);
    expect(connectionAccess({ roleKey: "agent" })).toEqual({ connectionId: { in: [] } });
  });
  it("keeps the tenant administrator unrestricted within their tenant", () => {
    expect(roleConnectionIds({ key: "tenant_admin" })).toBeNull();
    expect(connectionAccess({ roleKey: "tenant_admin" })).toEqual({});
  });

  it("limits Chat conversations and options to the profile departments", () => {
    const chatDepartmentIds = roleChatDepartmentIds({
      key: "custom",
      metadata: { departmentIds: ["department-a", "department-a", 1] },
    });
    expect(chatDepartmentIds).toEqual(["department-a"]);
    expect(departmentAccess({ roleKey: "custom", chatDepartmentIds })).toEqual({
      departmentId: { in: ["department-a"] },
    });
    expect(departmentIdAccess({ roleKey: "custom", chatDepartmentIds })).toEqual({
      id: { in: ["department-a"] },
    });
  });

  it("fails closed when a non-administrator has no Chat department scope", () => {
    expect(departmentAccess({ roleKey: "custom" })).toEqual({ departmentId: { in: [] } });
    expect(departmentIdAccess({ roleKey: "custom" })).toEqual({ id: { in: [] } });
  });

  it("keeps departments paired with their own instance and favorite", () => {
    const chatScopes = roleChatScopes({
      key: "agent",
      metadata: {
        chatScopes: [
          {
            connectionId: "connection-a",
            departmentIds: ["department-a"],
            favoriteDepartmentId: "department-a",
          },
          {
            connectionId: "connection-b",
            departmentIds: ["department-b"],
            favoriteDepartmentId: null,
          },
        ],
      },
    });

    expect(chatScopes).toEqual([
      {
        connectionId: "connection-a",
        departmentIds: ["department-a"],
        favoriteDepartmentId: "department-a",
      },
      {
        connectionId: "connection-b",
        departmentIds: ["department-b"],
        favoriteDepartmentId: null,
      },
    ]);
    expect(conversationChatScopeAccess({ roleKey: "agent", chatScopes })).toEqual({
      OR: [
        {
          connectionId: { in: ["connection-a"] },
          OR: [{ departmentId: { in: ["department-a"] } }, { departmentId: null }],
        },
        {
          connectionId: { in: ["connection-b"] },
          OR: [{ departmentId: { in: ["department-b"] } }, { departmentId: null }],
        },
      ],
    });
  });
});
