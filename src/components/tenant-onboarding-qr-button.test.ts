import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./tenant-onboarding-boundary.tsx", import.meta.url), "utf8");

describe("avanço e responsividade do wizard", () => {
  it("gera o QR Code pelo botão Avançar sem persistir o próximo passo", () => {
    expect(source).toContain("const instanceNeedsQr = step === 2 && !currentStepComplete");
    expect(source).toContain("instanceStepRef.current?.generateQr()");
    expect(source).toContain("if (instanceNeedsQr)");
    expect(source).toContain("void persistStep(step + 1, step)");
    expect(source).not.toContain("Gerar QR Code");
  });

  it("bloqueia repetição durante a geração e mantém a conexão como autorização para avançar", () => {
    expect(source).toContain("instanceFooterBusy");
    expect(source).toContain("!instanceFooterState.canGenerate");
    expect(source).toContain("createRequestActive.current");
    expect(source).toContain("qrRequestActive.current");
  });

  it("evita sobreposição do rodapé e quebra os nomes dos passos no mobile", () => {
    expect(source).toContain("lg:sticky lg:bottom-0");
    expect(source).toContain('<div className="min-h-0 shrink-0 lg:flex-1">');
    expect(source).toContain("[overflow-wrap:anywhere]");
    expect(source).toContain("overflow-hidden rounded-xl");
    expect(source).toContain('<li className="hidden items-center gap-4 sm:flex">');
    expect(source).toContain("text-base leading-6 text-[#3f5da1] sm:text-lg sm:leading-8");
    expect(source).toContain("h-[15.6rem] w-full max-w-[24rem]");
    expect(source).toContain("mt-3 flex shrink-0 items-center gap-3");
  });

  it("amplia o nome da instância e exibe a nota azul de conexão", () => {
    expect(source).toContain("text-base font-semibold text-[#080b72] sm:text-lg");
    expect(source).toContain("sm:min-h-14 sm:text-xl");
    expect(source).toContain("Após a leitura, aguarde a confirmação da conexão.");
    expect(source).toContain("border-sky-100 bg-sky-50");
  });
});
