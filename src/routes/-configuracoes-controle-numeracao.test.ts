import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navigation = readFileSync(new URL("./configuracoes.tsx", import.meta.url), "utf8");
const queues = readFileSync(new URL("./configuracoes.geral.tsx", import.meta.url), "utf8");
const numbering = readFileSync(
  new URL("./configuracoes.controle-numeracao.tsx", import.meta.url),
  "utf8",
);

describe("Configurações · Controle de Numeração", () => {
  it("possui aba própria e não permanece dentro de Filas do Chat", () => {
    expect(navigation).toContain('label: "Controle de Numeração"');
    expect(navigation).toContain('to: "/configuracoes/controle-numeracao"');
    expect(queues).not.toContain("ProtocolNumberingSettings");
    expect(queues).not.toContain("Numeração de protocolos");
  });

  it("mantém os cinco formatos e uma única ação final de salvamento", () => {
    for (const format of [
      "YEAR_SEQUENCE",
      "YEAR_MONTH_SEQUENCE",
      "SEQUENCE",
      "DATE_SEQUENCE",
      "CUSTOM",
    ]) {
      expect(numbering).toContain(`value: "${format}"`);
    }
    expect(numbering).toContain('isChat ? "do Chat" : "de Chamados"');
    expect(numbering.match(/Salvar configurações/g)).toHaveLength(1);
  });

  it("reutiliza os serviços oficiais de protocolo", () => {
    expect(numbering).toContain("organizationApi.protocolSettings()");
    expect(numbering).toContain("organizationApi.updateProtocolSettings");
  });

  it("remove os avisos azuis e aplica os novos contratos de formato", () => {
    expect(numbering).not.toContain("border-blue-200 bg-blue-50");
    expect(numbering.indexOf('value: "CUSTOM"')).toBeLessThan(
      numbering.indexOf('value: "SEQUENCE"'),
    );
    expect(numbering).toContain("[2, 3, 4, 5, 6, 7, 8, 9, 10]");
    expect(numbering).toContain('disabled={item.format !== "CUSTOM"}');
  });

  it("separa os cabeçalhos dos módulos com o mesmo fundo dos painéis da IA", () => {
    expect(numbering).toContain("flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4");
    expect(numbering).toContain(
      'backgroundColor: "color-mix(in srgb, var(--surface-1) 98%, var(--foreground) 2%)"',
    );
  });
});
