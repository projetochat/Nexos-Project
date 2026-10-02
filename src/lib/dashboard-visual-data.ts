import type {
  DashboardColumnCount,
  DashboardValueMode,
  DashboardVisualization,
} from "@/lib/dashboard-components";

export type DashboardVisualDatum = {
  nome: string;
  total: number;
  cor?: string | null;
};

const COLORS = ["#2563eb", "#7c3aed", "#f59e0b", "#16a34a", "#ec4899", "#06b6d4", "#64748b"];

export function normalizeDashboardData(
  data: DashboardVisualDatum[],
  valueMode: DashboardValueMode,
  columns: DashboardColumnCount,
  visualization: DashboardVisualization,
  preserveOrder = false,
) {
  const maxItems = visualization === "table" ? 7 : { 1: 7, 2: 12, 3: 16, 4: 20 }[columns];
  const valid = data.filter((item) => Number.isFinite(item.total));
  const ordered =
    visualization === "line" || preserveOrder
      ? valid
      : [...valid].sort(
          (first, second) =>
            second.total - first.total || first.nome.localeCompare(second.nome, "pt-BR"),
        );
  const total = ordered.reduce((sum, item) => sum + Math.max(0, item.total), 0);
  const visible =
    visualization === "line" || ordered.length <= maxItems
      ? ordered
      : visualization === "table"
        ? ordered.slice(0, maxItems)
        : [
            ...ordered.slice(0, maxItems - 1),
            {
              nome: "Outros",
              total: ordered
                .slice(maxItems - 1)
                .reduce((sum, item) => sum + Math.max(0, item.total), 0),
              cor: "#94a3b8",
            },
          ];
  return visible.map((item, index) => ({
    ...item,
    cor: item.cor || COLORS[index % COLORS.length],
    valor:
      valueMode === "percentage"
        ? total > 0
          ? Math.round((item.total / total) * 1000) / 10
          : 0
        : item.total,
  }));
}

export function dashboardPieLegendItems(
  data: Array<DashboardVisualDatum & { valor: number; cor: string }>,
) {
  const total = data.reduce((sum, item) => sum + Math.max(0, item.total), 0);
  return data.map((item) => {
    const percentage = total > 0 ? (Math.max(0, item.total) / total) * 100 : 0;
    return {
      ...item,
      percentage,
      percentageLabel: `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(percentage)}%`,
    };
  });
}

export function dashboardPieLegendValue(
  item: { total: number; percentageLabel: string },
  valueMode: DashboardValueMode,
) {
  return valueMode === "percentage"
    ? item.percentageLabel
    : new Intl.NumberFormat("pt-BR").format(item.total);
}
