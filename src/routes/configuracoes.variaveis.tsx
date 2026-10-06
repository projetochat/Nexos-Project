import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Card, Button } from "@/components/ui-kit";
import { crmApi } from "@/lib/trixus-api";
import {
  CONNECTION_MESSAGE_VARIABLES,
  mergeMessageVariables,
} from "@/lib/message-variable-options";

export const Route = createFileRoute("/configuracoes/variaveis")({
  component: VariablesSettingsPage,
});

function VariablesSettingsPage() {
  const { data: customFields = [], isLoading: loadingCustomFields } = useQuery({
    queryKey: ["trixus", "contact-custom-fields"],
    queryFn: crmApi.listContactCustomFields,
  });
  const variables = React.useMemo(
    () => mergeMessageVariables(CONNECTION_MESSAGE_VARIABLES, customFields),
    [customFields],
  );

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
