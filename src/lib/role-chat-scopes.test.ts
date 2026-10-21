import { describe, expect, it } from "vitest";
import { reconcileRoleChatScopes } from "./role-chat-scopes";

describe("reconcileRoleChatScopes", () => {
  it("removes stale hidden departments before a role is saved", () => {
    expect(
      reconcileRoleChatScopes(
        [
          {
            connectionId: "connection-a",
            departmentIds: ["department-a", "stale-department"],
            favoriteDepartmentId: "stale-department",
          },
        ],
        [{ id: "connection-a", departments: [{ id: "department-a" }] }],
      ),
    ).toEqual([
      {
        connectionId: "connection-a",
        departmentIds: ["department-a"],
        favoriteDepartmentId: null,
      },
    ]);
  });

  it("removes scopes whose instance or departments are no longer available", () => {
    expect(
      reconcileRoleChatScopes(
        [
          {
            connectionId: "removed-connection",
            departmentIds: ["department-a"],
            favoriteDepartmentId: null,
          },
          {
            connectionId: "connection-a",
            departmentIds: ["removed-department"],
            favoriteDepartmentId: null,
          },
        ],
        [{ id: "connection-a", departments: [{ id: "department-a" }] }],
      ),
    ).toEqual([]);
  });
});
