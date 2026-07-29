import DOMPurify from "dompurify";

const allowedTags = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "u",
  "ul",
];

const allowedAttrs = ["alt", "href", "rel", "src", "target", "title"];

export function sanitizeRichTextHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttrs,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["onerror", "onload", "onclick", "style"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpeg|jpg|gif|webp);base64,|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
