import { messageApi, ticketApi } from "./trixus-api";
import { hydratedTicketImages, parseTicketImageReference } from "./ticket-image-reference";

export function hydrateTicketImages(element: HTMLElement) {
  let disposed = false;
  const images = new Map<HTMLImageElement, { source: string; url?: string }>();
  const release = (image: HTMLImageElement, state: { source: string; url?: string }) => {
    if (state.url) {
      if (image.getAttribute("src") === state.url) image.setAttribute("src", state.source);
      URL.revokeObjectURL(state.url);
    }
    hydratedTicketImages.delete(image);
    images.delete(image);
  };
  const sync = () => {
    for (const [image, state] of images) {
      const source = image.getAttribute("src");
      if (!element.contains(image) || (source !== state.source && source !== state.url))
        release(image, state);
    }
    for (const image of element.querySelectorAll<HTMLImageElement>("img")) {
      if (images.has(image)) continue;
      const source = image.getAttribute("src") ?? "";
      const reference = parseTicketImageReference(source);
      if (!reference) continue;
      const state: { source: string; url?: string } = { source };
      images.set(image, state);
      const body =
        reference.kind === "message"
          ? messageApi.downloadMedia(reference.conversationId, reference.messageId, true)
          : ticketApi.preview(reference.ticketId, reference.attachmentId);
      void body
        .then((blob) => {
          if (
            disposed ||
            images.get(image) !== state ||
            !element.contains(image) ||
            image.getAttribute("src") !== source
          )
            return;
          // Raster images only; never execute SVG/HTML returned by an unexpected endpoint.
          if (!/^image\/(?:png|jpeg|gif|webp)$/i.test(blob.type)) return;
          state.url = URL.createObjectURL(blob);
          hydratedTicketImages.set(image, { source, url: state.url });
          image.setAttribute("src", state.url);
        })
        .catch(() => undefined);
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    for (const [image, state] of images) release(image, state);
  };
}
