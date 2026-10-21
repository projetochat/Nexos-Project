// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pendingMediaPreviewKind } from "@/lib/pending-media-preview";
import { PendingMediaPreview } from "./pending-media-preview";

describe("pending media preview", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("classifies PDF, text and unsupported files", () => {
    expect(pendingMediaPreviewKind({ name: "contrato.pdf", type: "application/pdf" })).toBe("pdf");
    expect(pendingMediaPreviewKind({ name: "leitura.txt", type: "text/plain" })).toBe("text");
    expect(pendingMediaPreviewKind({ name: "arquivo.bin", type: "application/octet-stream" })).toBe(
      "unavailable",
    );
  });

  it("renders accessible previews for PDF, text and unsupported files", async () => {
    const cases = [
      [
        new File(["pdf"], "contrato.pdf", { type: "application/pdf" }),
        "Prévia PDF de contrato.pdf",
      ],
      [
        new File(["texto"], "leitura.txt", { type: "text/plain" }),
        "Prévia de texto de leitura.txt",
      ],
      [
        new File(["bin"], "arquivo.bin", { type: "application/octet-stream" }),
        "Prévia indisponível de arquivo.bin",
      ],
    ] as const;
    for (const [file, label] of cases) {
      await act(async () => root.render(<PendingMediaPreview file={file} />));
      expect(host.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
  });
});
