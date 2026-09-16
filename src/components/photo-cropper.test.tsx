// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoCropper } from "./photo-cropper";
import { Modal } from "./modal";

let root: Root;
const drawImage = vi.fn();
const onApply = vi.fn();
const onClose = vi.fn();
const click = async (label: string) => {
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === label || item.getAttribute("aria-label") === label,
  )!;
  await act(async () => button.click());
};
async function loadImage() {
  const image = document.querySelector("img")!;
  Object.defineProperties(image, { naturalWidth: { value: 1600 }, naturalHeight: { value: 800 } });
  await act(async () => image.dispatchEvent(new Event("load")));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  onApply.mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,cropped",
  );
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
describe("photo adjustment", () => {
  it("does not apply the photo until confirmation and exports the selected square", async () => {
    await act(async () =>
      root.render(
        <PhotoCropper
          source="data:image/png;base64,original"
          onApply={onApply}
          onClose={onClose}
        />,
      ),
    );
    await loadImage();
    expect(onApply).not.toHaveBeenCalled();
    await click("Confirmar recorte");
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(HTMLImageElement),
      400,
      0,
      800,
      800,
      0,
      0,
      512,
      512,
    );
    expect(onApply).toHaveBeenCalledWith("data:image/jpeg;base64,cropped");
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("cancels without changing the previous photo", async () => {
    await act(async () =>
      root.render(
        <PhotoCropper
          source="data:image/png;base64,original"
          onApply={onApply}
          onClose={onClose}
        />,
      ),
    );
    await click("Cancelar");
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("keeps the editor open with an error if saving fails", async () => {
    onApply.mockRejectedValue(new Error("Falha ao salvar"));
    await act(async () =>
      root.render(
        <PhotoCropper
          source="data:image/png;base64,original"
          onApply={onApply}
          onClose={onClose}
        />,
      ),
    );
    await loadImage();
    await click("Confirmar recorte");
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Falha ao salvar");
  });
  it("Escape dismisses only the cropper, preserving the underlying form", async () => {
    const closeForm = vi.fn();
    await act(async () =>
      root.render(
        <>
          <Modal open title="Cadastro" onClose={closeForm} />
          <PhotoCropper
            source="data:image/png;base64,original"
            onApply={onApply}
            onClose={onClose}
          />
        </>,
      ),
    );
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(closeForm).not.toHaveBeenCalled();
  });
});
