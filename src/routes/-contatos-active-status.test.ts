import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");

describe("situação global do contato", () => {
  it("edita o mesmo estado no cadastro principal de contatos", () => {
    const formStart = source.indexOf("export function ContactFormModal(");
    const payloadStart = source.indexOf("export function contactPayload(", formStart);
    const form = source.slice(formStart, payloadStart);

    expect(form).toContain("const [active, setActive] = React.useState(true)");
    expect(form).toContain("setActive(initial?.active ?? true)");
    expect(form).toContain('id="contact-active"');
    expect(form).toContain("checked={active}");
    expect(form).toContain("onCheckedChange={setActive}");
    expect(form).toContain('{active ? "Ativo" : "Inativo"}');
    expect(form).toContain("active,");
  });

  it("envia a situação ao backend no payload compartilhado", () => {
    expect(source).toContain("active?: boolean;");
    expect(source).toContain("active: data.active ?? true,");
  });
});
