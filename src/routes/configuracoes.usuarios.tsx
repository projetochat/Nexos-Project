import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Card, Button, Avatar, Badge } from "@/components/ui-kit";
import { organizationApi } from "@/lib/nexos-api";

export const Route = createFileRoute("/configuracoes/usuarios")({
  component: UsuariosSettings,
});

function UsuariosSettings() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["nexos", "users"],
    queryFn: organizationApi.listUsers,
  });

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Usuarios</p>
          <p className="text-xs text-muted-foreground">Membros com acesso a plataforma.</p>
        </div>
        <Button variant="primary" size="sm" className="self-start sm:self-auto">
          <Plus className="h-3.5 w-3.5" /> Convidar
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {isLoading && <li className="p-4 text-sm text-muted-foreground">Carregando...</li>}
        {!isLoading &&
          users.map((membership) => (
            <li
              key={membership.id}
              className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap sm:gap-4"
            >
              <Avatar name={membership.user.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{membership.user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{membership.user.email}</p>
              </div>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                <Badge tone={membership.status === "ACTIVE" ? "brand" : "default"} dot={false}>
                  {membership.role.name}
                </Badge>
                <Button variant="ghost" size="sm">
                  Editar
                </Button>
              </div>
            </li>
          ))}
      </ul>
    </Card>
  );
}
