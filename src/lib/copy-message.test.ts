import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiMessage } from "./trixus-api";

const api = vi.hoisted(() => ({
  sendText: vi.fn(),
  downloadMedia: vi.fn(),
  sendMedia: vi.fn(),
}));

vi.mock("./trixus-api", () => ({ messageApi: api }));

import { copyContentWithoutSenderPrefix, sendMessageCopy } from "./copy-message";

beforeEach(() => vi.clearAllMocks());

describe("copyContentWithoutSenderPrefix", () => {
  it("removes every stored copy of the sender name before a resend", () => {
    expect(
      copyContentWithoutSenderPrefix(
        "*Natã Rabelo:*\n\n*Natã Rabelo:*\n\n*Natã Rabelo:*\n\nBom dia",
        "Natã Rabelo",
      ),
    ).toBe("Bom dia");
  });

  it("preserves ordinary content that does not begin with the recorded author", () => {
    expect(copyContentWithoutSenderPrefix("Bom dia, Natã Rabelo", "Natã Rabelo")).toBe(
      "Bom dia, Natã Rabelo",
    );
  });

  it("accepts the double-asterisk form rendered by imported messages", () => {
    expect(copyContentWithoutSenderPrefix("**Natã Rabelo:**\nTexto", "Natã Rabelo")).toBe("Texto");
  });

  it("resends media with one clean caption for the backend to prefix once", async () => {
    const blob = new Blob(["audio"], { type: "audio/mpeg" });
    api.downloadMedia.mockResolvedValue(blob);
    api.sendMedia.mockResolvedValue({ id: "copy" });

    await sendMessageCopy(
      {
        id: "source",
        conversation_id: "conversation",
        type: "audio",
        status: "failed",
        content: "*Natã Rabelo:*\n\n*Natã Rabelo:*\n\nBom dia",
        author_name: "Natã Rabelo",
        media_data: {
          state: "ready",
          file_name: "audio.mp3",
          mime_type: "audio/mpeg",
          caption: "*Natã Rabelo:*\n\n*Natã Rabelo:*\n\nBom dia",
          size: 5,
          width: null,
          height: null,
          checksum: null,
        },
      } as ApiMessage,
      "destination",
      "retry-id",
    );

    expect(api.sendMedia).toHaveBeenCalledWith(
      "destination",
      blob,
      expect.objectContaining({ caption: "Bom dia", clientMessageId: "retry-id" }),
    );
  });
});
