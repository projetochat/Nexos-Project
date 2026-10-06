export const CONNECTION_MESSAGE_VARIABLES = [
  "{{contato}}",
  "{{saudacao}}",
  "{{nome}}",
  "{{telefone}}",
  "{{email}}",
  "{{departamento}}",
  "{{cliente}}",
  "{{empresa}}",
  "{{instancia}}",
];

const CONNECTION_MESSAGE_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  "{{saudacao}}": "Bom dia, Boa tarde e Boa noite conforme o fuso horário da instância.",
  "{{contato}}": "Nome do contato (equivalente a {{nome}}).",
  "{{nome}}": "Nome do contato.",
  "{{telefone}}": "Telefone do contato.",
  "{{email}}": "E-mail do contato.",
  "{{instancia}}": "Instância da conversa.",
  "{{cliente}}": "Cliente do contato.",
  "{{empresa}}": "Empresa do contato (equivalente a {{cliente}}).",
  "{{departamento}}": "Departamento do contato.",
};

export function mergeMessageVariables(
  baseTokens: string[],
  customFields: Array<{ label: string; variableKey: string }>,
) {
  const variables = baseTokens.map((token) => ({
    token,
    description: CONNECTION_MESSAGE_VARIABLE_DESCRIPTIONS[token] ?? "Variável disponível.",
  }));
  const knownTokens = new Set(baseTokens);

  customFields.forEach((field) => {
    const token = field.variableKey ? `{{${field.variableKey}}}` : null;
    if (!token || knownTokens.has(token)) return;
    knownTokens.add(token);
    variables.push({ token, description: `Campo adicional: ${field.label}.` });
  });

  return variables;
}
