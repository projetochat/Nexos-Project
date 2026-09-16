// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InboxImageViewer } from "./inbox-image-viewer";
import type { ApiMessage } from "@/lib/trixus-api";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

it("zooms with the wheel, drags, transforms and restores the image without changing the source", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const close = vi.fn();
  const reply = vi.fn();
  const download = vi.fn().mockResolvedValue(undefined);
  try {
    await React.act(() =>
      root.render(
        <InboxImageViewer
          src="blob:test-image"
          message={
            {
              id: "image1",
              content: "Legenda",
              media_data: { file_name: "foto.jpg" },
            } as ApiMessage
          }
          onClose={close}
          onReply={reply}
          onDownload={download}
        />,
      ),
    );
    const stage = document.querySelector<HTMLElement>('[data-testid="image-stage"]')!;
    const image = stage.querySelector("img")!;
    const click = async (label: string) => {
      await React.act(() =>
        (document.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click(),
      );
    };
    stage.setPointerCapture = vi.fn();
    const wheel = new WheelEvent("wheel", {
      deltaY: -100,
      clientX: 50,
      clientY: 25,
      bubbles: true,
      cancelable: true,
    });
    await React.act(() => {
      stage.dispatchEvent(wheel);
    });
    expect(wheel.defaultPrevented).toBe(true);
    expect(image.style.transform).not.toContain("scale(1) rotate");
    const beforeDrag = image.style.transform;
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y });
      stage.dispatchEvent(event);
    };
    await React.act(() => {
      pointer("pointerdown", 10, 10);
      pointer("pointermove", 110, 70);
      pointer("pointerup", 110, 70);
    });
    expect(image.style.transform).not.toBe(beforeDrag);
    await click("Girar à direita");
    expect(image.style.transform).toContain("rotate(90deg)");
    await click("Espelhar horizontalmente");
    expect(image.style.transform).toContain("scale(-1, 1)");
    await click("Espelhar verticalmente");
    expect(image.style.transform).toContain("scale(-1, -1)");
    await click("Restaurar visualização");
    expect(image.style.transform).toBe("translate(0px, 0px) scale(1) rotate(0deg) scale(1, 1)");
    expect(image.getAttribute("src")).toBe("blob:test-image");
    await click("Baixar imagem");
    expect(download).toHaveBeenCalledOnce();
    await click("Responder");
    expect(reply).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});
