const ALLOWED_TAGS = new Set([
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "font",
  "i",
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

const VOID_TAGS = new Set(["br"]);
const DROP_WITH_CONTENT =
  /<(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

export function sanitizeContactCustomFieldHtml(input: string) {
  let html = input.replace(/<!--([\s\S]*?)-->/g, "");
  let previous: string;
  do {
    previous = html;
    html = html.replace(DROP_WITH_CONTENT, "");
  } while (html !== previous);

  return html.replace(/<\/?[a-zA-Z][^>]*>/g, (tag) => sanitizeTag(tag));
}

export function isHtmlContactCustomField(mask: string | null) {
  if (!mask?.trim().startsWith("{")) return false;
  try {
    const parsed = JSON.parse(mask) as { text?: { variant?: unknown } };
    return parsed.text?.variant === "html";
  } catch {
    return false;
  }
}

export function sanitizeContactCustomFieldValueForOutput(
  field: { type: string; mask: string | null },
  value: string | null,
) {
  return typeof value === "string" && field.type === "TEXT" && isHtmlContactCustomField(field.mask)
    ? sanitizeContactCustomFieldHtml(value)
    : value;
}

function sanitizeTag(source: string) {
  const match = source.match(/^<\s*(\/)?\s*([a-zA-Z0-9-]+)/);
  if (!match) return "";
  const closing = Boolean(match[1]);
  const name = match[2].toLowerCase();
  if (!ALLOWED_TAGS.has(name)) return "";
  if (closing) return VOID_TAGS.has(name) ? "" : `</${name}>`;

  const attributes = source.slice(match[0].length, -1);
  const safeAttributes: string[] = [];
  for (const attribute of attributes.matchAll(
    /([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
  )) {
    const key = attribute[1].toLowerCase();
    const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
    const safeValue = sanitizeAttribute(name, key, value);
    if (safeValue !== null) safeAttributes.push(`${key}="${escapeAttribute(safeValue)}"`);
  }
  return `<${name}${safeAttributes.length ? ` ${safeAttributes.join(" ")}` : ""}>`;
}

function sanitizeAttribute(tag: string, key: string, value: string): string | null {
  if (key === "dir" && /^(ltr|rtl)$/i.test(value.trim())) return value.trim().toLowerCase();
  if (key === "style") return sanitizeStyle(value);
  if (tag !== "font") return null;
  if (key === "color" && validColor(value)) return value.trim();
  if (key === "face" && /^[\w\s,'-]{1,100}$/u.test(value)) return value.trim();
  if (key === "size" && /^[1-7]$/.test(value.trim())) return value.trim();
  return null;
}

function sanitizeStyle(value: string) {
  const declarations: string[] = [];
  for (const declaration of value.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();
    if (!safeStyleValue(property, propertyValue)) continue;
    declarations.push(`${property}: ${propertyValue}`);
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

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
