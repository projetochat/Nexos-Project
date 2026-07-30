import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Card, Badge, Button } from "@/components/ui-kit";
import { organizationApi } from "@/lib/nexos-api";

export const Route = createFileRoute("/configuracoes/permissoes")({
  component: PermissoesSettings,
});

function PermissoesSettings() {
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["nexos", "roles"],
    queryFn: organizationApi.listRoles,
  });

  if (isLoading)
    return <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>;

  return (
    <div className="space-y-4">
      {roles.map((role) => (
        <Card key={role.id}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge tone={role.system ? "brand" : "info"} dot={false}>
                {role.name}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {role.permissionIds.length} permissoes ativas
              </span>
            </div>
            <Button variant="ghost" size="sm">
              Editar
            </Button>
          </div>
          <ul className="mt-4 grid gap-2 border-t border-border pt-4 md:grid-cols-2">
            {role.permissionIds.map((permission) => (
              <li key={permission} className="flex items-center gap-2 text-sm">
                <Check className="h-3.5 w-3.5 text-success" />
                {permission}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
