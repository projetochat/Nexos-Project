import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge, Button, Input } from "@/components/ui-kit";
import { faturas, tenants } from "@/lib/mock/saas";
import { formatCurrency, fmtDate } from "@/lib/format";
import { Download, Receipt, TrendingUp, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro · Nexo Admin" }] }),
  component: FinanceiroAdmin,
});

function FinanceiroAdmin() {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"all" | "paga" | "aberta" | "vencida">("all");

  const rows = faturas
    .map((f) => ({ ...f, tenant: tenants.find((t) => t.id === f.tenantId)! }))
    .filter((r) => (status === "all" || r.status === status) && (!q || r.tenant.nome.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.emissao - a.emissao);

  const receitaMes = faturas.filter((f) => f.status === "paga" && Date.now() - f.emissao < 30 * 24 * 60 * 60 * 1000).reduce((s, f) => s + f.valor, 0);
  const abertas = faturas.filter((f) => f.status === "aberta");
  const vencidas = faturas.filter((f) => f.status === "vencida");

  return (
    <AdminContainer>
      <SectionHeader
        title="Financeiro"
        subtitle="Faturas, receitas e inadimplência."
        actions={
          <Button variant="secondary" onClick={() => toast.success("Relatório exportado")}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Recebido no mês</div>
              <div className="mt-2 font-mono text-2xl font-semibold">{formatCurrency(receitaMes)}</div>
            </div>
            <div className="rounded-lg bg-success/15 p-2 text-success"><TrendingUp className="h-4 w-4" /></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Faturas em aberto</div>
              <div className="mt-2 font-mono text-2xl font-semibold">{abertas.length}</div>
              <div className="text-xs text-muted-foreground">{formatCurrency(abertas.reduce((s, f) => s + f.valor, 0))}</div>
            </div>
            <div className="rounded-lg bg-info/15 p-2 text-info"><Receipt className="h-4 w-4" /></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Vencidas</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-warning">{vencidas.length}</div>
              <div className="text-xs text-muted-foreground">{formatCurrency(vencidas.reduce((s, f) => s + f.valor, 0))}</div>
            </div>
            <div className="rounded-lg bg-warning/15 p-2 text-warning"><AlertTriangle className="h-4 w-4" /></div>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa…" className="pl-9" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as never)} className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
            <option value="all">Todas</option>
            <option value="paga">Pagas</option>
            <option value="aberta">Abertas</option>
            <option value="vencida">Vencidas</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Nº</th>
                <th className="pb-2">Empresa</th>
                <th className="pb-2">Emissão</th>
                <th className="pb-2">Vencimento</th>
                <th className="pb-2">Valor</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 30).map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-surface-1">
                  <td className="py-2.5 font-mono text-xs">{r.numero}</td>
                  <td className="py-2.5 font-medium">{r.tenant.nome}</td>
                  <td className="py-2.5 text-xs text-muted-foreground">{fmtDate(r.emissao)}</td>
                  <td className="py-2.5 text-xs">{fmtDate(r.vencimento)}</td>
                  <td className="py-2.5 font-mono text-xs">{formatCurrency(r.valor)}</td>
                  <td className="py-2.5">
                    <Badge tone={r.status === "paga" ? "success" : r.status === "aberta" ? "info" : "warning"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => toast.success(`Fatura ${r.numero} baixada`)}
                      className="rounded-md border border-border bg-surface-1 px-2 py-1 text-xs hover:bg-surface-2"
                    >
                      Ver
                    </button>
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
