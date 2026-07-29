import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, KPI, Avatar } from "@/components/ui-kit";
import { ReportFiltersBar } from "@/components/report-filters";
import { REPORTS, DEFAULT_REPORT_FILTERS, type ReportFilters } from "@/lib/mvp";
import { num } from "@/lib/format";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios · Nexo" }] }),
  component: Page,
});

const COLORS = ["#6366f1", "#06b6d4", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#a855f7"];

function Page() {
  const [filters, setFilters] = React.useState<ReportFilters>(DEFAULT_REPORT_FILTERS);
  const { data } = useQuery({
    queryKey: ["mvp", "overview", filters],
    queryFn: () => REPORTS.overview(filters),
    refetchInterval: 30_000,
  });
  const kpis = data?.kpis;
  const byDept = data?.byDepartment ?? [];
  const byAgent = data?.byAgent ?? [];
  const byCustomer = data?.byCustomer ?? [];
  const byInstancia = data?.byInstancia ?? [];
  const byTag = data?.byTag ?? [];

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader title="Relatórios" subtitle="Indicadores da operação com dados reais do banco." />

        <ReportFiltersBar value={filters} onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))} />

        <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KPI label="Conversas ativas" value={num(kpis?.ativas ?? 0)} tone="info" />
          <KPI label="Stand By" value={num(kpis?.standby ?? 0)} tone="warning" />
          <KPI label="Fila" value={num(kpis?.fila ?? 0)} tone="warning" />
          <KPI label="Leads" value={num(kpis?.leads ?? 0)} tone="info" />
          <KPI label="Fechadas" value={num(kpis?.fechadas ?? 0)} tone="success" />
        </div>


        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="mb-4 text-sm font-semibold">Conversas por departamento</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byDept}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {byDept.map((d, i) => (
                    <Cell key={i} fill={d.cor || COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <p className="mb-4 text-sm font-semibold">Conversas por atendente</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byAgent}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="resolvidas" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          {[
            { title: "Conversas por cliente", data: byCustomer },
            { title: "Conversas por instância", data: byInstancia },
            { title: "Conversas por etiqueta", data: byTag },
          ].map((chart) => (
            <Card key={chart.title}>
              <p className="mb-4 text-sm font-semibold">{chart.title}</p>
              {chart.data.length === 0 ? (
                <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
                  Sem dados para o período.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chart.data}>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {chart.data.map((d, i) => (
                        <Cell key={i} fill={d.cor || COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          ))}
        </div>

        <Card className="p-0">

          <div className="border-b border-border px-5 py-4">
            <p className="text-sm font-semibold">Detalhamento por atendente</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Atendente</th>
                <th className="px-4 py-2 font-medium">Conversas</th>
                <th className="px-4 py-2 font-medium">Resolvidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byAgent.map((a) => (
                <tr key={a.nome}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={a.nome} size={22} />
                      <span>{a.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono">{a.total}</td>
                  <td className="px-4 py-2 font-mono">{a.resolvidas}</td>
                </tr>
              ))}
              {byAgent.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Nenhum atendente ativo ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </PageContainer>
    </AppShell>
  );
}
