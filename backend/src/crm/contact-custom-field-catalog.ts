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
  "whatsapp",
  "perfil",
  "etiqueta",
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

export const CONTACT_CUSTOM_FIELD_VARIABLE_KEY_STOP_WORDS = [
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
] as const;

const VARIABLE_KEY_STOP_WORD_SET = new Set<string>(CONTACT_CUSTOM_FIELD_VARIABLE_KEY_STOP_WORDS);

export function normalizeCanonicalContactFieldName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

export function canonicalContactFieldVariableKey(value: string) {
  const words = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
  const meaningful = words.filter((word) => !VARIABLE_KEY_STOP_WORD_SET.has(word));
  return (meaningful.length ? meaningful : words).join("_");
}

export const NATIVE_RESERVED_VARIABLE_KEYS = Array.from(
  new Set([
    ...NATIVE_MESSAGE_VARIABLE_KEYS,
    ...NATIVE_CONTACT_FIELD_NAMES.map(canonicalContactFieldVariableKey),
  ]),
);
