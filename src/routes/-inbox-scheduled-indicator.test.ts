import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./inbox.index.tsx", import.meta.url), "utf8");

describe("Inbox scheduled-message indicator", () => {
  it("shows only a calendar-clock icon below the conversation timestamp", () => {
    expect(source).toContain("hasPendingScheduledMessage={Boolean(c.hasPendingScheduledMessage)}");
    expect(source).toContain('aria-label="Mensagem agendada pendente"');
    expect(source).toContain('className="ml-auto mt-0.5 h-3.5 w-3.5 text-primary"');
    expect(source).not.toContain(">Mensagem agendada pendente<");
  });
});
