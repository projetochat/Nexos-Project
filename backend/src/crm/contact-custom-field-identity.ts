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

const NATIVE_KEY_SET = new Set<string>(NATIVE_MESSAGE_VARIABLE_KEYS);
const NATIVE_NAME_SET = new Set<string>(NATIVE_CONTACT_FIELD_NAMES);
const VARIABLE_KEY_STOP_WORDS = new Set([
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

export function normalizeContactCustomFieldName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

export function contactCustomFieldVariableKey(value: string) {
  const words = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
  const meaningful = words.filter((word) => !VARIABLE_KEY_STOP_WORDS.has(word));
  return (meaningful.length ? meaningful : words).join("_");
}

export function isNativeMessageVariableKey(value: string) {
  return NATIVE_KEY_SET.has(value);
}

export function isNativeContactFieldName(value: string) {
  return NATIVE_NAME_SET.has(normalizeContactCustomFieldName(value));
}
