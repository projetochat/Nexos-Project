import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./-historico-page.tsx", import.meta.url), "utf8");

describe("metadados do Histórico de Conversas", () => {
  it("separa instância, departamento e atendente com hífens como no Chat", () => {
    const start = source.indexOf(
      'aria-label="Instância, departamento e atendente do encerramento"',
    );
    const end = source.indexOf("</div>", start);
    const metadata = source.slice(start, end);

    expect(metadata).toContain('].join(" - ")}');
    expect(metadata).toContain('className="min-w-0 truncate"');
    expect(metadata).not.toContain('<span aria-hidden="true">·</span>');
  });
});

it("uses the persisted protocol to retain historical media access after first attendance", () => {
  expect(source).toContain("mediaAccessAllowed={Boolean(active.protocolo?.trim())}");
});

it("passes the persisted protocol independently of active assignment in the inbox", () => {
  const inbox = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");
  expect(inbox).toContain("mediaAccessAllowed={Boolean(conv.protocolo?.trim())}");
});
