import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, Play, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import { Badge, Button, Card, Input, SectionHeader } from "@/components/ui-kit";
import { platformApi, type PlatformTenant } from "@/lib/nexos-api";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/admin/empresas")({
  head: () => ({ meta: [{ title: "Tenants · Nexo Admin" }] }),
  component: EmpresasSaaS,
});

function EmpresasSaaS() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<PlatformTenant[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    platformApi
      .tenants({ q, pageSize: 50 })
      .then((data) => {
        setRows(data.items);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [q]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function suspend(tenant: PlatformTenant) {
    await platformApi.suspendTenant(tenant.id, "Suspensao administrativa Sprint 13");
    toast.success("Tenant suspenso");
    load();
  }

  async function reactivate(tenant: PlatformTenant) {
    await platformApi.reactivateTenant(tenant.id, "Reativacao administrativa Sprint 13");
    toast.success("Tenant reativado");
    load();
  }

  return (
    <AdminContainer>
      <SectionHeader
        title="Tenants"
        subtitle="Gestão real de organizações, planos, status e limites via Nexos API."
      />
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar tenant..."
              className="pl-9"
            />
          </div>
          <Button variant="secondary" onClick={load}>
            Atualizar
          </Button>
        </div>
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Tenant</th>
                <th className="pb-2">Plano</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Usuários</th>
                <th className="pb-2">Connections</th>
                <th className="pb-2">Criado</th>
                <th className="pb-2 text-right">Governança</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tenant) => (
                <tr key={tenant.id} className="border-b border-border/60 hover:bg-surface-1">
                  <td className="py-3">
                    <div className="font-medium">{tenant.name}</div>
                    <div className="text-xs text-muted-foreground">{tenant.slug}</div>
                  </td>
                  <td className="py-3">{tenant.plan?.name ?? "Sem plano"}</td>
                  <td className="py-3">
                    <TenantStatus status={tenant.status} />
                  </td>
                  <td className="py-3 font-mono text-xs">{tenant.activeUsers}</td>
                  <td className="py-3 font-mono text-xs">{tenant.connections}</td>
                  <td className="py-3 text-xs text-muted-foreground">
                    {fmtDate(new Date(tenant.createdAt).getTime())}
                  </td>
                  <td className="py-3 text-right">
                    {tenant.status === "SUSPENDED" ? (
                      <Button size="sm" variant="secondary" onClick={() => reactivate(tenant)}>
                        <Play className="h-3.5 w-3.5" /> Reativar
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => suspend(tenant)}>
                        <Ban className="h-3.5 w-3.5" /> Suspender
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum tenant encontrado.
            </div>
          )}
        </div>
      </Card>
    </AdminContainer>
  );
}

function TenantStatus({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "success"
      : status === "TRIAL"
        ? "info"
        : status === "SUSPENDED"
          ? "warning"
          : "default";
  return <Badge tone={tone}>{status}</Badge>;
}
