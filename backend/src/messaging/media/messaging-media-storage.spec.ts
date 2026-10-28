import { afterEach, expect, it, vi } from "vitest";
import { MessageType } from "../../generated/prisma";
import { normalizeDocumentMimeType, validatePolicy } from "./messaging-media-storage.service";

afterEach(() => vi.unstubAllEnvs());

it("accepts contact cards as documents while preserving type and size restrictions", () => {
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", undefined);
  vi.stubEnv("TRIXUS_MESSAGE_MAX_DOCUMENT_SIZE_MB", "25");
  expect(() => validatePolicy(MessageType.DOCUMENT, "text/vcard", 250)).not.toThrow();
  expect(() => validatePolicy(MessageType.IMAGE, "text/vcard", 250)).toThrow();
  expect(() => validatePolicy(MessageType.DOCUMENT, "text/vcard", 26 * 1024 * 1024)).toThrow();
});

it("preserves an explicitly restricted document policy", () => {
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", "application/pdf");
  expect(() => validatePolicy(MessageType.DOCUMENT, "text/vcard", 250)).toThrow();
});

it("accepts common office and compressed document formats by default", () => {
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", undefined);
  for (const mimeType of [
    "text/csv",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/vnd.rar",
    "application/x-7z-compressed",
  ]) {
    expect(() => validatePolicy(MessageType.DOCUMENT, mimeType, 1024)).not.toThrow();
  }
  expect(() =>
    validatePolicy(MessageType.DOCUMENT, "application/x-msdownload", 1024),
  ).not.toThrow();
});

it("infers a safe document MIME from the filename when the provider sends octet-stream", () => {
  expect(
    normalizeDocumentMimeType(MessageType.DOCUMENT, "application/octet-stream", "arquivo.zip"),
  ).toBe("application/zip");
  expect(
    normalizeDocumentMimeType(MessageType.DOCUMENT, "application/octet-stream", "planilha.xlsx"),
  ).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  expect(
    normalizeDocumentMimeType(MessageType.DOCUMENT, "application/octet-stream", "programa.exe"),
  ).toBe("application/octet-stream");
});

it("accepts browser audio MIME parameters emitted by MediaRecorder", () => {
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_AUDIO_MIME_TYPES", undefined);
  expect(() =>
    validatePolicy(MessageType.VOICE, "audio/webm;codecs=opus", 55 * 1024),
  ).not.toThrow();
  expect(() =>
    validatePolicy(MessageType.VOICE, "audio/ogg; codecs=opus", 55 * 1024),
  ).not.toThrow();
});

it("defaults audio and voice media to 32 MiB", () => {
  vi.stubEnv("TRIXUS_MESSAGE_MAX_AUDIO_SIZE_MB", undefined);
  expect(() => validatePolicy(MessageType.AUDIO, "audio/mpeg", 32 * 1024 * 1024)).not.toThrow();
  expect(() => validatePolicy(MessageType.VOICE, "audio/ogg", 32 * 1024 * 1024 + 1)).toThrow();
});

it("defaults video media to 64 MiB", () => {
  vi.stubEnv("TRIXUS_MESSAGE_MAX_VIDEO_SIZE_MB", undefined);
  expect(() => validatePolicy(MessageType.VIDEO, "video/mp4", 64 * 1024 * 1024)).not.toThrow();
  expect(() => validatePolicy(MessageType.VIDEO, "video/mp4", 64 * 1024 * 1024 + 1)).toThrow();
});

