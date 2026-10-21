import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contactCardPreview } from "../messaging/messaging-outbound.service";

const source = readFileSync(new URL("./messages.service.ts", import.meta.url), "utf8");

describe("contact card conversation preview repair", () => {
  it("uses the last contact name from the vCard", () => {
    const body = Buffer.from(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:Primeiro contato",
        "END:VCARD",
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:Ialle - Prima",
        "END:VCARD",
      ].join("\r\n"),
    );

    expect(contactCardPreview("text/vcard", "contato.vcf", body)).toBe("[contato] Ialle - Prima");
  });

  it("repairs only when the card is still the latest conversation message", () => {
    expect(source).toContain("lastMessageAt: message.createdAt");
    expect(source).toContain("data: { lastMessagePreview: preview }");
    expect(source).toContain('reason: "contact_card.preview_repaired"');
  });
});
