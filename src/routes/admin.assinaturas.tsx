import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Badge, Card, Input, SectionHeader } from "@/components/ui-kit";
import { fmtDate } from "@/lib/format";
import { platformApi, type PlatformSubscription } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/assinaturas")({
  head: () => ({ meta: [{ title: "Assinaturas · Nexo Admin" }] }),
  component: AssinaturasAdmin,
});

function AssinaturasAdmin() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<PlatformSubscription[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    platformApi
      .subscriptions({ pageSize: 50 })
      .then((data) => setRows(data.items))
      .catch((err) => setError((err as Error).message));
  }, []);
  const filtered = rows.filter((row) =>
    `${row.tenant.name} ${row.tenant.slug} ${row.plan.name}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );

  return (
    <AdminContainer>
      <SectionHeader
        title="Assinaturas"
        subtitle="Operações administrativas. Sem cobrança recorrente automática nesta sprint."
      />
      <Card>
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar assinatura..."
            className="pl-9"
          />
        </div>
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Tenant</th>
                <th className="pb-2">Plano</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Fim do período</th>
                <th className="pb-2">Cancelamento</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60 hover:bg-surface-1">
                  <td className="py-3">
                    <div className="font-medium">{row.tenant.name}</div>
                    <div className="text-xs text-muted-foreground">{row.tenant.slug}</div>
                  </td>
                  <td className="py-3">{row.plan.name}</td>
                  <td className="py-3">
                    <Badge tone={row.status === "ACTIVE" ? "success" : "warning"}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-xs">
                    {fmtDate(new Date(row.currentPeriodEnd).getTime())}
                  </td>
                  <td className="py-3 text-xs">
                    {row.cancelAtPeriodEnd ? "No fim do período" : "Não agendado"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminContainer>
  );
}