it("stores an extensionless inbound PDF using its signature without allowing unknown binaries", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { MessagingMediaStorageService } = await import("./messaging-media-storage.service");
  const root = await mkdtemp(join(tmpdir(), "trixus-document-policy-"));
  vi.stubEnv("TRIXUS_MESSAGE_STORAGE_PROVIDER", "local");
  vi.stubEnv("TRIXUS_MESSAGE_STORAGE_LOCAL_PATH", root);
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", "application/pdf,text/plain");
  try {
    const storage = new MessagingMediaStorageService();
    const input = {
      tenantId: "isolated-tenant",
      conversationId: "isolated-conversation",
      body: Buffer.from("%PDF-1.7\nsynthetic test document"),
      mimeType: "application/octet-stream",
      fileName: "document-without-extension",
      messageType: MessageType.DOCUMENT,
    };
    const result = await storage.storeDownloaded(input);
    expect(result.mimeType).toBe("application/pdf");
    expect(await storage.readObject(result.objectKey)).toEqual(input.body);
    await expect(
      storage.storeDownloaded({ ...input, body: Buffer.from("unknown bytes") }),
    ).rejects.toThrow("Tipo de mídia não permitido");
    await expect(storage.storeDownloaded({ ...input, fileName: "program.exe" })).rejects.toThrow(
      "Tipo de mídia não permitido",
    );
    await expect(storage.storeDownloaded({ ...input, fileName: "document.txt" })).rejects.toThrow(
      "Tipo real do arquivo recebido não confere",
    );
    vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", "text/plain");
    await expect(storage.storeDownloaded(input)).rejects.toThrow("Tipo de mídia não permitido");
    vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", "application/pdf");
    vi.stubEnv("TRIXUS_MESSAGE_MAX_DOCUMENT_SIZE_MB", "0.000001");
    await expect(storage.storeDownloaded(input)).rejects.toThrow("Arquivo excede o limite");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("permits XML documents by default while honoring explicit policies and limits", () => {
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", undefined);
  vi.stubEnv("TRIXUS_MESSAGE_MAX_DOCUMENT_SIZE_MB", "25");
  for (const mime of ["text/xml", "application/xml"]) {
    expect(() => validatePolicy(MessageType.DOCUMENT, mime, 100)).not.toThrow();
    expect(() => validatePolicy(MessageType.IMAGE, mime, 100)).toThrow();
    expect(() => validatePolicy(MessageType.DOCUMENT, mime, 26 * 1024 * 1024)).toThrow();
  }
  expect(
    normalizeDocumentMimeType(MessageType.DOCUMENT, "application/octet-stream", "test.xml"),
  ).toBe("application/xml");
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", "application/pdf");
  expect(() => validatePolicy(MessageType.DOCUMENT, "text/xml", 100)).toThrow();
});

it("stores arbitrary document bytes including unknown extensions and no extension with exact round trip", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { Readable } = await import("node:stream");
  const { MessagingMediaStorageService } = await import("./messaging-media-storage.service");
  const root = await mkdtemp(join(tmpdir(), "trixus-arbitrary-documents-"));
  vi.stubEnv("TRIXUS_MESSAGE_STORAGE_PROVIDER", "local");
  vi.stubEnv("TRIXUS_MESSAGE_STORAGE_LOCAL_PATH", root);
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", "*");
  vi.stubEnv("TRIXUS_MESSAGE_MAX_DOCUMENT_SIZE_MB", "25");
  try {
    const storage = new MessagingMediaStorageService();
    const body = Buffer.from([0, 1, 255, 20, 8, 0]);
    for (const [mimeType, fileName] of [
      ["application/octet-stream", "no-extension"],
      ["application/x-unknown-format", "document.custom"],
      ["application/x-msdownload", "program.exe"],
      ["text/html", "document.html"],
      ["image/svg+xml", "drawing.svg"],
      ["invalid\r\nheader", "unknown"],
    ]) {
      const stored = await storage.storeDownloaded({
        tenantId: "isolated",
        conversationId: "test",
        body,
        mimeType,
        fileName,
        messageType: MessageType.DOCUMENT,
      });
      expect(await storage.readObject(stored.objectKey)).toEqual(body);
      expect(stored.mimeType).not.toMatch(/[\r\n]/);
    }
    const uploadedRequest = Object.assign(Readable.from([body]), {
      headers: {
        "content-type": "application/x-unknown-format",
        "x-media-type": "document",
        "x-file-name": "upload.custom",
      },
    });
    const uploaded = await storage.storeUpload({
      tenantId: "isolated",
      conversationId: "test",
      req: uploadedRequest as never,
    });
    expect(await storage.readObject(uploaded.objectKey)).toEqual(body);
    const mismatched = await storage.storeDownloaded({
      tenantId: "isolated",
      conversationId: "test",
      body: Buffer.from("%PDF-synthetic"),
      mimeType: "text/plain",
      fileName: "document.txt",
      messageType: MessageType.DOCUMENT,
    });
    expect(mismatched.mimeType).toBe("application/octet-stream");
    expect(await storage.readObject(mismatched.objectKey)).toEqual(Buffer.from("%PDF-synthetic"));
    expect(() => validatePolicy(MessageType.IMAGE, "application/x-unknown-format", 10)).toThrow();
    vi.stubEnv("TRIXUS_MESSAGE_MAX_DOCUMENT_SIZE_MB", "0.000001");
    await expect(
      storage.storeDownloaded({
        tenantId: "isolated",
        conversationId: "test",
        body,
        mimeType: "application/octet-stream",
        messageType: MessageType.DOCUMENT,
      }),
    ).rejects.toThrow("Arquivo excede o limite");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("allows arbitrary document MIME by default but keeps explicit restrictive policies", () => {
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", undefined);
  expect(() => validatePolicy(MessageType.DOCUMENT, "application/octet-stream", 10)).not.toThrow();
  expect(() => validatePolicy(MessageType.DOCUMENT, "application/custom", 10)).not.toThrow();
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_DOCUMENT_MIME_TYPES", "application/pdf");
  expect(() => validatePolicy(MessageType.DOCUMENT, "application/custom", 10)).toThrow();
  vi.stubEnv("TRIXUS_MESSAGE_ALLOWED_IMAGE_MIME_TYPES", "*");
  expect(() => validatePolicy(MessageType.IMAGE, "application/custom", 10)).toThrow();
});
