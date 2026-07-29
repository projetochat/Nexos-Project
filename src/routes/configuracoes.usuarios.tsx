import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Card, Button, Avatar, Badge } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/usuarios")({
  component: UsuariosSettings,
});

const USERS = [
  ["Ana Ribeiro", "ana@nexo.com", "Admin", "brand"],
  ["Pedro Camargo", "pedro@nexo.com", "Supervisor", "info"],
  ["Luiza Prado", "luiza@nexo.com", "Atendente", "default"],
  ["Diego Ramos", "diego@nexo.com", "Atendente", "default"],
] as const;

function UsuariosSettings() {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div>
          <p className="text-sm font-semibold">Usuários</p>
          <p className="text-xs text-muted-foreground">
            Membros com acesso à plataforma.
          </p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="h-3.5 w-3.5" /> Convidar
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {USERS.map(([name, email, role, tone]) => (
          <li key={name} className="flex items-center gap-4 p-4">
            <Avatar name={name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
            <Badge tone={tone as never} dot={false}>{role}</Badge>
            <Button variant="ghost" size="sm">Editar</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
