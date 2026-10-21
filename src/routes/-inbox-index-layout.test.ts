import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/inbox.index.tsx"), "utf8");

describe("Inbox visual requirements", () => {
  it("keeps the new-conversation modal and its result area at stable sizes", () => {
    expect(source).toContain("h-[calc(100dvh-1rem)]");
    expect(source).toContain("flex h-full min-h-0 flex-col gap-3");
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto rounded-lg");
  });

  it("shows the three approved bulk actions under the shared permission", () => {
    expect(source).toContain("Iniciar em Massa");
    expect(source).toContain("Transferência em Massa");
    expect(source).toContain("Fechar Conversas em Massa");
    expect(source).toContain('permissions.includes("chat.bulk_actions.execute")');
    expect(source).not.toContain("selectedConversationIds");
    expect(source).not.toContain("Selecionar conversa de");
    expect(source).toContain("selection={bulkSelection}");
    expect(source).toContain("queues={activeTabs.map");
    expect(source).toContain("data-[highlighted]:bg-surface-2");
  });

  it("renders every queue counter as a blue badge with contrasting text", () => {
    expect(source).toContain("inline-flex h-4 min-w-4 shrink-0");
    expect(source).toContain("rounded-full bg-primary");
    expect(source).toContain("font-sans text-[9px] font-semibold leading-none tabular-nums");
    expect(source).not.toContain("px-1 font-mono text-[9px]");
    expect(source).toContain("text-primary-foreground");
    expect(source).toContain("{counts[t.id]}");
  });

  it("associates Nova Conversa only with the Chat send permission", () => {
    expect(
      source.match(/const canStartConversation = canStartActiveConversation\(permissions\);/g),
    ).toHaveLength(2);
    expect(source).not.toContain(
      'canStartActiveConversation(permissions) && permissions.includes("contacts.read")',
    );
    expect(source).toContain("crmApi.listContactsForMessagePicker");
  });
});
