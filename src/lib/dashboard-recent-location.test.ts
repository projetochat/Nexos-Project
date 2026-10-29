import { describe, expect, it, vi } from "vitest";
import {
  dashboardInboxLocate,
  recentConversationDestination,
  resolveRecentConversationDestination,
} from "./dashboard-recent-location";
import type { ApiConversationStatus } from "./trixus-api";

describe("Dashboard recent conversation destination", () => {
  it.each<[ApiConversationStatus, boolean, string]>([
    ["em_andamento", false, "ativas"],
    ["aguardando", false, "standby"],
    ["aberta", false, "fila"],
    ["aberta", true, "leads"],
  ])("locates %s lead=%s in %s", (status, is_lead, tab) => {
    expect(
      recentConversationDestination({ id: "synthetic-conversation", status, is_lead }),
    ).toEqual({
      to: "/inbox/$conversationId",
      params: { conversationId: "synthetic-conversation" },
      search: { locate: tab },
    });
  });
  it("opens closed conversations in History without an Inbox marker", () => {
    expect(
      recentConversationDestination({ id: "closed", status: "fechada", is_lead: false }),
    ).toEqual({ to: "/historico", search: { conversationId: "closed" } });
  });
  it("rechecks the latest status using only a detail read", async () => {
    const load = vi.fn(async (id: string) => ({ id, status: "fechada" as const, is_lead: false }));
    expect(
      await resolveRecentConversationDestination(
        { id: "changed", status: "aberta", is_lead: false },
        load,
      ),
    ).toEqual({ to: "/historico", search: { conversationId: "changed" } });
    expect(load).toHaveBeenCalledExactlyOnceWith("changed");
  });
  it("preserves the cached History destination if detail access is denied", async () => {
    const load = vi.fn(async () => {
      throw new Error("403");
    });
    expect(
      await resolveRecentConversationDestination(
        { id: "closed", status: "fechada", is_lead: false },
        load,
      ),
    ).toEqual({ to: "/historico", search: { conversationId: "closed" } });
  });
  it("ignores mismatched detail identities and validates only explicit known locate tabs", async () => {
    expect(
      (
        await resolveRecentConversationDestination(
          { id: "original", status: "aberta", is_lead: false },
          async () => ({ id: "other", status: "fechada", is_lead: false }),
        )
      ).to,
    ).toBe("/inbox/$conversationId");
    for (const value of [undefined, null, "", true, "unknown", ["ativas"]])
      expect(dashboardInboxLocate(value)).toBeUndefined();
    expect(dashboardInboxLocate("standby")).toBe("standby");
  });
});
