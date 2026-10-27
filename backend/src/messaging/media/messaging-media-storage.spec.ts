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
  expect(() => validatePolicy(MessageType.DOCUMENT, "application/x-msdownload", 1024)).toThrow();
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
