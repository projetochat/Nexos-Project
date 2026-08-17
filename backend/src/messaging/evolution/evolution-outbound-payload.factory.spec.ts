import { describe, expect, it } from "vitest";
import { MessageType } from "../../generated/prisma";
import { MessagingErrorCode } from "../messaging.contracts";
import {
  EvolutionOutboundPayloadFactory,
  evolutionMediaKind,
} from "./evolution-outbound-payload.factory";
import { normalizeEvolutionRecipient } from "./evolution-recipient.normalizer";

describe("Evolution v2.3.7 outbound payload contract", () => {
  const factory = new EvolutionOutboundPayloadFactory();

  it("normalizes direct numbers and preserves group JIDs", () => {
    expect(
      normalizeEvolutionRecipient({
        conversationType: "DIRECT",
        normalizedPhone: "+55 (62) 99999-7509",
      }),
    ).toMatchObject({
      conversationType: "DIRECT",
      number: "5562999997509",
      remoteJid: "5562999997509@s.whatsapp.net",
      targetKind: "DIRECT_NUMBER",
    });

    expect(
      normalizeEvolutionRecipient({
        conversationType: "GROUP",
        externalChatId: "120363123456789@g.us",
      }),
    ).toMatchObject({
      conversationType: "GROUP",
      number: "120363123456789@g.us",
      targetKind: "GROUP_JID",
    });
  });

  it("creates text payload with root text and no undefined fields", () => {
    const payload = factory.text({
      recipient: normalizeEvolutionRecipient({ normalizedPhone: "+5562999997509" }),
      text: "Ola",
      quoted: null,
    });

    expect(payload).toEqual({ number: "5562999997509", text: "Ola" });
    expect(JSON.stringify(payload)).not.toContain("undefined");
  });

  it("creates text payload with Evolution mentioned targets", () => {
    const payload = factory.text({
      recipient: normalizeEvolutionRecipient({
        externalChatId: "120363123456789@g.us",
        conversationType: "GROUP",
      }),
      text: "@5562999997509 Ola",
      mentions: ["5562999997509@s.whatsapp.net"],
    });

    expect(payload).toEqual({
      number: "120363123456789@g.us",
      text: "@5562999997509 Ola",
      mentioned: ["5562999997509@s.whatsapp.net"],
    });
  });

  it("creates reply payload with quoted key", () => {
    const payload = factory.text({
      recipient: normalizeEvolutionRecipient({
        externalChatId: "120363123456789@g.us",
        conversationType: "GROUP",
      }),
      text: "respondendo",
      quoted: factory.quotedKey({
        id: "WA_MSG",
        remoteJid: "120363123456789@g.us",
        fromMe: false,
        participant: "5562999997509@s.whatsapp.net",
      }),
    });

    expect(payload).toEqual({
      number: "120363123456789@g.us",
      text: "respondendo",
      quoted: {
        key: {
          id: "WA_MSG",
          remoteJid: "120363123456789@g.us",
          fromMe: false,
          participant: "5562999997509@s.whatsapp.net",
        },
      },
    });
  });

  it("creates reaction payload with root key and reaction", () => {
    expect(
      factory.reaction({
        key: factory.quotedKey({
          id: "WA_MSG",
          remoteJid: "5562999997509@s.whatsapp.net",
          fromMe: false,
        }),
        reaction: "",
      }),
    ).toEqual({
      key: { id: "WA_MSG", remoteJid: "5562999997509@s.whatsapp.net", fromMe: false },
      reaction: "",
    });
  });

  it("rejects missing required provider fields before the HTTP call", () => {
    expect(() =>
      factory.text({
        recipient: normalizeEvolutionRecipient({ normalizedPhone: "+5562999997509" }),
        text: "",
      }),
    ).toThrow(expect.objectContaining({ code: MessagingErrorCode.INVALID_PROVIDER_PAYLOAD }));
    expect(() =>
      factory.reaction({
        key: { id: "", remoteJid: "5562999997509@s.whatsapp.net", fromMe: false },
        reaction: "ok",
      }),
    ).toThrow(expect.objectContaining({ code: MessagingErrorCode.REACTION_PROVIDER_KEY_INVALID }));
  });

  it("maps media kinds for Evolution sendMedia", () => {
    expect(evolutionMediaKind(MessageType.IMAGE)).toBe("image");
    expect(evolutionMediaKind(MessageType.DOCUMENT)).toBe("document");
    expect(evolutionMediaKind(MessageType.AUDIO)).toBe("audio");
    expect(evolutionMediaKind(MessageType.VOICE)).toBe("audio");
  });
});
