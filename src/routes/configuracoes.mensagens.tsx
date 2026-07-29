import { createFileRoute } from "@tanstack/react-router";
import { Plus, MessageSquare } from "lucide-react";
import { Card, Button, Badge } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/mensagens")({
  component: MensagensSettings,
});

const AUTOS = [
  { name: "Boas-vindas", trigger: "Novo contato", tone: "success", enabled: true },
  { name: "Fora do horário", trigger: "Fora do expediente", tone: "warning", enabled: true },
  { name: "Encerramento", trigger: "Conversa resolvida", tone: "info", enabled: true },
  { name: "Ausência de resposta", trigger: "Após 10 min sem resposta", tone: "destructive", enabled: false },
];

function MensagensSettings() {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div>
          <p className="text-sm font-semibold">Mensagens automáticas</p>
          <p className="text-xs text-muted-foreground">
            Respostas disparadas por gatilhos operacionais.
          </p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="h-3.5 w-3.5" /> Nova regra
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {AUTOS.map((a) => (
          <li key={a.name} className="flex items-center gap-4 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-xs text-muted-foreground">Gatilho: {a.trigger}</p>
            </div>
            <Badge tone={a.tone as never}>{a.enabled ? "Ativa" : "Inativa"}</Badge>
            <Button variant="ghost" size="sm">Editar</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
