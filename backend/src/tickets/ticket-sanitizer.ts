const allowedTags = new Set(["p", "br", "strong", "em", "u", "ul", "ol", "li", "blockquote", "a"]);
const voidTags = new Set(["br"]);
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
    if (tag !== "a") return voidTags.has(tag) ? `<${tag}>` : `<${tag}>`;
    const href = safeHref(attrs);
    if (!href) return '<a rel="noopener noreferrer">';
    return `<a href="${escapeHtmlAttr(href)}" rel="noopener noreferrer" target="_blank">`;
  });
}

export function htmlToText(html: string | null | undefined) {
  return sanitizeTicketHtml(html)
    .replace(/<br>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
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

function safeHref(attrs: string) {
  for (const match of attrs.matchAll(attrPattern)) {
    if (match[1].toLowerCase() !== "href") continue;
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    } catch {
      return null;
    }
  }
  return null;
}

function escapeHtmlAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
