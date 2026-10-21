import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("contacts sorting controls", () => {
  const source = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");

  it("offers only the real model concepts and keeps ordering in component state", () => {
    expect(source).toContain('type ContactSortMode = "name" | "customer" | "instance"');
    expect(source).toContain('["customer", "Empresa do contato"]');
    expect(source).not.toContain('["customer", "Cliente"]');
    expect(source).not.toContain("Cliente do contato");
    expect(source).toContain("sortBy: sortMode");
    expect(source).toContain(
      'const [viewMode, setViewMode] = React.useState<ContactViewMode>("list")',
    );
  });
});
