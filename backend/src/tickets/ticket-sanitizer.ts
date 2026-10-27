import { parseTicketImageReference } from "./ticket-image-reference";
const allowedTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "font",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "s",
  "span",
  "strike",
  "strong",
  "u",
  "ul",
]);
const voidTags = new Set(["br", "img"]);
const blockedTagContent =
  /<\s*(script|style|iframe|object|embed|form|input|svg)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const tagPattern = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
const attrPattern = /([a-zA-Z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

export function sanitizeTicketHtml(input: string | null | undefined) {
  const stripped = (input ?? "").replace(blockedTagContent, "");
  return stripped.replace(tagPattern, (raw, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    if (!allowedTags.has(tag)) return "";
    const closing = raw.startsWith("</");
    if (closing) return voidTags.has(tag) ? "" : `</${tag}>`;
    const safeAttributes = sanitizeAttributes(tag, attrs);
    if (tag === "img" && !safeAttributes.includes("src=")) return "";
    return `<${tag}${safeAttributes ? ` ${safeAttributes}` : ""}>`;
  });
}

export function htmlToText(html: string | null | undefined) {
  return sanitizeTicketHtml(html)
    .replace(/<img\b[^>]*>/gi, " Imagem ")
    .replace(/<br>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizePlainText(value: string | null | undefined, max = 10_000) {
  return Array.from(value ?? "")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join("")
    .trim()
    .slice(0, max);
}

export function sanitizeFileName(value: string | null | undefined) {
  const base = sanitizePlainText(value, 180)
    .replace(/[\\/]/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/[<>:"|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = base.replace(/^[.\-\s]+/, "").replace(/[.\-\s]+$/, "");
  return cleaned || "arquivo";
}

function sanitizeAttributes(tag: string, attrs: string) {
  const safeAttributes: string[] = [];
  const seen = new Set<string>();
  for (const match of attrs.matchAll(attrPattern)) {
    const key = match[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    const safeValue = sanitizeAttribute(tag, key, value);
    if (safeValue !== null) safeAttributes.push(`${key}="${escapeHtmlAttr(safeValue)}"`);
  }
  if (tag === "a") {
    safeAttributes.push('rel="noopener noreferrer"', 'target="_blank"');
  }
  return safeAttributes.join(" ");
}

function sanitizeAttribute(tag: string, key: string, value: string): string | null {
  if (key === "dir" && /^(ltr|rtl)$/i.test(value.trim())) return value.trim().toLowerCase();
  if (key === "align" && /^(left|right|center|justify)$/i.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  if (key === "style") return sanitizeStyle(value);
  if (tag === "font") {
    if (key === "color" && validColor(value)) return value.trim();
    if (key === "face" && /^[\w\s,'-]{1,100}$/u.test(value)) return value.trim();
    if (key === "size" && /^[1-7]$/.test(value.trim())) return value.trim();
  }
  if (tag === "a" && key === "href") return safeLink(value);
  if (tag === "a" && key === "title") return sanitizeAttributeText(value);
  if (tag === "img" && key === "src") return safeImageSource(value);
  if (tag === "img" && (key === "alt" || key === "title")) return sanitizeAttributeText(value);
  return null;
}

function sanitizeStyle(value: string) {
  const declarations: string[] = [];
  for (const declaration of value.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();
    if (safeStyleValue(property, propertyValue)) declarations.push(`${property}: ${propertyValue}`);
  }
  return declarations.length ? declarations.join("; ") : null;
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

function safeLink(value: string) {
  const trimmed = value.trim();
  if (/^(?:mailto:|tel:)/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeImageSource(value: string) {
  const trimmed = value.trim();
  if (trimmed.length > 14_000_000) return null;
  if (parseTicketImageReference(trimmed)) return trimmed;
  return /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)
    ? trimmed
    : null;
}

function sanitizeAttributeText(value: string) {
  return Array.from(value)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("")
    .slice(0, 300);
}

function escapeHtmlAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
