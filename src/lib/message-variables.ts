export type MessageVariableContext = {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  instance?: string | null;
  customer?: string | null;
  department?: string | null;
  now?: Date;
};

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

  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (token, rawKey: string) => {
    const key = rawKey.trim().toLocaleLowerCase("pt-BR");
    return key in values ? values[key] : token;
  });
}
