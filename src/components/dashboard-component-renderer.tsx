import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui-kit";
import { useDashboardMaximized } from "@/components/dashboard-maximized-context";
import type {
  DashboardColumnCount,
  DashboardValueMode,
  DashboardVisualization,
} from "@/lib/dashboard-components";
import {
  DASHBOARD_CHART_MARGIN,
  DASHBOARD_CHART_TEXT_COLOR,
  dashboardCategoryAxisLayout,
  dashboardColumnAxisLayout,
  formatDashboardAxisLabelToWidth,
} from "@/lib/dashboard-chart-layout";
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
  preserveAllItems = false,
}: {
  title?: string;
  visualization: DashboardVisualization;
  columns: DashboardColumnCount;
  valueMode: DashboardValueMode;
  data: DashboardVisualDatum[];
  compact?: boolean;
  preserveOrder?: boolean;
  preserveAllItems?: boolean;
}) {
  const maximized = useDashboardMaximized();
  const normalized = React.useMemo(
    () =>
      normalizeDashboardData(
        data,
        valueMode,
        columns,
        visualization,
        preserveOrder,
        preserveAllItems,
      ),
    [columns, data, preserveAllItems, preserveOrder, valueMode, visualization],
  );
  const height = compact ? 200 : 270;
  const valueSuffix = valueMode === "percentage" ? "%" : "";
  const barValueMarginRight = React.useMemo(() => {
    const longestValue = normalized.reduce(
      (length, item) => Math.max(length, formatValue(item.valor, valueSuffix).length),
      1,
    );
    return Math.min(72, Math.max(32, longestValue * 7 + 12));
  }, [normalized, valueSuffix]);
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = React.useState(0);
  const categoryAxisLayout = React.useMemo(
    () =>
      dashboardCategoryAxisLayout(
        normalized.map((item) => item.nome),
        chartWidth,
      ),
    [chartWidth, normalized],
  );
  const columnAxisLayout = React.useMemo(
    () =>
      dashboardColumnAxisLayout(
        normalized.map((item) => item.nome),
        chartWidth,
      ),
    [chartWidth, normalized],
  );

  React.useEffect(() => {
    const element = chartContainerRef.current;
    if (!element) return;

    const updateWidth = () => setChartWidth(element.getBoundingClientRect().width);
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
          ref={chartContainerRef}
          className={`min-w-0 flex-1 ${compact ? "min-h-[200px]" : "min-h-[270px]"} ${maximized ? "flex items-center justify-center" : ""}`}
          data-testid={`dashboard-preview-${visualization}`}
          aria-label={`Visualização ${visualization}`}
        >
          {visualization === "columns" && (
            <ResponsiveContainer width="100%" height={compact ? height : "100%"}>
              <BarChart
                data={normalized}
                margin={{
                  ...DASHBOARD_CHART_MARGIN,
                  top: 24,
                  bottom: columnAxisLayout.marginBottom,
                }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="nome"
                  stroke="var(--muted-foreground)"
                  tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
                  fontSize={10}
                  interval={0}
                  angle={columnAxisLayout.angle}
                  textAnchor={columnAxisLayout.textAnchor}
                  height={columnAxisLayout.height}
                  tickFormatter={(value) =>
                    formatDashboardAxisLabelToWidth(value, columnAxisLayout.maxLabelWidth)
                  }
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
                  <LabelList
                    dataKey="valor"
                    content={(properties) => (
                      <DashboardBarValueLabel
                        {...(properties as DashboardBarValueLabelProperties)}
                        orientation="column"
                        suffix={valueSuffix}
                      />
                    )}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {visualization === "bars" && (
            <ResponsiveContainer width="100%" height={compact ? height : "100%"}>
              <BarChart
                data={normalized}
                layout="vertical"
                margin={{
                  ...DASHBOARD_CHART_MARGIN,
                  right: barValueMarginRight,
                  left: 0,
                }}
              >
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, (dataMax: number) => Math.max(1, dataMax)]}
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
                  width={Math.min(categoryAxisLayout.width, 80)}
                  tickFormatter={(value) =>
                    formatDashboardAxisLabelToWidth(value, categoryAxisLayout.maxLabelWidth)
                  }
                />
                <Tooltip content={<DashboardValueTooltip suffix={valueSuffix} />} />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                  {normalized.map((item, index) => (
                    <Cell key={`${item.nome}-${index}`} fill={item.cor} />
                  ))}
                  <LabelList
                    dataKey="valor"
                    content={(properties) => (
                      <DashboardBarValueLabel
                        {...(properties as DashboardBarValueLabelProperties)}
                        orientation="bar"
                        suffix={valueSuffix}
                      />
                    )}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {visualization === "line" && (
            <ResponsiveContainer width="100%" height={maximized ? "70%" : height}>
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
              className={`w-full min-w-0 items-center gap-2 ${
                columns > 1
                  ? "grid sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.7fr)]"
                  : "flex flex-col"
              }`}
              style={{ minHeight: height }}
            >
              <div
                className={`min-w-0 self-stretch ${maximized ? "h-[clamp(22rem,58dvh,42rem)]" : ""}`}
              >
                <ResponsiveContainer width="100%" height={maximized ? "100%" : height}>
                  <PieChart>
                    <Tooltip content={<DashboardValueTooltip suffix={valueSuffix} />} />
                    <Pie
                      data={normalized}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius={visualization === "donut" ? "48%" : 0}
                      outerRadius="94%"
                      paddingAngle={2}
                      labelLine={false}
                      label={(properties) => (
                        <DashboardPieSliceLabel
                          {...(properties as DashboardPieSliceLabelProperties)}
                          suffix={valueSuffix}
                        />
                      )}
                    >
                      {normalized.map((item, index) => (
                        <Cell key={`${item.nome}-${index}`} fill={item.cor} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <DashboardPieLegend
                data={normalized}
                besideChart={columns > 1}
                centered={maximized}
              />
            </div>
          )}

          {visualization === "gauge" && (
            <DashboardGauge
              data={normalized}
              height={maximized ? "clamp(22rem,62dvh,44rem)" : height}
            />
          )}

          {visualization === "table" && (
            <div
              className={`w-full overflow-auto rounded-lg border border-border ${maximized ? "max-h-[72dvh]" : "max-h-[270px]"}`}
            >
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
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
  besideChart,
  centered,
}: {
  data: Array<DashboardVisualDatum & { valor: number; cor: string }>;
  besideChart: boolean;
  centered: boolean;
}) {
  const items = dashboardPieLegendItems(data);

  return (
    <ul
      className={
        centered
          ? "mx-auto flex w-full min-w-0 max-w-3xl shrink-0 flex-wrap justify-center gap-x-6 gap-y-2 text-xs"
          : `grid w-full min-w-0 shrink-0 grid-cols-2 gap-x-3 gap-y-2 text-xs ${besideChart ? "sm:grid-cols-1" : ""}`
      }
      aria-label="Legenda do gráfico"
    >
      {items.map((item) => {
        return (
          <li key={item.nome} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2">
            <span
              className="mt-1 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.cor }}
              aria-hidden="true"
            />
            <span className="truncate text-muted-foreground" title={item.nome}>
              {item.nome}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type DashboardBarValueLabelProperties = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
};

function DashboardBarValueLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value = 0,
  suffix,
  orientation,
}: DashboardBarValueLabelProperties & {
  suffix: string;
  orientation: "column" | "bar";
}) {
  const numericX = Number(x);
  const numericY = Number(y);
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  const numericValue = Number(value);
  if (![numericX, numericY, numericWidth, numericHeight, numericValue].every(Number.isFinite)) {
    return null;
  }

  const label = formatValue(numericValue, suffix);
  const fontSize = 11;
  const isColumn = orientation === "column";
  return (
    <text
      x={isColumn ? numericX + numericWidth / 2 : numericX + numericWidth + 6}
      y={isColumn ? numericY - 7 : numericY + numericHeight / 2}
      fill="var(--foreground)"
      textAnchor={isColumn ? "middle" : "start"}
      dominantBaseline="central"
      fontSize={fontSize}
      fontWeight={700}
      className="pointer-events-none"
    >
      {label}
    </text>
  );
}

type DashboardPieSliceLabelProperties = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  value?: number;
};

function DashboardPieSliceLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
  value = 0,
  suffix,
}: DashboardPieSliceLabelProperties & { suffix: string }) {
  if (percent < 0.055) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const radians = (-midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(radians);
  const y = cy + radius * Math.sin(radians);
  const fontSize = percent < 0.09 ? 9 : percent < 0.15 ? 10 : 12;

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={fontSize}
      fontWeight={700}
      className="pointer-events-none"
    >
      {formatValue(value, suffix)}
    </text>
  );
}

function DashboardGauge({
  data,
  height,
}: {
  data: Array<DashboardVisualDatum & { valor: number; cor: string }>;
  height: number | string;
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
