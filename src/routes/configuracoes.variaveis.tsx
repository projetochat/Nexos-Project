import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Card, Button } from "@/components/ui-kit";
import { crmApi, type ApiContactCustomField } from "@/lib/trixus-api";

export const Route = createFileRoute("/configuracoes/variaveis")({ component: VariablesSettingsPage });

const BASE_VARIABLES = [
  ["{{cumprimento}}", "Saudação adequada ao horário do envio."],
  ["{{nome}}", "Nome do contato."],
  ["{{telefone}}", "Telefone do contato."],
  ["{{email}}", "E-mail do contato."],
  ["{{departamento}}", "Departamento da conversa."],
  ["{{cliente}}", "Empresa vinculada ao contato."],
  ["{{instancia}}", "Instância da conversa."],
] as const;

type MessageVariable = { token: string; description: string };

function VariablesSettingsPage() {
  const { data: customFields = [], isLoading: loadingCustomFields } = useQuery({
    queryKey: ["trixus", "contact-custom-fields"],
    queryFn: crmApi.listContactCustomFields,
  });
  const variables = React.useMemo(() => mergeVariables(customFields), [customFields]);

  const copy = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    toast.success("Variável copiada.");
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Variáveis</h2>
      <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
        Use estas variáveis em mensagens rápidas, saudações e mensagens de ausência.
      </p>
      <Card padding={false} className="mt-4 divide-y divide-border overflow-hidden">
        {variables.map(({ token, description }) => (
          <div
            key={token}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:px-4"
          >
            <div className="min-w-0">
              <code className="inline-block max-w-full break-all rounded bg-surface-2 px-2 py-1 font-mono text-sm text-foreground">
                {token}
              </code>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void copy(token)}
              title="Copiar variável"
              className="shrink-0 self-center"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
        ))}
      </Card>
      {loadingCustomFields && (
        <p className="mt-3 text-xs text-muted-foreground">Atualizando campos adicionais...</p>
      )}
    </div>
  );
}

function mergeVariables(customFields: ApiContactCustomField[]) {
  const variables: MessageVariable[] = BASE_VARIABLES.map(([token, description]) => ({
    token,
    description,
  }));
  const knownTokens = new Set(variables.map((variable) => variable.token));

  customFields.forEach((field) => {
    const token = customFieldVariableToken(field.label);
    if (!token || knownTokens.has(token)) return;
    knownTokens.add(token);
    variables.push({ token, description: `Campo adicional: ${field.label}.` });
  });

  return variables;
}

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

function customFieldVariableToken(label: string) {
  const words = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
  const meaningfulWords = words.filter((word) => !VARIABLE_NAME_STOP_WORDS.has(word));
  const key = (meaningfulWords.length ? meaningfulWords : words).join("_");
  return key ? `{{${key}}}` : null;
}
