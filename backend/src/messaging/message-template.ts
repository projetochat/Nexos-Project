import { formatInstantInTimezone, localDateTimeParts } from "./message-local-time";

const NATIVE_VARIABLE_KEYS = new Set([
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
]);
const LEGACY_STOP_WORDS = new Set([
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

export type TemplateCustomField = {
  label?: string | null;
  variableKey?: string | null;
  type?: string | null;
  mask?: string | null;
  value?: string | number | boolean | null;
};

export type TemplateContext = {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  instance?: string | null;
  department?: string | null;
  customer?: string | null;
  /** Values keyed by the persisted technical key. */
  customFields?: Record<string, string | number | boolean | null | undefined>;
  customFieldValues?: TemplateCustomField[];
  now?: Date;
  timezone?: string | null;
};

export class MissingMessageClockError extends Error {
  constructor() {
    super("O instante de envio deve ser informado para resolver variaveis temporais.");
    this.name = "MissingMessageClockError";
  }
}

export function resolveMessageTemplate(text: string, context: TemplateContext = {}) {
  const requestedKeys = new Set(
    Array.from(text.matchAll(/{{\s*([^{}]+?)\s*}}/g), (match) =>
      normalizeWords(match[1] ?? "").join("_"),
    ).filter(Boolean),
  );
  const values: Record<string, string> = {
    contato: context.contactName?.trim() ?? "",
    nome: context.contactName?.trim() ?? "",
    telefone: context.phone?.trim() ?? "",
    email: context.email?.trim() ?? "",
    instancia: context.instance?.trim() ?? "",
    departamento: context.department?.trim() ?? "",
    cliente: context.customer?.trim() ?? "",
    empresa: context.customer?.trim() ?? "",
  };
  for (const [technicalKey, value] of Object.entries(context.customFields ?? {})) {
    const key = normalizeWords(technicalKey).join("_");
    if (key && requestedKeys.has(key) && !NATIVE_VARIABLE_KEYS.has(key)) {
      values[key] = renderUntyped(value);
    }
  }
  const fields = (context.customFieldValues ?? []).map((field) => {
    const officialKey = normalizeWords(field.variableKey ?? "").join("_");
    const labelWords = normalizeWords(field.label ?? "");
    const meaningful = labelWords.filter((word) => !LEGACY_STOP_WORDS.has(word));
    return {
      field,
      officialKey,
      aliases: Array.from(new Set([meaningful.join("_"), labelWords.join("_")])).filter(Boolean),
    };
  });
  const officialKeys = new Set(
    fields
      .map(({ officialKey }) => officialKey)
      .filter((key) => key && !NATIVE_VARIABLE_KEYS.has(key)),
  );
  const aliasUseCount = new Map<string, number>();
  for (const { aliases } of fields) {
    for (const alias of aliases) {
      if (NATIVE_VARIABLE_KEYS.has(alias) || officialKeys.has(alias)) continue;
      aliasUseCount.set(alias, (aliasUseCount.get(alias) ?? 0) + 1);
    }
  }
  for (const { field, officialKey, aliases } of fields) {
    const safeAliases = aliases.filter((alias) => aliasUseCount.get(alias) === 1);
    if (![officialKey, ...safeAliases].some((key) => requestedKeys.has(key))) continue;
    const rendered = renderCustomField(field, context.timezone);
    registerCustomValue(values, officialKey, rendered);
    for (const alias of safeAliases) registerCustomValue(values, alias, rendered);
  }
  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (token, rawKey: string) => {
    const key = normalizeWords(rawKey).join("_");
    if (key === "saudacao" || key === "cumprimento") {
      if (!context.now) throw new MissingMessageClockError();
      return greeting(context.now, context.timezone);
    }
    return key in values ? values[key] : token;
  });
}

function registerCustomValue(values: Record<string, string>, key: string, rendered: string) {
  if (key && !NATIVE_VARIABLE_KEYS.has(key) && !(key in values)) values[key] = rendered;
}

function renderUntyped(value: string | number | boolean | null | undefined) {
  return value === true ? "Sim" : value === false ? "Não" : String(value ?? "").trim();
}

function renderCustomField(field: TemplateCustomField, timezone?: string | null) {
  const value = field.value;
  if (value === null || value === undefined || value === "") return "";
  const type = field.type?.trim().toUpperCase();
  if (type === "CHECKBOX") {
    if (value === true || String(value).trim().toLowerCase() === "true") return "Sim";
    if (value === false || String(value).trim().toLowerCase() === "false") return "Não";
    return "";
  }
  const mask = parseMask(field.mask);
  if (type === "DATE") {
    if (mask?.date?.variant === "datetime") {
      const instant = new Date(String(value));
      return Number.isNaN(instant.getTime())
        ? String(value).trim()
        : formatInstantInTimezone(instant, timezone);
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value).trim();
  }
  if (type === "LIST" && mask?.list?.variant === "multi") {
    return parseMultipleValues(value)
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
  if (!value?.trim()) return null;
  try {
    return JSON.parse(value) as MessageFieldMask;
  } catch {
    return null;
  }
}

function parseMultipleValues(value: string | number | boolean) {
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
    // Legacy values may have been stored as a comma-separated string.
  }
  return source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
}

function greeting(now: Date, timezone?: string | null) {
  const hour = localDateTimeParts(now, timezone).hour;
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
