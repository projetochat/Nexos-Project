import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Receipt, Search } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Badge, Card, Input, SectionHeader } from "@/components/ui-kit";
import { fmtDate, formatCurrency } from "@/lib/format";
import { platformApi, type PlatformInvoice } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro · Nexo Admin" }] }),
  component: FinanceiroAdmin,
});

function FinanceiroAdmin() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<PlatformInvoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    platformApi
      .invoices({ pageSize: 50 })
      .then((data) => setRows(data.items))
      .catch((err) => setError((err as Error).message));
  }, []);

  const filtered = rows.filter((row) =>
    `${row.number} ${row.tenant.name} ${row.tenant.slug}`.toLowerCase().includes(q.toLowerCase()),
  );
  const open = rows.filter((row) => row.status === "OPEN");
  const overdue = rows.filter((row) => row.status === "OVERDUE");

  return (
    <AdminContainer>
      <SectionHeader
        title="Faturas manuais"
        subtitle="Sem gateway de pagamento integrado. Mudanças de status são administrativas e auditadas."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Metric label="Total de faturas" value={rows.length} />
        </Card>
        <Card>
          <Metric
            label="Em aberto"
            value={open.length}
            detail={formatCurrency(open.reduce((sum, item) => sum + item.totalCents / 100, 0))}
            icon={Receipt}
          />
        </Card>
        <Card>
          <Metric
            label="Vencidas"
            value={overdue.length}
            detail={formatCurrency(overdue.reduce((sum, item) => sum + item.totalCents / 100, 0))}
            icon={AlertTriangle}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar fatura..."
            className="pl-9"
          />
        </div>
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Número</th>
                <th className="pb-2">Tenant</th>
                <th className="pb-2">Vencimento</th>
                <th className="pb-2">Valor</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60 hover:bg-surface-1">
                  <td className="py-3 font-mono text-xs">{row.number}</td>
                  <td className="py-3">
                    <div className="font-medium">{row.tenant.name}</div>
                    <div className="text-xs text-muted-foreground">{row.tenant.slug}</div>
                  </td>
                  <td className="py-3 text-xs">{fmtDate(new Date(row.dueAt).getTime())}</td>
                  <td className="py-3 font-mono text-xs">{formatCurrency(row.totalCents / 100)}</td>
                  <td className="py-3">
                    <Badge
                      tone={
                        row.status === "PAID"
                          ? "success"
                          : row.status === "OVERDUE"
                            ? "warning"
                            : "info"
                      }
                    >
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma fatura encontrada.
            </div>
          )}
        </div>
      </Card>
    </AdminContainer>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}
