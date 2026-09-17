const STOP_WORDS = new Set([
  "de", "do", "dos", "da", "das", "o", "a", "os", "as", "um", "uns", "uma", "umas", "e", "ou",
]);

type TemplateContext = {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  instance?: string | null;
  department?: string | null;
  customFields?: Record<string, string | number | boolean | null | undefined>;
  now?: Date;
};

export function resolveMessageTemplate(text: string, context: TemplateContext = {}) {
  const values: Record<string, string> = {
    cumprimento: greeting(context.now ?? new Date()),
    nome: context.contactName?.trim() ?? "",
    telefone: context.phone?.trim() ?? "",
    email: context.email?.trim() ?? "",
    instancia: context.instance?.trim() ?? "",
    departamento: context.department?.trim() ?? "",
  };
  for (const [label, value] of Object.entries(context.customFields ?? {})) {
    const words = normalizeWords(label);
    const key = (words.filter((word) => !STOP_WORDS.has(word)).length
      ? words.filter((word) => !STOP_WORDS.has(word))
      : words
    ).join("_");
    const rendered = value === true ? "Sim" : value === false ? "Não" : String(value ?? "").trim();
    if (key) values[key] = rendered;
    const literalKey = words.join("_");
    if (literalKey) values[literalKey] = rendered;
  }
  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (token, rawKey: string) => {
    const key = normalizeWords(rawKey).join("_");
    return key in values ? values[key] : token;
  });
}

function normalizeWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
}

function greeting(now: Date) {
  const hour = now.getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
