import { describe, expect, it, vi } from "vitest";
import type { ApiMessage } from "./trixus-api";
import { clipboardHtml, copyMessageToClipboard } from "./message-clipboard";

const imageMessage = {
  id: "message",
  conversation_id: "conversation",
  type: "image",
  content: "Legenda",
  media_data: { state: "ready", caption: "Legenda" },
} as ApiMessage;

function readBlob(blob: Blob) {
  if ("text" in blob && typeof blob.text === "function") return blob.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("message clipboard", () => {
  it("writes an authenticated image with HTML and plain-text representations", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const downloadMedia = vi.fn().mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
    const png = new Blob(["png"], { type: "image/png" });
    let parts: Record<string, ClipboardItemData> = {};

    const result = await copyMessageToClipboard(imageMessage, {
      clipboard: { write },
      downloadMedia,
      normalizeImage: vi.fn().mockResolvedValue(png),
      dataUrl: vi.fn().mockResolvedValue("data:image/png;base64,cG5n"),
      createItem: (value) => {
        parts = value;
        return {} as ClipboardItem;
      },
    });

    expect(result.mode).toBe("rich");
    expect(downloadMedia).toHaveBeenCalledWith("conversation", "message");
    expect(write).toHaveBeenCalledOnce();
    expect(Object.keys(parts).sort()).toEqual(["image/png", "text/html", "text/plain"]);
    const plain = await parts["text/plain"]!;
    const html = await parts["text/html"]!;
    expect(await readBlob(plain as Blob)).toBe("Legenda");
    expect(await readBlob(html as Blob)).toContain("data:image/png;base64,cG5n");
  });

  it("falls back clearly to the caption when rich clipboard writing fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const result = await copyMessageToClipboard(imageMessage, {
      clipboard: { write: vi.fn().mockRejectedValue(new Error("denied")), writeText },
      downloadMedia: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
      normalizeImage: vi.fn().mockImplementation(async (blob) => blob),
      dataUrl: vi.fn().mockResolvedValue("data:image/png;base64,cG5n"),
      createItem: () => ({}) as ClipboardItem,
    });

    expect(result.mode).toBe("text-only");
    expect(writeText).toHaveBeenCalledWith("Legenda");
  });

  it("reports an unsupported image-only copy instead of claiming success", async () => {
    await expect(
      copyMessageToClipboard(
        { ...imageMessage, content: "", media_data: { state: "ready" } } as ApiMessage,
        {
          clipboard: { writeText: vi.fn() },
        },
      ),
    ).rejects.toThrow("Este navegador não permite copiar imagens.");
  });

  it("escapes the caption used by rich-text destinations", () => {
    expect(clipboardHtml("data:image/png;base64,a&b", '<script>\n"x"')).toBe(
      '<div><img src="data:image/png;base64,a&amp;b" alt=""><p>&lt;script&gt;<br>&quot;x&quot;</p></div>',
    );
  });
});
