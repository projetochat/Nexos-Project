export type MessageVariableContext = {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  instance?: string | null;
  customer?: string | null;
  department?: string | null;
  /** Values of the contact's configurable fields, keyed by their visible label. */
  customFields?: Record<string, string | boolean | number | null | undefined>;
  now?: Date;
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

/** Uses the same token convention shown in the variable dictionaries. */
export function customFieldVariableKey(label: string) {
  const words = normalizedVariableWords(label);
  const meaningfulWords = words.filter((word) => !VARIABLE_NAME_STOP_WORDS.has(word));
  return (meaningfulWords.length ? meaningfulWords : words).join("_");
}

function normalizedVariableWords(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
}

function greetingFor(now: Date) {
  const hour = now.getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

/** Replaces chat message variables with values from the active conversation. */
export function resolveMessageVariables(text: string, context: MessageVariableContext = {}) {
  const values: Record<string, string> = {
    cumprimento: greetingFor(context.now ?? new Date()),
    nome: context.contactName?.trim() ?? "",
    telefone: context.phone?.trim() ?? "",
    email: context.email?.trim() ?? "",
    instancia: context.instance?.trim() ?? "",
    cliente: context.customer?.trim() ?? "",
    departamento: context.department?.trim() ?? "",
  };

  Object.entries(context.customFields ?? {}).forEach(([label, value]) => {
    const key = customFieldVariableKey(label);
    if (!key) return;
    const renderedValue =
      value === true ? "Sim" : value === false ? "Não" : String(value ?? "").trim();
    values[key] = renderedValue;
    // Also accept a manually typed token that preserves connector words from the field label.
    const literalLabelKey = normalizedVariableWords(label).join("_");
    if (literalLabelKey) values[literalLabelKey] = renderedValue;
  });

  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (token, rawKey: string) => {
    const key = normalizedVariableWords(rawKey).join("_");
    return key in values ? values[key] : token;
  });
}
