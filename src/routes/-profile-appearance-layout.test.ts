import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profile = readFileSync(new URL("./perfil.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("./-historico-page.tsx", import.meta.url), "utf8");

describe("Meu Perfil · Aparência", () => {
  it("oferece imagem padrão, cor sólida, paletas e preview completo", () => {
    expect(profile).toContain("Paletas de cores predefinidas");
    expect(profile).toContain("Imagem padrão");
    expect(profile).toContain("Cor sólida");
    expect(profile).toContain("Preview da conversa");
    expect(profile).toContain("data-profile-chat-background={chatBackgroundMode}");
  });

  it("usa a mesma regra de fundo no Chat e no Histórico", () => {
    expect(chat).toContain(
      "chatBackgroundStyle(user?.chatBackgroundColor, user?.chatBackgroundMode)",
    );
    expect(history).toContain(
      "chatBackgroundStyle(user?.chatBackgroundColor, user?.chatBackgroundMode)",
    );
  });
});
