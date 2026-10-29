import * as React from "react";
import {
  CalendarClock,
  ContactRound,
  Database,
  Megaphone,
  LogIn,
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
  PlatformLoginAggregation,
  PlatformLoginEnvironments,
} from "@/lib/platform-dashboard-api";
import { displayDateTime } from "@/lib/format";

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
    key: "logins",
    label: "Logins",
    iconClassName: "text-lime-600 dark:text-lime-400",
    icon: LogIn,
  },
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
  loginAggregation,
}: {
  title: string;
  rows: PlatformClientVolumetryRow[];
  totals: PlatformClientVolumetryCounts & { loginEnvironments?: PlatformLoginEnvironments | null };
  loginAggregation?: PlatformLoginAggregation;
}) {
  const aggregationStatus = loginAggregation?.status ?? "disabled";
  const loginsUnavailable =
    aggregationStatus === "unavailable" || aggregationStatus === "ambiguous";
  const [sort, setSort] = React.useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "clientName",
    direction: "asc",
  });
  const sortedRows = React.useMemo(
    () =>
      [...rows].sort((left, right) => {
        const byName =
          left.clientName.localeCompare(right.clientName, "pt-BR") ||
          (left.clientId ?? "").localeCompare(right.clientId ?? "");
        if (sort.key === "logins") {
          const leftValue = loginsUnavailable ? null : left.logins;
          const rightValue = loginsUnavailable ? null : right.logins;
          if (leftValue == null || rightValue == null) {
            if (leftValue == null && rightValue != null) return 1;
            if (rightValue == null && leftValue != null) return -1;
            return byName;
          }
        }
        const comparison =
          sort.key === "clientName"
            ? left.clientName.localeCompare(right.clientName, "pt-BR")
            : (left[sort.key] ?? 0) - (right[sort.key] ?? 0);
        return comparison ? (sort.direction === "asc" ? comparison : -comparison) : byName;
      }),
    [rows, sort, loginsUnavailable],
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
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        {aggregationStatus === "available"
          ? "Logins unificados de Localhost, HML e Produção no período selecionado. Inclui somente novos logins internos registrados após a ativação da coleta em cada ambiente."
          : aggregationStatus === "unavailable"
            ? "Contagem de logins indisponível: não foi possível consultar todos os ambientes. Os demais indicadores permanecem disponíveis."
            : aggregationStatus === "ambiguous"
              ? "Contagem de logins indisponível: há divergência na identificação dos clientes entre os ambientes. Os demais indicadores permanecem disponíveis."
              : "Logins concluídos no período selecionado, somente neste ambiente. A contagem inclui novos logins registrados a partir desta atualização."}
        {aggregationStatus === "available" && loginAggregation?.updatedAt
          ? ` Atualizado em ${displayDateTime(loginAggregation.updatedAt)}.`
          : null}
      </p>
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
                    {key === "logins" ? (
                      <LoginCount
                        value={row.logins}
                        environments={row.loginEnvironments}
                        status={aggregationStatus}
                      />
                    ) : (
                      (row[key] ?? 0).toLocaleString("pt-BR")
                    )}
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
                  {key === "logins" ? (
                    <LoginCount
                      value={totals.logins}
                      environments={totals.loginEnvironments}
                      status={aggregationStatus}
                    />
                  ) : (
                    (totals[key] ?? 0).toLocaleString("pt-BR")
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function LoginCount({
  value,
  environments,
  status,
}: {
  value: number | null;
  environments?: PlatformLoginEnvironments | null;
  status: PlatformLoginAggregation["status"];
}) {
  if (value == null || status === "unavailable" || status === "ambiguous")
    return <span className="font-sans text-muted-foreground">Indisponível</span>;
  const number = value.toLocaleString("pt-BR");
  const detail =
    status === "available" && environments
      ? `Localhost: ${environments.local.toLocaleString("pt-BR")} · HML: ${environments.homologation.toLocaleString("pt-BR")} · Produção: ${environments.production.toLocaleString("pt-BR")}`
      : status === "available"
        ? "Detalhamento por ambiente indisponível."
        : "Logins registrados somente neste ambiente.";
  return (
    <span title={detail} aria-label={`Logins: ${number}. ${detail}`} tabIndex={0}>
      {number}
    </span>
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
