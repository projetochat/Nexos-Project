import { expect, it, vi } from "vitest";
import { MessagesController } from "./messages.controller";

it.each([
  "text/xml",
  "application/xml",
  "text/xml; charset=utf-8",
  "text/html",
  "Text/HTML; charset=utf-8",
  "image/svg+xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/octet-stream",
  "application/x-custom-file",
  "",
])("serves %s as an attachment even when inline is requested", async (mimeType) => {
  const bytes = Buffer.from("<document>synthetic</document>");
  const messages = {
    downloadMedia: vi.fn().mockResolvedValue({
      body: bytes,
      mimeType,
      fileName: "document.xml",
    }),
  };
  const controller = new MessagesController(messages as never, {} as never);
  const response = { setHeader: vi.fn(), end: vi.fn() };
  await controller.inlineMedia("conversation", "message", {} as never, response as never);
  expect(response.setHeader).toHaveBeenCalledWith(
    "Content-Disposition",
    'attachment; filename="document.xml"',
  );
  expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  expect(response.end).toHaveBeenCalledWith(bytes);
});

it.each([
  "application/pdf",
  "text/plain",
  "text/csv",
  "Image/PNG; charset=binary",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/wav",
  "video/mp4",
  "video/3gpp",
  "video/webm",
])("preserves inline responses for %s", async (mimeType) => {
  const messages = {
    downloadMedia: vi.fn().mockResolvedValue({
      body: Buffer.from("%PDF-synthetic"),
      mimeType,
      fileName: "document.pdf",
    }),
  };
  const controller = new MessagesController(messages as never, {} as never);
  const response = { setHeader: vi.fn(), end: vi.fn() };
  await controller.inlineMedia("conversation", "message", {} as never, response as never);
  expect(response.setHeader).toHaveBeenCalledWith(
    "Content-Disposition",
    'inline; filename="document.pdf"',
  );
});
