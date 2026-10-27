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
