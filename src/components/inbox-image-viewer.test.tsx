// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InboxImageViewer } from "./inbox-image-viewer";
import { messageApi, type ApiMessage } from "@/lib/trixus-api";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

it("hides the viewing controls on mobile and keeps image actions below the top-right close button", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await React.act(() =>
      root.render(
        <InboxImageViewer
          src="blob:test-image"
          message={{ id: "image1", media_data: { file_name: "foto.jpg" } } as ApiMessage}
          onClose={vi.fn()}
          onDownload={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );

    const viewingControls = document.querySelector<HTMLElement>(
      '[aria-label="Ajustar visualização"]',
    )!;
    const imageActions = document.querySelector<HTMLElement>('[aria-label="Ações da imagem"]')!;
    const closeWrapper = document.querySelector('[aria-label="Fechar"]')!.parentElement!;

    expect(viewingControls.className).toContain("hidden");
    expect(viewingControls.className).toContain("sm:flex");
    expect(imageActions.className).toContain("pt-12");
    expect(imageActions.className).toContain("sm:pt-0");
    expect(closeWrapper.className).toContain("absolute");
    expect(closeWrapper.className).toContain("right-0");
    expect(closeWrapper.className).toContain("top-0");
    expect(closeWrapper.className).toContain("sm:static");
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});

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
    stage.hasPointerCapture = vi.fn(() => true);
    stage.releasePointerCapture = vi.fn();
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

it("closes when clicking outside the displayed image", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const close = vi.fn();
  try {
    await React.act(() =>
      root.render(
        <InboxImageViewer
          src="blob:test-image"
          message={{ id: "image1", media_data: { file_name: "foto.jpg" } } as ApiMessage}
          onClose={close}
          onDownload={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );
    const stage = document.querySelector<HTMLElement>('[data-testid="image-stage"]')!;
    const image = stage.querySelector("img")!;
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
      bottom: 200,
      height: 100,
      left: 100,
      right: 200,
      top: 100,
      width: 100,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });
    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: 50, clientY: 50 });
    await React.act(() => stage.dispatchEvent(event));
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});

it("navigates through the conversation images using arrows and thumbnails", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const first = {
    id: "image1",
    conversation_id: "conversation1",
    type: "image",
    media_data: { file_name: "primeira.jpg" },
  } as ApiMessage;
  const second = {
    id: "image2",
    conversation_id: "conversation1",
    type: "image",
    media_data: { file_name: "segunda.jpg" },
  } as ApiMessage;
  const downloadMedia = vi.spyOn(messageApi, "downloadMedia").mockResolvedValue(new Blob(["x"]));
  const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:thumbnail");
  try {
    await React.act(() =>
      root.render(
        <InboxImageViewer
          src="blob:primeira"
          message={first}
          images={[first, second]}
          onClose={vi.fn()}
          onDownload={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );
    await React.act(async () => {
      await Promise.resolve();
    });
    await React.act(() =>
      (document.querySelector('[aria-label="Próxima foto"]') as HTMLButtonElement).click(),
    );
    expect(document.querySelector('img[alt="segunda.jpg"]')).not.toBeNull();
    expect(downloadMedia).toHaveBeenCalledWith("conversation1", "image2", true);
    expect(createObjectUrl).toHaveBeenCalled();
  } finally {
    downloadMedia.mockRestore();
    createObjectUrl.mockRestore();
    await React.act(() => root.unmount());
    container.remove();
  }
});

it.each(["mouse", "touch"])(
  "swipes at normal size and only pans after zoom with %s",
  async (pointerType) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const images = [1, 2].map(
      (number) =>
        ({
          id: `img${number}`,
          conversation_id: "c1",
          type: "image",
          media_data: { file_name: `${number}.jpg` },
        }) as ApiMessage,
    );
    const download = vi.spyOn(messageApi, "downloadMedia").mockResolvedValue(new Blob(["image"]));
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:next");
    try {
      await React.act(() =>
        root.render(
          <InboxImageViewer
            src="blob:first"
            message={images[0]}
            images={images}
            onClose={vi.fn()}
            onDownload={vi.fn()}
          />,
        ),
      );
      const stage = document.querySelector<HTMLElement>('[data-testid="image-stage"]')!;
      stage.setPointerCapture = vi.fn();
      stage.hasPointerCapture = vi.fn(() => true);
      stage.releasePointerCapture = vi.fn();
      const pointer = (type: string, x: number, y: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 1, pointerType, button: 0, clientX: x, clientY: y });
        stage.dispatchEvent(event);
      };
      const swipe = async (x: number, y = 0) => {
        await React.act(() => {
          pointer("pointerdown", 150, 100);
          pointer("pointermove", 150 + x, 100 + y);
          pointer("pointerup", 150 + x, 100 + y);
        });
      };
      const active = () => stage.querySelector("img")!;
      await swipe(-15);
      expect(active().alt).toBe("1.jpg");
      await swipe(-70, 100);
      expect(active().alt).toBe("1.jpg");
      await swipe(-100);
      expect(active().alt).toBe("2.jpg");
      expect(active().style.transform).toContain("translate(0px, 0px)");
      await swipe(-100);
      expect(active().alt).toBe("2.jpg");
      await React.act(() =>
        (document.querySelector('[aria-label="Aumentar zoom"]') as HTMLButtonElement).click(),
      );
      await swipe(100);
      expect(active().alt).toBe("2.jpg");
      expect(active().style.transform).toContain("translate(100px, 0px)");
      await React.act(() =>
        (document.querySelector('[aria-label="Diminuir zoom"]') as HTMLButtonElement).click(),
      );
      expect(active().style.transform).toContain("translate(0px, 0px)");
      await swipe(100);
      expect(active().alt).toBe("1.jpg");
      await React.act(() => {
        pointer("pointerdown", 150, 100);
        pointer("pointermove", 20, 100);
        pointer("pointercancel", 20, 100);
      });
      expect(active().alt).toBe("1.jpg");
    } finally {
      await React.act(() => root.unmount());
      host.remove();
      download.mockRestore();
      create.mockRestore();
    }
  },
);
