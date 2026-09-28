import { customFieldVariableKey } from "./message-variables";

export const CONNECTION_MESSAGE_VARIABLES = [
  "{{cumprimento}}",
  "{{nome}}",
  "{{telefone}}",
  "{{email}}",
  "{{departamento}}",
  "{{cliente}}",
  "{{instancia}}",
];

const CONNECTION_MESSAGE_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  "{{cumprimento}}": "Bom dia, Boa tarde e Boa noite. Será apresentado conforme a hora do dia.",
  "{{nome}}": "Nome do contato.",
  "{{telefone}}": "Telefone do contato.",
  "{{email}}": "E-mail do contato.",
  "{{instancia}}": "Instância da conversa.",
  "{{cliente}}": "Cliente do contato.",
  "{{departamento}}": "Departamento do contato.",
};

export function mergeMessageVariables(
  baseTokens: string[],
  customFields: Array<{ label: string }>,
) {
  const variables = baseTokens.map((token) => ({
    token,
    description: CONNECTION_MESSAGE_VARIABLE_DESCRIPTIONS[token] ?? "Variável disponível.",
  }));
  const knownTokens = new Set(baseTokens);

  customFields.forEach((field) => {
    const key = customFieldVariableKey(field.label);
    const token = key ? `{{${key}}}` : null;
    if (!token || knownTokens.has(token)) return;
    knownTokens.add(token);
    variables.push({ token, description: `Campo adicional: ${field.label}.` });
  });

  return variables;
}
