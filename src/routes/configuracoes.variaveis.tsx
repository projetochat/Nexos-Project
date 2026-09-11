import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Card, Button } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/variaveis")({ component: VariablesSettingsPage });

const VARIABLES = [
  ["{{cumprimento}}", "Saudação adequada ao horário do envio."],
  ["{{nome}}", "Nome do contato."],
  ["{{telefone}}", "Telefone do contato."],
  ["{{email}}", "E-mail do contato."],
  ["{{departamento}}", "Departamento da conversa."],
  ["{{cliente}}", "Empresa vinculada ao contato."],
  ["{{instancia}}", "Instância da conversa."],
] as const;

function VariablesSettingsPage() {
  const copy = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    toast.success("Variável copiada.");
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Variáveis</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Use estas variáveis em mensagens rápidas, saudações e mensagens de ausência.
      </p>
      <Card className="mt-4 divide-y divide-border overflow-hidden p-0">
        {VARIABLES.map(([token, description]) => (
          <div key={token} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <code className="rounded bg-surface-2 px-2 py-1 font-mono text-sm text-foreground">{token}</code>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => void copy(token)} title="Copiar variável">
              <Copy className="h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
