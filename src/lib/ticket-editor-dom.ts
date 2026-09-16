import DOMPurify from "dompurify";

export function sanitizeTicketEditorHtml(value: string): string {
  return DOMPurify.sanitize(value, {
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
    ],
    ALLOWED_ATTR: ["href", "title", "color", "face", "size", "align"],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
  });
}

export function writeTicketEditorHtml(editor: HTMLElement, value: string) {
  const safeHtml = sanitizeTicketEditorHtml(value);
  if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;
}

export function readTicketEditorHtml(editor: HTMLElement | null): string {
  return sanitizeTicketEditorHtml(editor?.innerHTML ?? "");
}

// Clipboard markup never enters the live DOM. Attachments use the upload flow.
export function pasteTicketEditorText(editor: HTMLElement, text: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
