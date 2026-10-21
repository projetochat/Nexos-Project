import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inboxDetail = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");
const historyPage = readFileSync(new URL("./-historico-page.tsx", import.meta.url), "utf8");

describe("conversation header actions by navigation context", () => {
  it("does not offer a new conversation from the Inbox detail or a selected protocol", () => {
    expect(inboxDetail).not.toContain("<MessageSquarePlus");
    expect(inboxDetail).not.toContain("ActiveConversationOrchestrator");
  });

  it("keeps the existing new-conversation action in conversation history", () => {
    expect(historyPage).toContain('aria-label="Nova conversa"');
    expect(historyPage).toContain("<MessageSquarePlus");
  });
});
