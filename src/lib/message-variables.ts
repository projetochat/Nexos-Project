export type MessageVariableField = {
  label: string;
  variableKey?: string | null;
  type?: string | null;
  mask?: string | null;
  value?: string | boolean | number | null;
};

export type MessageVariableContext = {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  instance?: string | null;
  customer?: string | null;
  department?: string | null;
  customFields?: Record<string, string | boolean | number | null | undefined>;
  customFieldValues?: MessageVariableField[];
  now?: Date;
  timezone?: string | null;
};

const VARIABLE_NAME_STOP_WORDS = new Set([
  "de",
  "do",
  "dos",
  "da",
  "das",
  "o",
  "a",
  "os",
  "as",
  "um",
  "uns",
  "uma",
  "umas",
  "e",
  "ou",
]);

export const NATIVE_MESSAGE_VARIABLE_KEYS = [
  "cumprimento",
  "saudacao",
  "contato",
  "nome",
  "telefone",
  "email",
  "instancia",
  "departamento",
  "cliente",
  "empresa",
] as const;
export const NATIVE_CONTACT_FIELD_NAMES = [
  "nome",
  "whatsapp",
  "telefone",
  "e-mail",
  "email",
  "instância",
  "instâncias",
  "empresa",
  "empresa do contato",
  "cliente",
  "departamento",
  "departamento do contato",
  "perfil",
  "perfil do contato",
  "etiqueta",
  "etiquetas",
] as const;
const NATIVE_MESSAGE_VARIABLE_KEY_SET = new Set<string>(NATIVE_MESSAGE_VARIABLE_KEYS);
const NATIVE_CONTACT_FIELD_NAME_SET = new Set<string>(NATIVE_CONTACT_FIELD_NAMES);

export function normalizeCustomFieldName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

export function isNativeContactFieldName(value: string) {
  return NATIVE_CONTACT_FIELD_NAME_SET.has(normalizeCustomFieldName(value));
}

/** Preview only; the backend persists and owns the actual technical key. */
export function previewCustomFieldVariableKey(label: string) {
  return customFieldVariableKey(label);
}

export function customFieldVariableKey(label: string) {
  const words = normalizedVariableWords(label);
  const meaningfulWords = words.filter((word) => !VARIABLE_NAME_STOP_WORDS.has(word));
  return (meaningfulWords.length ? meaningfulWords : words).join("_");
}

function normalizedVariableWords(label: string) {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
}

/** Preview resolver. The backend repeats resolution at enqueue time as the source of truth. */
export function resolveMessageVariables(text: string, context: MessageVariableContext = {}) {
  const requestedKeys = new Set(
    Array.from(text.matchAll(/{{\s*([^{}]+?)\s*}}/g), (match) =>
      normalizedVariableWords(match[1] ?? "").join("_"),
    ).filter(Boolean),
  );
  const values: Record<string, string> = {
    contato: context.contactName?.trim() ?? "",
    nome: context.contactName?.trim() ?? "",
    telefone: context.phone?.trim() ?? "",
    email: context.email?.trim() ?? "",
    instancia: context.instance?.trim() ?? "",
    cliente: context.customer?.trim() ?? "",
    empresa: context.customer?.trim() ?? "",
    departamento: context.department?.trim() ?? "",
  };
  Object.entries(context.customFields ?? {}).forEach(([technicalKey, value]) => {
    const key = normalizedVariableWords(technicalKey).join("_");
    if (key && requestedKeys.has(key) && !NATIVE_MESSAGE_VARIABLE_KEY_SET.has(key)) {
      values[key] = renderUntyped(value);
    }
  });
  const fields = (context.customFieldValues ?? []).map((field) => {
    const officialKey = normalizedVariableWords(field.variableKey ?? "").join("_");
    const labelWords = normalizedVariableWords(field.label);
    const meaningful = labelWords.filter((word) => !VARIABLE_NAME_STOP_WORDS.has(word));
    return {
      field,
      officialKey,
      aliases: Array.from(new Set([meaningful.join("_"), labelWords.join("_")])).filter(Boolean),
    };
  });
  const officialKeys = new Set(
    fields
      .map(({ officialKey }) => officialKey)
      .filter((key) => key && !NATIVE_MESSAGE_VARIABLE_KEY_SET.has(key)),
  );
  const aliasUseCount = new Map<string, number>();
  for (const { aliases } of fields) {
    for (const alias of aliases) {
      if (NATIVE_MESSAGE_VARIABLE_KEY_SET.has(alias) || officialKeys.has(alias)) continue;
      aliasUseCount.set(alias, (aliasUseCount.get(alias) ?? 0) + 1);
    }
  }
  for (const { field, officialKey, aliases } of fields) {
    const safeAliases = aliases.filter((alias) => aliasUseCount.get(alias) === 1);
    if (![officialKey, ...safeAliases].some((key) => requestedKeys.has(key))) continue;
    const rendered = renderField(field, context.timezone);
    addField(values, officialKey, rendered);
    for (const alias of safeAliases) addField(values, alias, rendered);
  }
  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (token, rawKey: string) => {
    const key = normalizedVariableWords(rawKey).join("_");
    if (key === "saudacao" || key === "cumprimento") {
      if (!context.now) throw new Error("O instante de envio deve ser informado.");
      return greetingFor(context.now, context.timezone);
    }
    return key in values ? values[key] : token;
  });
}

