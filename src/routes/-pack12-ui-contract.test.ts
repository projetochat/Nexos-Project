import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

describe("PACK 12 UI contracts", () => {
  it("keeps the HTML editor at 16px on mobile and exposes date pickers", () => {
    const source = routeSource("contatos.tsx");
    expect(source).toContain("text-base outline-none sm:text-sm");
    expect(source).toContain('type={variant === "datetime" ? "datetime-local" : "date"}');
    expect(source).toContain("picker.showPicker()");
  });

  it("does not expose history deletion in the conversation header", () => {
    const source = routeSource("-historico-page.tsx");
    expect(source).not.toContain('aria-label="Excluir histórico"');
    expect(source).not.toContain("deletingConversationId");
  });

  it("offers cards/list switching and the revised mobile ticket presentation", () => {
    const source = routeSource("chamados.tsx");
    expect(source).toContain('aria-label="Visualizar chamados em cards"');
    expect(source).toContain('aria-label="Visualizar chamados em lista"');
    expect(source).toContain('tone="validated"');
    expect(source).toContain('label="Título" value={ticket.title} featured fullWidth');
    expect(source).toContain(
      'truncate font-semibold ${featured ? "font-sans text-lg text-foreground"',
    );
    expect(source).toContain("font-sans font-semibold text-foreground");
    expect(source).toContain('<p className="text-xs text-muted-foreground">{label}</p>');
  });

  it("uses every tenant instance for the administrator metric", () => {
    const source = routeSource("perfis.tsx");
    expect(source).toMatch(
      /const connectionCount = isAdministrator\s*\?\s*connections\.length\s*:\s*scopeCounts\.connections/,
    );
  });

  it("allows clearing the protocol filter", () => {
    const source = routeSource("inbox.$conversationId.tsx");
    expect(source).toContain('aria-label="Limpar filtro de protocolos"');
    expect(source).toContain('onClick={() => setProtoFilter("")}');
    expect(source).toContain("inline-flex h-4 w-4");
    expect(source).toContain('<X className="h-2.5 w-2.5" />');
    expect(source).toContain(
      "rounded-full border border-border bg-surface-2 text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive",
    );
  });

  it("uses the same typography for the lifecycle label and its date", () => {
    const source = routeSource("inbox.$conversationId.tsx");
    expect(source).toContain("{`${label} — ${fmtLogStamp(ts)}`}");
    expect(source).not.toContain('<span className="ml-1 opacity-80">— {fmtLogStamp(ts)}</span>');
  });
});
