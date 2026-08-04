import { createFileRoute, Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/admin/suporte")({
  head: () => ({ meta: [{ title: "Suporte · Nexo Admin" }] }),
  component: SuporteAdmin,
});

function SuporteAdmin() {
  return (
    <AdminContainer>
      <SectionHeader
        title="Suporte platform"
        subtitle="Fila central de suporte da plataforma ainda não possui backend dedicado nesta sprint."
      />
      <Card>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-info/15 p-2 text-info">
            <LifeBuoy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Sem fila dedicada</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Esta tela não exibe tickets de demonstração. Use auditoria, tenants e monitoramento
              para suporte operacional até a fila platform dedicada ser implementada.
            </p>
            <Link to="/admin/auditoria" className="mt-4 inline-flex text-sm text-primary">
              Abrir auditoria
            </Link>
          </div>
        </div>
      </Card>
    </AdminContainer>
  );
}
