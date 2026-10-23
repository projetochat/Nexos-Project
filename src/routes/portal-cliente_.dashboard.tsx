import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  Headphones,
  ShieldAlert,
  Timer,
  XCircle,
} from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Card, Field, SectionHeader, Select } from "@/components/ui-kit";
import {
  ticketApi,
  type ApiCustomerPortalDashboard,
  type ApiTicketDashboardDimension,
} from "@/lib/trixus-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/portal-cliente_/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Portal do Cliente | Trixus" }] }),
  component: CustomerPortalDashboardPage,
});

function CustomerPortalDashboardPage() {
  const portalAccessId = useSession((state) => state.user?.portalAccessId);
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [departmentId, setDepartmentId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const period = monthRange(month);
  const dashboard = useQuery({
    queryKey: ["tickets", "portal-dashboard", portalAccessId, month, departmentId, branchId],
    queryFn: () =>
      ticketApi.portalDashboard({
        ...period,
        customerDepartmentId: departmentId || undefined,
        originBranchId: branchId || undefined,
      }),
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Painel de chamados"
          subtitle="Acompanhe os chamados da sua empresa e os principais indicadores de atendimento."
        />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Período">
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </Field>
            <Field label="Filial">
              <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                <option value="">Todas</option>
                {dashboard.data?.filters.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Departamento">
              <Select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">Todos</option>
                {dashboard.data?.filters.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        {dashboard.isPending ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Carregando indicadores…
          </Card>
        ) : dashboard.isError ? (
          <Card className="border-destructive/30 p-8 text-center text-sm text-destructive">
            Não foi possível carregar o painel. Tente novamente.
          </Card>
        ) : (
          <DashboardContent dashboard={dashboard.data} />
        )}
      </PageContainer>
    </AppShell>
  );
}

function DashboardContent({ dashboard }: { dashboard: ApiCustomerPortalDashboard }) {
  const metrics = dashboard.metrics;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total" value={metrics.total} icon={FileText} tone="blue" />
        <MetricCard label="Abertos" value={metrics.open} icon={Clock3} tone="blue" />
        <MetricCard
          label="Em atendimento"
          value={metrics.inProgress}
          icon={Headphones}
          tone="blue"
        />
        <MetricCard
          label="Aguardando validação"
          value={metrics.awaitingValidation}
          icon={Timer}
          tone="amber"
        />
        <MetricCard
          label="Aguardando aprovação"
          value={metrics.awaitingApproval}
          icon={ShieldAlert}
          tone="purple"
        />
        <MetricCard
          label="Concluídos"
          value={metrics.completed}
          icon={CheckCircle2}
          tone="green"
        />
        <MetricCard label="Reprovados" value={metrics.rejected} icon={XCircle} tone="red" />
        <MetricCard
          label="Tempo médio de solução"
          value={formatHours(metrics.averageResolutionHours)}
          icon={Timer}
          tone="slate"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DimensionCard title="Chamados por departamento" items={dashboard.byDepartment} />
        <DimensionCard title="Chamados por filial" items={dashboard.byBranch} />
        <DimensionCard title="Tipos de chamado" items={dashboard.byCategory} />
        <DimensionCard title="Distribuição por prioridade" items={dashboard.byPriority} />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "amber" | "purple" | "green" | "red" | "slate";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <Card className="flex min-h-24 items-center gap-3 p-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="mt-1 block text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </span>
    </Card>
  );
}

function DimensionCard({ title, items }: { title: string; items: ApiTicketDashboardDimension[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {items.length ? (
        <div className="space-y-3">
          {items.slice(0, 6).map((item) => (
            <div key={item.id ?? item.label} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3 text-xs">
              <span className="truncate text-muted-foreground" title={item.label}>
                {item.label}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500"
                  style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }}
                />
              </span>
              <strong className="w-7 text-right tabular-nums text-foreground">{item.count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum chamado no período selecionado.
        </p>
      )}
    </Card>
  );
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return {};
  return {
    createdFrom: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString(),
    createdTo: new Date(Date.UTC(year, monthNumber, 1) - 1).toISOString(),
  };
}

function formatHours(value: number | null) {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}h`;
}
