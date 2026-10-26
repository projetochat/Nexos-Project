import { hydratedTicketImages, parseTicketImageReference } from "./ticket-image-reference";
import createDOMPurify from "dompurify";

export const MAX_TICKET_EDITOR_HTML_LENGTH = 15_000_000;
const MAX_PASTED_IMAGE_BYTES = 10 * 1024 * 1024;

export function sanitizeTicketEditorHtml(value: string): string {
  if (typeof window === "undefined") return "";
  const purifier = createDOMPurify(window);
  const sanitized = purifier.sanitize(value.slice(0, MAX_TICKET_EDITOR_HTML_LENGTH), {
    ALLOWED_TAGS: [
      "p",
      "div",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "span",
      "font",
      "img",
    ],
    ALLOWED_ATTR: [
      "href",
      "title",
      "rel",
      "target",
      "color",
      "face",
      "size",
      "align",
      "dir",
      "style",
      "src",
      "alt",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP:
      /^(?:https?:|mailto:|tel:|\/|#|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i,
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  template.content.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const safeStyle = sanitizeStyle(element.getAttribute("style") ?? "");
    if (safeStyle) element.setAttribute("style", safeStyle);
    else element.removeAttribute("style");
  });
  template.content.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    if (!safeImageSource(image.getAttribute("src") ?? "")) image.remove();
  });
  return template.innerHTML;
}

export function writeTicketEditorHtml(editor: HTMLElement, value: string) {
  const safeHtml = sanitizeTicketEditorHtml(value);
  if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;
}

export function readTicketEditorHtml(editor: HTMLElement | null): string {
  if (!editor) return "";
  const copy = editor.cloneNode(true) as HTMLElement;
  const originals = editor.querySelectorAll<HTMLImageElement>("img");
  copy.querySelectorAll<HTMLImageElement>("img").forEach((image, index) => {
    const hydrated = hydratedTicketImages.get(originals[index]);
    if (hydrated && originals[index].getAttribute("src") === hydrated.url) {
      image.setAttribute("src", hydrated.source);
    }
  });
  return sanitizeTicketEditorHtml(copy.innerHTML);
}

export function normalizeTicketEditorHtml(editor: HTMLElement | null): string {
  const safeHtml = readTicketEditorHtml(editor);
  if (editor) writeTicketEditorHtml(editor, safeHtml);
  return safeHtml;
}

export async function ticketEditorClipboardHtml(clipboardData: DataTransfer): Promise<string> {
  const image = Array.from(clipboardData.files).find((file) => file.type.startsWith("image/"));
  const clipboardHtml = clipboardData.getData("text/html");
  const clipboardText = clipboardData.getData("text/plain");
  if (image) {
    if (!/image\/(?:png|jpeg|jpg|gif|webp)/i.test(image.type)) {
      throw new Error("Formato de imagem não suportado.");
    }
    if (image.size > MAX_PASTED_IMAGE_BYTES) {
      throw new Error("A imagem colada deve ter no máximo 10 MB.");
    }
    const source = await readFileAsDataUrl(image);
    return sanitizeTicketEditorHtml(
      `<img src="${source}" alt="${escapeHtml(image.name || "Imagem colada")}">`,
    );
  }
  if (clipboardHtml) return sanitizeTicketEditorHtml(clipboardHtml);
  return escapeHtml(clipboardText).replace(/\r?\n/g, "<br>");
}

export function insertTicketEditorHtml(
  editor: HTMLElement,
  html: string,
  savedRange?: Range | null,
) {
  const selection = window.getSelection();
  const range = savedRange ?? (selection?.rangeCount ? selection.getRangeAt(0) : null);
  if (!selection || !range || !editor.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const fragment = range.createContextualFragment(sanitizeTicketEditorHtml(html));
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) range.setStartAfter(lastNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function sanitizeStyle(value: string) {
  const declarations: string[] = [];
  for (const declaration of value.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();
    if (safeStyleValue(property, propertyValue)) {
      declarations.push(`${property}: ${propertyValue}`);
    }
  }
  return declarations.join("; ");
}

function safeStyleValue(property: string, value: string) {
  if (/url\s*\(|expression\s*\(|@import|\\/i.test(value)) return false;
  if (property === "text-align") return /^(left|right|center|justify|start|end)$/i.test(value);
  if (property === "color" || property === "background-color") return validColor(value);
  if (property === "font-family") return /^[\w\s,'-]{1,100}$/u.test(value);
  if (property === "font-size") {
    return /^(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large)$/i.test(
      value,
    );
  }
  if (property === "font-weight") return /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(value);
  if (property === "font-style") return /^(normal|italic|oblique)$/i.test(value);
  if (property === "text-decoration") {
    return /^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/i.test(
      value,
    );
  }
  return false;
}

function validColor(value: string) {
  const trimmed = value.trim();
  return (
    /^#[0-9a-f]{3,8}$/i.test(trimmed) ||
    /^(?:rgb|rgba|hsl|hsla)\([\d.%\s,]+\)$/i.test(trimmed) ||
    /^[a-z]{1,30}$/i.test(trimmed)
  );
}

function safeImageSource(value: string) {
  const trimmed = value.trim();
  if (trimmed.length > 14_000_000) return false;
  if (parseTicketImageReference(trimmed)) return true;
  return /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem colada."));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
