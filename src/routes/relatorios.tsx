import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { ReportFiltersBar } from "@/components/report-filters";
import { Avatar, Button, Card, KPI, SectionHeader } from "@/components/ui-kit";
import { num } from "@/lib/format";
import { operationsApi } from "@/lib/nexos-api";
import {
  DEFAULT_OPERATIONAL_FILTERS,
  type OperationalReportFilters,
} from "@/lib/operational-filters";
import { onRealtimeEvent } from "@/lib/realtime/client";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatorios - Nexo" }] }),
  component: Page,
});

const COLORS = ["#2563eb", "#0f766e", "#9333ea", "#d97706", "#16a34a", "#dc2626"];

function Page() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = React.useState<OperationalReportFilters>(
    DEFAULT_OPERATIONAL_FILTERS,
  );
  const { data, isLoading } = useQuery({
    queryKey: ["operations", "reports", filters],
    queryFn: () => operationsApi.report({ ...filters, pageSize: 50 }),
  });
  React.useEffect(
    () =>
      onRealtimeEvent((event) => {
        if (event.event.startsWith("message.") || event.event.startsWith("conversation.")) {
          queryClient.invalidateQueries({ queryKey: ["operations", "reports"] });
        }
      }),
    [queryClient],
  );
  const kpis = data?.kpis ?? {};
  const byAgent = data?.charts.byAgent ?? [];

  const exportFile = async (format: "csv" | "xlsx" | "pdf") => {
    try {
      const blob = await operationsApi.exportAttendance({ ...filters, format });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexos-atendimento-${new Date().toISOString().slice(0, 10)}.${extension(format)}`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Relatorio exportado");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Relatorios"
          subtitle="Indicadores de atendimento consolidados a partir do banco Nexos."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => exportFile("csv")}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button variant="secondary" size="sm" onClick={() => exportFile("xlsx")}>
                <Download className="h-3.5 w-3.5" /> Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={() => exportFile("pdf")}>
                <Download className="h-3.5 w-3.5" /> PDF
              </Button>
            </div>
          }
        />

        <ReportFiltersBar
          value={filters}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        />

        <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KPI label="Abertas" value={num(numberKpi(kpis.conversasAbertas))} tone="info" />
          <KPI
            label="Em atendimento"
            value={num(numberKpi(kpis.conversasEmAtendimento))}
            tone="info"
          />
          <KPI label="Aguardando" value={num(numberKpi(kpis.conversasAguardando))} tone="warning" />
          <KPI label="Novos leads" value={num(numberKpi(kpis.novosLeads))} tone="info" />
          <KPI label="Encerradas" value={num(numberKpi(kpis.conversasEncerradas))} tone="success" />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <ReportChart title="Conversas por departamento" data={data?.charts.byDepartment ?? []} />
          <ReportChart title="Conversas por atendente" data={byAgent} />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ReportChart title="Conversas por cliente" data={data?.charts.byCustomer ?? []} />
          <ReportChart title="Conversas por instancia" data={data?.charts.byConnection ?? []} />
          <Card>
            <p className="mb-4 text-sm font-semibold">Resumo do periodo</p>
            <ul className="space-y-3 text-sm">
              <Summary label="Mensagens recebidas" value={numberKpi(kpis.mensagensRecebidas)} />
              <Summary label="Mensagens enviadas" value={numberKpi(kpis.mensagensEnviadas)} />
              <Summary label="Chamados criados" value={numberKpi(kpis.chamadosCriados)} />
              <Summary label="Chamados resolvidos" value={numberKpi(kpis.chamadosResolvidos)} />
            </ul>
          </Card>
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-5 py-4">
            <p className="text-sm font-semibold">Detalhamento por atendente</p>
            <p className="text-xs text-muted-foreground">
              Conversas agrupadas pela atribuicao operacional atual.
            </p>
          </div>
          <table className="w-full table-fixed text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Atendente</th>
                <th className="px-4 py-2 font-medium">Conversas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byAgent.map((agent) => (
                <tr key={agent.nome}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={agent.nome} size={22} />
                      <span>{agent.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono">{agent.total}</td>
                </tr>
              ))}
              {!isLoading && byAgent.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Nenhum atendimento encontrado para o filtro atual.
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

function ReportChart({
  title,
  data,
}: {
  title: string;
  data: Array<{ nome: string; cor?: string; total: number }>;
}) {
  return (
    <Card>
      <p className="mb-4 text-sm font-semibold">{title}</p>
      {data.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
          Sem dados para o periodo.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]}>
              {data.map((item, index) => (
                <Cell
                  key={`${item.nome}-${index}`}
                  fill={item.cor || COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between border-b border-border pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{num(value)}</span>
    </li>
  );
}

function numberKpi(value: number | null | undefined) {
  return value ?? 0;
}

function extension(format: "csv" | "xlsx" | "pdf") {
  if (format === "xlsx") return "xls";
  return format;
}
