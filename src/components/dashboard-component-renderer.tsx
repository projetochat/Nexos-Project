import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui-kit";
import type {
  DashboardColumnCount,
  DashboardValueMode,
  DashboardVisualization,
} from "@/lib/dashboard-components";
import { DASHBOARD_CHART_MARGIN, DASHBOARD_CHART_TEXT_COLOR } from "@/lib/dashboard-chart-layout";
import {
  dashboardPieLegendItems,
  normalizeDashboardData,
  type DashboardVisualDatum,
} from "@/lib/dashboard-visual-data";
import { num } from "@/lib/format";

export type { DashboardVisualDatum } from "@/lib/dashboard-visual-data";

export function DashboardComponentRenderer({
  title,
  visualization,
  columns,
  valueMode,
  data,
  compact = false,
  preserveOrder = false,
}: {
  title?: string;
  visualization: DashboardVisualization;
  columns: DashboardColumnCount;
  valueMode: DashboardValueMode;
  data: DashboardVisualDatum[];
  compact?: boolean;
  preserveOrder?: boolean;
}) {
  const normalized = React.useMemo(
    () => normalizeDashboardData(data, valueMode, columns, visualization, preserveOrder),
    [columns, data, preserveOrder, valueMode, visualization],
  );
  const height = compact ? 220 : 270;
  const valueSuffix = valueMode === "percentage" ? "%" : "";

  return (
    <Card className="flex h-full min-w-0 flex-col" padding={!compact}>
      {title && (
        <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
      )}
      {normalized.length === 0 ? (
        <div className="flex min-h-52 flex-1 items-center justify-center text-xs text-muted-foreground">
          Sem dados para o período.
        </div>
      ) : (
        <div
          className="min-h-0 min-w-0 flex-1"
          data-testid={`dashboard-preview-${visualization}`}
          aria-label={`Visualização ${visualization}`}
        >
          {visualization === "columns" && (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={normalized} margin={DASHBOARD_CHART_MARGIN}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="nome"
                  stroke="var(--muted-foreground)"
                  tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
                  fontSize={10}
                  interval={0}
                  angle={normalized.length > 5 ? -30 : 0}
                  textAnchor={normalized.length > 5 ? "end" : "middle"}
                  height={normalized.length > 5 ? 64 : 30}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
                  fontSize={10}
                  allowDecimals={false}
                  width={36}
                  unit={valueSuffix}
                />
                <Tooltip content={<DashboardValueTooltip suffix={valueSuffix} />} />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                  {normalized.map((item, index) => (
                    <Cell key={`${item.nome}-${index}`} fill={item.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {visualization === "bars" && (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart
                data={normalized}
                layout="vertical"
                margin={{ ...DASHBOARD_CHART_MARGIN, left: 16 }}
              >
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
                  fontSize={10}
                  allowDecimals={false}
                  unit={valueSuffix}
                />
                <YAxis
                  type="category"
                  dataKey="nome"
                  stroke="var(--muted-foreground)"
                  tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
                  fontSize={10}
                  width={92}
                />
                <Tooltip content={<DashboardValueTooltip suffix={valueSuffix} />} />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                  {normalized.map((item, index) => (
                    <Cell key={`${item.nome}-${index}`} fill={item.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {visualization === "line" && (
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={normalized} margin={DASHBOARD_CHART_MARGIN}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="nome"
                  stroke="var(--muted-foreground)"
                  tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
                  fontSize={10}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
                  fontSize={10}
                  allowDecimals={false}
                  unit={valueSuffix}
                />
                <Tooltip content={<DashboardValueTooltip suffix={valueSuffix} />} />
                <Line
                  type="monotone"
                  dataKey="valor"
                  name="Valor"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {(visualization === "pie" || visualization === "donut") && (
            <div
              className="flex min-w-0 flex-col items-center gap-3 sm:flex-row"
              style={{ minHeight: height }}
            >
              <div className="min-w-0 flex-1 self-stretch">
                <ResponsiveContainer width="100%" height={height}>
                  <PieChart>
                    <Tooltip content={<DashboardValueTooltip suffix={valueSuffix} />} />
                    <Pie
                      data={normalized}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius={visualization === "donut" ? "43%" : 0}
                      outerRadius="78%"
                      paddingAngle={2}
                    >
                      {normalized.map((item, index) => (
                        <Cell key={`${item.nome}-${index}`} fill={item.cor} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <DashboardPieLegend data={normalized} />
            </div>
          )}

          {visualization === "gauge" && <DashboardGauge data={normalized} height={height} />}

          {visualization === "table" && (
            <div className="max-h-[270px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Categoria</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {normalized.map((item) => (
                    <tr key={item.nome}>
                      <td className="px-3 py-2">
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full"
                          style={{ background: item.cor }}
                        />
                        {item.nome}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {formatValue(item.valor, valueSuffix)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {visualization === "cards" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {normalized.map((item) => (
                <div key={item.nome} className="rounded-lg border border-border bg-surface-1 p-3">
                  <div className="mb-2 h-1 w-10 rounded-full" style={{ background: item.cor }} />
                  <p className="font-mono text-xl font-semibold text-foreground">
                    {formatValue(item.valor, valueSuffix)}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.nome}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DashboardPieLegend({
  data,
}: {
  data: Array<DashboardVisualDatum & { valor: number; cor: string }>;
}) {
  const items = dashboardPieLegendItems(data);

  return (
    <ul
      className="grid w-full shrink-0 gap-2 text-xs sm:w-[42%] sm:max-w-56"
      aria-label="Legenda do gráfico"
    >
      {items.map((item) => {
        return (
          <li key={item.nome} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
            <span
              className="mt-1 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.cor }}
              aria-hidden="true"
            />
            <span className="truncate text-muted-foreground" title={item.nome}>
              {item.nome}
            </span>
            <span className="font-mono font-semibold text-foreground">{item.percentageLabel}</span>
          </li>
        );
      })}
    </ul>
  );
}

function DashboardGauge({
  data,
  height,
}: {
  data: Array<DashboardVisualDatum & { valor: number; cor: string }>;
  height: number;
}) {
  const first = data[0];
  const total = data.reduce((sum, item) => sum + Math.max(0, item.valor), 0);
  const percentage =
    total > 0 ? Math.min(100, Math.round((Math.max(0, first.valor) / total) * 100)) : 0;
  const chart = [
    { nome: first.nome, valor: percentage, cor: first.cor },
    { nome: "Restante", valor: 100 - percentage, cor: "var(--surface-3)" },
  ];
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chart}
            dataKey="valor"
            startAngle={180}
            endAngle={0}
            innerRadius="58%"
            outerRadius="82%"
            cx="50%"
            cy="72%"
          >
            {chart.map((item) => (
              <Cell key={item.nome} fill={item.cor} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-[18%] text-center">
        <p className="font-mono text-3xl font-semibold text-foreground">{percentage}%</p>
        <p className="mt-1 text-xs text-muted-foreground">{first.nome}</p>
      </div>
    </div>
  );
}

function DashboardValueTooltip({
  active,
  payload,
  suffix,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { nome?: string; valor?: number } }>;
  suffix: string;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-card">
      <p className="font-medium">{item.nome}</p>
      <p className="mt-1 font-mono">{formatValue(item.valor ?? 0, suffix)}</p>
    </div>
  );
}

function formatValue(value: number, suffix: string) {
  return suffix
    ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}${suffix}`
    : num(value);
}
