import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Card, Badge, Button } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/permissoes")({
  component: PermissoesSettings,
});

const ROLES = [
  { name: "Admin", tone: "brand", perms: ["Todos os módulos", "Gerenciar usuários", "Configurações", "Faturamento"] },
  { name: "Supervisor", tone: "info", perms: ["Ver todas conversas", "Transferir atendimentos", "Relatórios completos"] },
  { name: "Atendente", tone: "default", perms: ["Conversas atribuídas", "Notas internas", "Etiquetas"] },
];

function PermissoesSettings() {
  return (
    <div className="space-y-4">
      {ROLES.map((r) => (
        <Card key={r.name}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge tone={r.tone as never} dot={false}>{r.name}</Badge>
              <span className="text-xs text-muted-foreground">
                {r.perms.length} permissões ativas
              </span>
            </div>
            <Button variant="ghost" size="sm">Editar</Button>
          </div>
          <ul className="mt-4 grid gap-2 border-t border-border pt-4 md:grid-cols-2">
            {r.perms.map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm">
                <Check className="h-3.5 w-3.5 text-success" />
                {p}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