function addField(values: Record<string, string>, variableKey: string | null, rendered: string) {
  const key = normalizedVariableWords(variableKey ?? "").join("_");
  if (key && !NATIVE_MESSAGE_VARIABLE_KEY_SET.has(key) && !(key in values)) {
    values[key] = rendered;
  }
}

function renderUntyped(value: string | boolean | number | null | undefined) {
  return value === true ? "Sim" : value === false ? "Não" : String(value ?? "").trim();
}

function renderField(field: MessageVariableField, timezone?: string | null) {
  const value = field.value;
  if (value === null || value === undefined || value === "") return "";
  const type = field.type?.toUpperCase();
  if (type === "CHECKBOX") {
    if (value === true || String(value).toLowerCase() === "true") return "Sim";
    if (value === false || String(value).toLowerCase() === "false") return "Não";
    return "";
  }
  const mask = parseMask(field.mask);
  if (type === "DATE") {
    if (mask?.date?.variant === "datetime") {
      const instant = new Date(String(value));
      return Number.isNaN(instant.getTime())
        ? String(value).trim()
        : formatInstant(instant, timezone);
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value).trim();
  }
  if (type === "LIST" && mask?.list?.variant === "multi") {
    return parseList(value)
      .map((item) => `- ${item}`)
      .join("\n");
  }
  return renderUntyped(value);
}

type MessageFieldMask = {
  date?: { variant?: string };
  list?: { variant?: string };
};

function parseMask(value: string | null | undefined): MessageFieldMask | null {
  try {
    return value ? (JSON.parse(value) as MessageFieldMask) : null;
  } catch {
    return null;
  }
}

function parseList(value: string | boolean | number) {
  const source = String(value).trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed))
      return parsed
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean);
  } catch {
    // Legacy values may be comma-separated.
  }
  return source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function requireTimezone(timezone: string | null | undefined) {
  const value = timezone?.trim();
  if (!value) throw new Error("Time zone da instância ausente ou inválido.");
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(0);
  } catch {
    throw new Error("Time zone da instância ausente ou inválido.");
  }
  return value;
}

function localParts(at: Date, timezone: string | null | undefined) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: requireTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: get("minute"),
  };
}

function greetingFor(now: Date, timezone: string | null | undefined) {
  const hour = localParts(now, timezone).hour;
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

function formatInstant(at: Date, timezone: string | null | undefined) {
  const local = localParts(at, timezone);
  return `${local.day}/${local.month}/${local.year} ${String(local.hour).padStart(2, "0")}:${local.minute}`;
}
