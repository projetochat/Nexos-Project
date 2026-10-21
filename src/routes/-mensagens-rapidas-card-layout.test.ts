import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./mensagens-rapidas.tsx", import.meta.url), "utf8");

describe("cards de Mensagens Rápidas", () => {
  it("segue a hierarquia visual dos cards de Perfil de Acesso", () => {
    expect(source).toContain(
      'className="flex min-h-[166px] flex-col p-4 transition hover:border-primary/35 hover:bg-surface-1"',
    );
    expect(source).toContain('className="truncate font-semibold"');
    expect(source).toContain(
      'className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground"',
    );
    expect(source).toContain(
      'className="mt-auto flex min-h-11 items-end justify-end gap-1.5 border-t border-border pt-3"',
    );
  });

  it("preserva metadados e todas as ações do catálogo", () => {
    expect(source).toContain("{reply.messages!.length} mensagens");
    expect(source).toContain("Encerra conversa");
    for (const label of ["Visualizar", "Duplicar", "Editar", "Remover"]) {
      expect(source).toContain(`aria-label="${label}"`);
    }
    expect(source).not.toContain("absolute right-4 top-4");
  });

  it("mostra o status do cadastro no topo direito", () => {
    expect(source).toContain('className="ml-auto shrink-0 self-start"');
    expect(source).toContain('<Badge tone={reply.active !== false ? "success" : "destructive"}>');
    expect(source).toContain('{reply.active !== false ? "Ativo" : "Inativo"}');
  });
});
