import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  clearStaleConversationAuthorizationCache,
  conversationAuthorizationScope,
} from "./conversation-query-authorization";

const user = (tenantId: string, id: string, canReadAdditionalFields: boolean) => ({
  id,
  nome: id,
  email: `${id}@trixus.test`,
  role: "operator" as const,
  empresaId: tenantId,
  permissions: canReadAdditionalFields ? ["contacts.additional_fields.read"] : [],
});

describe("conversation authorization cache", () => {
  it("separates queries by tenant, user and additional-fields permission", () => {
    expect(conversationAuthorizationScope(user("tenant-a", "user-a", true))).not.toBe(
      conversationAuthorizationScope(user("tenant-a", "user-a", false)),
    );
    expect(conversationAuthorizationScope(user("tenant-a", "user-a", true))).not.toBe(
      conversationAuthorizationScope(user("tenant-b", "user-a", true)),
    );
    expect(conversationAuthorizationScope(user("tenant-a", "user-a", true))).not.toBe(
      conversationAuthorizationScope(user("tenant-a", "user-b", true)),
    );
  });

  it("removes authorized and indirect cached values after permission loss", async () => {
    const client = new QueryClient();
    const allowed = conversationAuthorizationScope(user("tenant-a", "user-a", true));
    const denied = conversationAuthorizationScope(user("tenant-a", "user-a", false));
    client.setQueryData(["trixus", "conversations", allowed], {
      contact: { customFieldValues: [{ variableKey: "codigo", value: "segredo" }] },
    });
    client.setQueryData(["tickets", "prefill"], {
      contact: { customFields: { codigo: "segredo" } },
    });
    client.setQueryData(["unrelated"], { safe: true });

    await clearStaleConversationAuthorizationCache(client, denied);

    expect(client.getQueryData(["trixus", "conversations", allowed])).toBeUndefined();
    expect(client.getQueryData(["tickets", "prefill"])).toBeUndefined();
    expect(client.getQueryData(["unrelated"])).toEqual({ safe: true });
  });

  it("removes the previous tenant or user cache on switch and logout", async () => {
    const client = new QueryClient();
    const tenantA = conversationAuthorizationScope(user("tenant-a", "user-a", true));
    const tenantB = conversationAuthorizationScope(user("tenant-b", "user-a", true));
    client.setQueryData(["operations", "history", tenantA], { items: [] });
    client.setQueryData(["operations", "history", tenantB], { items: [] });

    await clearStaleConversationAuthorizationCache(client, tenantB);
    expect(client.getQueryData(["operations", "history", tenantA])).toBeUndefined();
    expect(client.getQueryData(["operations", "history", tenantB])).toEqual({ items: [] });

    await clearStaleConversationAuthorizationCache(client, conversationAuthorizationScope(null));
    expect(client.getQueryData(["operations", "history", tenantB])).toBeUndefined();
  });
});
