import * as React from "react";
import {
  CalendarClock,
  ContactRound,
  Database,
  Megaphone,
  Network,
  ShieldCheck,
  Tags,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui-kit";
import type {
  PlatformClientVolumetryCounts,
  PlatformClientVolumetryRow,
} from "@/lib/platform-dashboard-api";

type Metric = keyof PlatformClientVolumetryCounts;
type SortKey = "clientName" | Metric;

const columns: Array<{
  key: Metric;
  label: string;
  labelLines?: readonly [string, string];
  iconClassName: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "instances",
    label: "Instâncias",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    icon: Wifi,
  },
  {
    key: "contacts",
    label: "Contatos",
    iconClassName: "text-blue-600 dark:text-blue-400",
    icon: ContactRound,
  },
  {
    key: "attendants",
    label: "Atendentes",
    iconClassName: "text-violet-600 dark:text-violet-400",
    icon: Users,
  },
  {
    key: "accessProfiles",
    label: "Perfil de Acesso",
    labelLines: ["Perfil de", "Acesso"],
    iconClassName: "text-rose-500 dark:text-rose-400",
    icon: ShieldCheck,
  },
  {
    key: "departments",
    label: "Departamentos",
    iconClassName: "text-amber-600 dark:text-amber-400",
    icon: Network,
  },
  {
    key: "tags",
    label: "Etiquetas",
    iconClassName: "text-cyan-600 dark:text-cyan-400",
    icon: Tags,
  },
  {
    key: "quickReplies",
    label: "Mensagens Rápidas",
    labelLines: ["Mensagens", "Rápidas"],
    iconClassName: "text-orange-500 dark:text-orange-400",
    icon: Zap,
  },
  {
    key: "customFields",
    label: "Campos Adicionais",
    labelLines: ["Campos", "Adicionais"],
    iconClassName: "text-sky-600 dark:text-sky-400",
    icon: Database,
  },
  {
    key: "schedules",
    label: "Agendamentos",
    iconClassName: "text-purple-600 dark:text-purple-400",
    icon: CalendarClock,
  },
  {
    key: "campaigns",
    label: "Campanhas",
    iconClassName: "text-pink-600 dark:text-pink-400",
    icon: Megaphone,
  },
];

export function PlatformClientVolumetryTable({
  title,
  rows,
  totals,
}: {
  title: string;
  rows: PlatformClientVolumetryRow[];
  totals: PlatformClientVolumetryCounts;
}) {
  const [sort, setSort] = React.useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "clientName",
    direction: "asc",
  });
  const sortedRows = React.useMemo(
    () =>
      [...rows].sort((left, right) => {
        const comparison =
          sort.key === "clientName"
            ? left.clientName.localeCompare(right.clientName, "pt-BR")
            : left[sort.key] - right[sort.key];
        return sort.direction === "asc" ? comparison : -comparison;
      }),
    [rows, sort],
  );
  const toggleSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));

  return (
    <Card className="h-full overflow-hidden" padding={false}>
      <div className="px-4 pt-4">
        <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
      </div>
      <div className="overflow-x-auto" aria-label={`${title}: dados por cliente`}>
        <table className="w-full min-w-[1020px] border-collapse text-xs">
          <thead className="bg-surface-2 text-muted-foreground">
            <tr>
              <SortableHeader
                label="Cliente"
                sortDirection={sort.key === "clientName" ? sort.direction : undefined}
                onClick={() => toggleSort("clientName")}
              />
              {columns.map(({ key, label, labelLines, iconClassName, icon: Icon }) => (
                <SortableHeader
                  key={key}
                  label={label}
                  labelLines={labelLines}
                  icon={Icon}
                  iconClassName={iconClassName}
                  numeric
                  sortDirection={sort.key === key ? sort.direction : undefined}
                  onClick={() => toggleSort(key)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.clientId ?? "without-client"} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{row.clientName}</td>
                {columns.map(({ key }) => (
                  <td key={key} className="px-3 py-2 text-center font-mono tabular-nums">
                    {row[key].toLocaleString("pt-BR")}
                  </td>
                ))}
              </tr>
            ))}
            {!sortedRows.length && (
              <tr className="border-t border-border">
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Nenhum cliente encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-border bg-primary/5 font-semibold">
            <tr>
              <td className="px-3 py-2">Total</td>
              {columns.map(({ key }) => (
                <td key={key} className="px-3 py-2 text-center font-mono tabular-nums">
                  {totals[key].toLocaleString("pt-BR")}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function SortableHeader({
  label,
  labelLines,
  icon: Icon,
  iconClassName,
  numeric = false,
  sortDirection,
  onClick,
}: {
  label: string;
  labelLines?: readonly [string, string];
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  numeric?: boolean;
  sortDirection?: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th
      className={`px-2 py-2 ${numeric ? "text-center" : "text-left"}`}
      scope="col"
      aria-sort={
        sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : "none"
      }
    >
      <button
        type="button"
        className={`inline-flex font-medium leading-tight ${Icon ? "flex-col items-center gap-0.5" : "items-center gap-1"} ${numeric ? "w-full justify-center" : ""}`}
        onClick={onClick}
        aria-label={`Ordenar por ${label}`}
      >
        {Icon ? (
          <span className="flex items-center justify-center gap-1" data-header-icon-row aria-hidden>
            <Icon className={`h-[17px] w-[17px] shrink-0 ${iconClassName ?? ""}`} />
          </span>
        ) : null}
        {labelLines ? (
          <span className="flex flex-col text-center" data-header-label>
            <span>{labelLines[0]}</span> <span>{labelLines[1]}</span>
          </span>
        ) : (
          <span data-header-label>{label}</span>
        )}
      </button>
    </th>
  );
}
