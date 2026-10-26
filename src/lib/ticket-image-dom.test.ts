// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateTicketImages } from "./ticket-image-dom";
import { readTicketEditorHtml, writeTicketEditorHtml } from "./ticket-editor-dom";
import { messageApi, ticketApi } from "./trixus-api";
import { parseTicketImageReference } from "./ticket-image-reference";
import { parseTicketImageReference as backendParse } from "../../backend/src/tickets/ticket-image-reference";

vi.mock("./trixus-api", () => ({
  messageApi: { downloadMedia: vi.fn() },
  ticketApi: { preview: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function setup(source: string) {
  const element = document.createElement("div");
  document.body.append(element);
  writeTicketEditorHtml(element, `<img src="${source}" alt="Imagem">`);
  const create = vi.fn().mockReturnValue("blob:owned-preview");
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  return { element, create, revoke };
}

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("authenticated persisted ticket images", () => {
  it("loads saved images through ticket scope, serializes references and revokes previews", async () => {
    const source = "/ticket-images/tickets/ticket-a/attachments/attachment-a";
    const { element, revoke } = setup(source);
    vi.mocked(ticketApi.preview).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    const cleanup = hydrateTicketImages(element);
    await settle();
    expect(ticketApi.preview).toHaveBeenCalledWith("ticket-a", "attachment-a");
    expect(messageApi.downloadMedia).not.toHaveBeenCalled();
    expect(element.querySelector("img")?.getAttribute("src")).toBe("blob:owned-preview");
    expect(readTicketEditorHtml(element)).toContain(source);
    expect(readTicketEditorHtml(element)).not.toContain("blob:");
    cleanup();
    expect(revoke).toHaveBeenCalledWith("blob:owned-preview");
    expect(element.querySelector("img")?.getAttribute("src")).toBe(source);
  });

  it("uses chat authentication only for an unsaved conversation reference", async () => {
    const { element } = setup("/ticket-images/conversations/conversation-a/messages/message-a");
    vi.mocked(messageApi.downloadMedia).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    const cleanup = hydrateTicketImages(element);
    await settle();
    expect(messageApi.downloadMedia).toHaveBeenCalledWith("conversation-a", "message-a", true);
    cleanup();
  });

  it("does not create URLs for stale responses or executable image types", async () => {
    const { element, create } = setup("/ticket-images/tickets/ticket-a/attachments/attachment-a");
    let resolve!: (body: Blob) => void;
    vi.mocked(ticketApi.preview).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const cleanup = hydrateTicketImages(element);
    cleanup();
    resolve(new Blob(["png"], { type: "image/png" }));
    await settle();
    expect(create).not.toHaveBeenCalled();
    vi.mocked(ticketApi.preview).mockResolvedValue(new Blob(["svg"], { type: "image/svg+xml" }));
    const secondCleanup = hydrateTicketImages(element);
    await settle();
    expect(create).not.toHaveBeenCalled();
    secondCleanup();
  });

  it("rejects arbitrary paths, remote URLs, traversal and unowned blob URLs in both boundaries", () => {
    for (const source of [
      "https://example.test/image.png",
      "blob:unowned",
      "/ticket-images/tickets/../attachments/id",
      "/ticket-images/tickets/a/attachments/b?token=secret",
      "/ticket-images/conversations/a/messages/b%2Fc",
    ]) {
      expect(parseTicketImageReference(source)).toBeNull();
      expect(backendParse(source)).toBeNull();
      const element = document.createElement("div");
      writeTicketEditorHtml(element, `<img src="${source}">`);
      expect(element.querySelector("img")).toBeNull();
    }
  });
});
