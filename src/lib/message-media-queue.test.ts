import { describe, expect, it, vi } from "vitest";
import { messageMediaType, sendMediaQueue } from "./message-media-queue";

describe("message media queue", () => {
  it("classifies images, videos and documents", () => {
    expect(messageMediaType({ type: "image/jpeg" } as File)).toBe("image");
    expect(messageMediaType({ type: "video/mp4" } as File)).toBe("video");
    expect(messageMediaType({ type: "application/pdf" } as File)).toBe("document");
  });

  it("stops at the first failure and reports only unsent items", async () => {
    const send = vi.fn(async (item: string) => {
      if (item === "second") throw new Error("failed");
    });
    const sent: string[] = [];

    const result = await sendMediaQueue(["first", "second", "third"], send, (item) =>
      sent.push(item),
    );

    expect(sent).toEqual(["first"]);
    expect(send.mock.calls.map(([item]) => item)).toEqual(["first", "second"]);
    expect(result.remaining).toEqual(["second", "third"]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("preserves selection order when every item succeeds", async () => {
    const order: string[] = [];
    const result = await sendMediaQueue(
      ["first", "second", "third"],
      async (item) => void order.push(`send:${item}`),
      (item) => void order.push(`done:${item}`),
    );

    expect(order).toEqual([
      "send:first",
      "done:first",
      "send:second",
      "done:second",
      "send:third",
      "done:third",
    ]);
    expect(result).toEqual({ remaining: [], error: null });
  });
});
