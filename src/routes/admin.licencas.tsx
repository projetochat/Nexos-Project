import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Badge, Card, SectionHeader } from "@/components/ui-kit";
import { platformApi, type PlatformTenant } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/licencas")({
  head: () => ({ meta: [{ title: "Licenças · Nexo Admin" }] }),
  component: LicencasAdmin,
});

function LicencasAdmin() {
  const [rows, setRows] = React.useState<PlatformTenant[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    platformApi
      .tenants({ pageSize: 50 })
      .then((data) => setRows(data.items))
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <AdminContainer>
      <SectionHeader
        title="Licenças"
        subtitle="Resumo real de plano, assinatura e uso por tenant. Chaves secretas não são exibidas."
      />
      <Card>
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Tenant</th>
                <th className="pb-2">Plano</th>
                <th className="pb-2">Assinatura</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Connections</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tenant) => (
                <tr key={tenant.id} className="border-b border-border/60 hover:bg-surface-1">
                  <td className="py-3">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> {tenant.name}
                    </span>
                    <div className="text-xs text-muted-foreground">{tenant.slug}</div>
                  </td>
                  <td className="py-3">{tenant.plan?.name ?? "Sem plano"}</td>
                  <td className="py-3">{tenant.subscriptionStatus ?? "Sem assinatura"}</td>
                  <td className="py-3">
                    <Badge tone={tenant.status === "ACTIVE" ? "success" : "warning"}>
                      {tenant.status}
                    </Badge>
                  </td>
                  <td className="py-3 font-mono text-xs">{tenant.connections}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminContainer>
  );
}
