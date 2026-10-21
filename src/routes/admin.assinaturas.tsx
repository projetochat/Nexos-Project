import * as React from "react";
import { createPortal } from "react-dom";
import { createFileRoute } from "@tanstack/react-router";
import {
  Ban,
  CircleCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  Eye,
  LayoutGrid,
  List,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  SearchInput,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { Modal } from "@/components/modal";
import { DashboardDateInput } from "@/components/dashboard-filters";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import { GridPaginationFooter } from "@/components/grid-pagination-footer";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatPlatformCurrency,
  formatPlatformMoneyInput,
  maskPlatformMoney,
  parsePlatformMoneyToCents,
} from "@/lib/platform-field-formats";
import {
  apiErrorMessageWithRequestId,
  platformApi,
  type PlatformClient,
  type PlatformPlan,
  type PlatformSubscription,
  type PlatformSubscriptionDetail,
} from "@/lib/trixus-api";
import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields";

export const Route = createFileRoute("/admin/assinaturas")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: AssinaturasAdmin,
});

type FlowStatus =
  | "TRIALING"
  | "DRAFT"
  | "PENDING_FINANCE"
  | "FINANCE_RELEASED"
  | "ACTIVE"
  | "SUSPENDED"
  | "CANCELLED";
type Period = "all" | "today" | "week" | "month" | "year" | "custom";

const statusFilterOptions: Array<{ status: FlowStatus; label: string }> = [
  { status: "TRIALING", label: "Trial" },
  { status: "DRAFT", label: "Em cadastro" },
  { status: "PENDING_FINANCE", label: "Aguardando financeiro" },
  { status: "FINANCE_RELEASED", label: "Financeiro liberado" },
  { status: "ACTIVE", label: "Ativo" },
  { status: "SUSPENDED", label: "Suspensa" },
  { status: "CANCELLED", label: "Canceladas" },
];

const statusCards: Array<{
  key: string;
  statuses: FlowStatus[];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  {
    key: "trial",
    statuses: ["TRIALING"],
    label: "Trial",
    icon: Timer,
    color: "text-warning bg-warning/10",
  },
  {
    key: "in-progress",
    statuses: ["DRAFT", "PENDING_FINANCE"],
    label: "Em andamento",
    icon: ClipboardList,
    color: "text-info bg-info/10",
  },
  {
    key: "finance-released",
    statuses: ["FINANCE_RELEASED"],
    label: "Financeiro liberado",
    icon: CreditCard,
    color: "text-success bg-success/10",
  },
  {
    key: "active",
    statuses: ["ACTIVE"],
    label: "Ativo",
    icon: CircleCheck,
    color: "text-success bg-success/10",
  },
  {
    key: "suspended",
    statuses: ["SUSPENDED"],
    label: "Suspensa",
    icon: Pause,
    color: "text-destructive bg-destructive/10",
  },
  {
    key: "cancelled",
    statuses: ["CANCELLED"],
    label: "Canceladas",
    icon: Ban,
    color: "text-destructive bg-destructive/10",
  },
];

function AssinaturasAdmin() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = React.useState<"cards" | "list">("list");
  const viewModeTouched = React.useRef(false);
  const [rows, setRows] = React.useState<PlatformSubscription[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [clients, setClients] = React.useState<PlatformClient[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [dialog, setDialog] = React.useState<{
    kind: "suspend" | "cancel";
    row: PlatformSubscription;
  } | null>(null);
  const [activationTarget, setActivationTarget] = React.useState<PlatformSubscription | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<PlatformSubscription | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [city, setCity] = React.useState("");
  const [uf, setUf] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [period, setPeriod] = React.useState<Period>("all");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    if (isMobile) {
      setViewMode("cards");
      return;
    }
    if (!viewModeTouched.current) setViewMode("list");
  }, [isMobile]);

  const load = React.useCallback(() => {
    setError(null);
    Promise.all([
      platformApi.subscriptions({ pageSize: 100 }),
      platformApi.plans({ pageSize: 100 }),
      platformApi.clients({ pageSize: 100 }),
    ])
      .then(([subscriptions, planList, clientList]) => {
        setRows(subscriptions.items);
        setPlans(planList.items);
        setClients(clientList.items);
      })
      .catch((loadError) => setError((loadError as Error).message));
  }, []);
  React.useEffect(() => void load(), [load]);

  const plansById = React.useMemo(() => new Map(plans.map((item) => [item.id, item])), [plans]);
  const clientsById = React.useMemo(
    () => new Map(clients.map((item) => [item.id, item])),
    [clients],
  );
  const cities = React.useMemo(
    () => [...new Set(clients.map((item) => item.city).filter(Boolean))].sort(),
    [clients],
  );
  const states = React.useMemo(
    () => [...new Set(clients.map((item) => item.state).filter(Boolean))].sort(),
    [clients],
  );
  const counts = React.useMemo(() => {
    const map = new Map(statusCards.map((item) => [item.key, 0]));
    rows.forEach((row) => {
      const normalized = normalizeSubscriptionStatus(row.status);
      const card = statusCards.find((item) => item.statuses.includes(normalized));
      if (card) map.set(card.key, (map.get(card.key) ?? 0) + 1);
    });
    return map;
  }, [rows]);
  const range = React.useMemo(() => periodRange(period, start, end), [end, period, start]);
  const filtered = rows.filter((row) => {
    const client = getClient(row, clientsById);
    const when = new Date(row.startsAt ?? row.currentPeriodStart).getTime();
    return (
      (!status || normalizeSubscriptionStatus(row.status) === status) &&
      (!city || client.city === city) &&
      (!uf || client.state === uf) &&
      (!range.from || when >= range.from) &&
      (!range.to || when <= range.to) &&
      (!q.trim() ||
        normalize(`${client.name} ${client.responsibleName} ${row.plan.name}`).includes(
          normalize(q),
        ))
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const visibleRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const hasActiveFilters = Boolean(q || city || uf || status || period !== "all" || start || end);

  function clearFilters() {
    setQ("");
    setCity("");
    setUf("");
    setStatus("");
    setPeriod("all");
    setStart("");
    setEnd("");
    setPage(1);
  }

  React.useEffect(() => {
    setPage(1);
  }, [q, city, uf, status, period, start, end, pageSize]);

  React.useEffect(() => {
    if (page !== pageSafe) setPage(pageSafe);
  }, [page, pageSafe]);

  async function immediate(row: PlatformSubscription, kind: "finance" | "activate") {
    const message = validateImmediateAction(normalizeSubscriptionStatus(row.status), kind);
    if (message) {
      toast.error(message);
      return false;
    }
    const handler =
      kind === "finance"
        ? platformApi.generateSubscriptionFinance
        : platformApi.activateSubscription;
    setBusyId(row.id);
    try {
      await handler(row.id);
      toast.success(
        kind === "finance"
          ? "Financeiro gerado."
          : normalizeSubscriptionStatus(row.status) === "CANCELLED"
            ? "Assinatura reativada com uma nova Tenant."
            : normalizeSubscriptionStatus(row.status) === "SUSPENDED"
              ? "Assinatura reativada."
              : "Assinatura ativada.",
      );
      load();
      return true;
    } catch (actionError) {
      toast.error(apiErrorMessageWithRequestId(actionError));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const paginationFooter = (
    <GridPaginationFooter
      visible={visibleRows.length}
      total={filtered.length}
      page={pageSafe}
      totalPages={totalPages}
      pageSize={pageSize}
      onPage={(nextPage) => setPage(nextPage)}
      onPageSize={(nextPageSize) => setPageSize(nextPageSize)}
      ariaLabelPrefix="assinaturas"
    />
  );

  return (
    <AdminContainer className="max-w-[112rem]">
      <SectionHeader
        title="Assinaturas"
        subtitle="Gerencie o ciclo das assinaturas, do cadastro à ativação."
        subtitleClassName="hidden md:block"
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova assinatura
          </Button>
        }
      />
      <Card className="p-4 sm:p-4">
        <div
          className={`grid grid-cols-2 gap-3 ${
            hasActiveFilters
              ? "xl:grid-cols-[minmax(220px,2.2fr)_1fr_.7fr_1.1fr_1fr_1fr_1fr_auto]"
              : "xl:grid-cols-[minmax(220px,2.2fr)_1fr_.7fr_1.1fr_1fr_1fr_1fr]"
          }`}
          data-platform-filter-grid
        >
          <Filter label="Busca" className="col-span-2 xl:col-span-1">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Buscar por cliente, responsável ou plano..."
            />
          </Filter>
          <Filter label="Cidade">
            <Select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Todas</option>
              {cities.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Filter>
          <Filter label="UF">
            <Select value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Todas</option>
              {states.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Filter>
          <Filter label="Situação">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas</option>
              {statusFilterOptions.map((item) => (
                <option key={item.status} value={item.status}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Filter>
          <Filter label="Período">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="all">Todos</option>
              <option value="today">Hoje</option>
              <option value="week">Essa semana</option>
              <option value="month">Esse mês</option>
              <option value="year">Esse ano</option>
              <option value="custom">Personalizado</option>
            </Select>
          </Filter>
          <Filter label="Dt. Inicial">
            <DashboardDateInput
              value={period === "custom" ? start : dateValue(range.from)}
              readOnly={period !== "custom"}
              mobilePlaceholder={period === "all" ? "dd/mm/aaaa" : undefined}
              onChange={setStart}
            />
          </Filter>
          <Filter label="Dt. Final">
            <DashboardDateInput
              value={period === "custom" ? end : dateValue(range.to)}
              readOnly={period !== "custom"}
              mobilePlaceholder={period === "all" ? "dd/mm/aaaa" : undefined}
              onChange={setEnd}
            />
          </Filter>
          {hasActiveFilters && (
            <div className="col-span-2 flex justify-end xl:col-span-1 xl:items-end">
              <ClearFiltersButton onClick={clearFilters} />
            </div>
          )}
        </div>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {statusCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key} className="flex min-h-24 flex-col p-3 sm:p-3">
              <div className="w-full text-xs uppercase tracking-widest text-muted-foreground">
                {card.label}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <div className="text-xl font-semibold">{counts.get(card.key) ?? 0}</div>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${card.color}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
            </Card>
          );
        })}
      </div>
      <div
        className="mt-3 hidden justify-end gap-1 md:flex"
        aria-label="Visualização das assinaturas"
      >
        <Button
          type="button"
          variant={viewMode === "cards" ? "primary" : "secondary"}
          size="icon"
          aria-label="Visualizar assinaturas em cards"
          aria-pressed={viewMode === "cards"}
          onClick={() => {
            viewModeTouched.current = true;
            setViewMode("cards");
          }}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={viewMode === "list" ? "primary" : "secondary"}
          size="icon"
          aria-label="Visualizar assinaturas em lista"
          aria-pressed={viewMode === "list"}
          onClick={() => {
            viewModeTouched.current = true;
            setViewMode("list");
          }}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
      {error && <div className="mt-4 text-sm text-destructive">{error}</div>}
      <div
        data-platform-card-shell
        className={
          viewMode === "cards"
            ? "mt-4 md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:shadow-card"
            : "hidden"
        }
      >
        <div
          data-platform-mobile-list
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:p-4 xl:grid-cols-3"
        >
          {visibleRows.map((row) => (
            <SubscriptionMobileCard
              key={row.id}
              row={row}
              plan={plansById.get(row.plan.id)}
              client={getClient(row, clientsById)}
              disabled={busyId === row.id}
              onFinance={() => void immediate(row, "finance")}
              onDetail={() => setDetailTarget(row)}
              onActivate={() => setActivationTarget(row)}
              onSuspend={() => setDialog({ kind: "suspend", row })}
              onCancel={() => setDialog({ kind: "cancel", row })}
            />
          ))}
          {!filtered.length && (
            <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
              Nenhuma assinatura encontrada.
            </div>
          )}
        </div>
        <div className="hidden md:block" data-platform-card-pagination>
          {paginationFooter}
        </div>
      </div>
      <Card className={viewMode === "list" ? "mt-4 overflow-hidden" : "hidden"} padding={false}>
        <div data-platform-desktop-table className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed text-xs xl:text-sm">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[6%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead className="bg-surface-2">
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-2 py-3">Contato responsável</th>
                <th className="px-2 py-3">Plano</th>
                <th className="px-2 py-3">Tipo</th>
                <th className="px-2 py-3 text-right leading-tight">Vlr. mensal (bruto)</th>
                <th className="px-2 py-3 text-right leading-tight">Vlr. desconto</th>
                <th className="px-2 py-3 text-right leading-tight">Vlr. líquido</th>
                <th className="px-2 py-3 text-center leading-tight">Dt./Hr.</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const plan = plansById.get(row.plan.id);
                const client = getClient(row, clientsById);
                const gross = row.monthlyValueCents ?? plan?.priceCents ?? 0;
                const discount = row.discountCents ?? 0;
                return (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-surface-1">
                    <td className="truncate px-4 py-3 font-medium" title={client.name}>
                      {client.name}
                    </td>
                    <td
                      className="truncate px-2 py-3"
                      title={client.responsibleName || "Não informado"}
                    >
                      {client.responsibleName}
                    </td>
                    <td className="truncate px-2 py-3" title={row.plan.name}>
                      {row.plan.name}
                    </td>
                    <td className="px-2 py-3">
                      {plan?.billingPeriod === "YEARLY" ? "Anual" : "Mensal"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      {formatPlatformCurrency(gross)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      {formatPlatformCurrency(discount)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                      {formatPlatformCurrency(Math.max(0, gross - discount))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-center">
                      {formatSubscriptionDate(row.startsAt ?? row.currentPeriodStart)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Actions
                        status={normalizeSubscriptionStatus(row.status)}
                        disabled={busyId === row.id}
                        onFinance={() => void immediate(row, "finance")}
                        onDetail={() => setDetailTarget(row)}
                        onActivate={() => setActivationTarget(row)}
                        onSuspend={() => setDialog({ kind: "suspend", row })}
                        onCancel={() => setDialog({ kind: "cancel", row })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma assinatura encontrada.
            </div>
          )}
        </div>
        {paginationFooter}
      </Card>
      <CreateForm
        open={creating}
        plans={plans}
        clients={clients}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />
      <ActionDialog
        value={dialog}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          load();
        }}
      />
      <ActivationConfirmModal
        value={activationTarget}
        onClose={() => setActivationTarget(null)}
        onConfirm={async (row) => {
          const activated = await immediate(row, "activate");
          if (activated) setActivationTarget(null);
          return activated;
        }}
      />
      <SubscriptionDetailModal value={detailTarget} onClose={() => setDetailTarget(null)} />
    </AdminContainer>
  );
}

function SubscriptionMobileCard({
  row,
  plan,
  client,
  disabled,
  onFinance,
  onDetail,
  onActivate,
  onSuspend,
  onCancel,
}: {
  row: PlatformSubscription;
  plan?: PlatformPlan;
  client: { name: string; responsibleName: string };
  disabled: boolean;
  onFinance: () => void;
  onDetail: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onCancel: () => void;
}) {
  const gross = row.monthlyValueCents ?? plan?.priceCents ?? 0;
  const discount = row.discountCents ?? 0;
  return (
    <article className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{client.name}</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{client.responsibleName}</p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/70 py-3 text-sm">
        <MobileSubscriptionDetail label="Plano" value={row.plan.name} />
        <MobileSubscriptionDetail
          label="Tipo"
          value={plan?.billingPeriod === "YEARLY" ? "Anual" : "Mensal"}
        />
        <MobileSubscriptionDetail label="Valor bruto" value={formatPlatformCurrency(gross)} />
        <MobileSubscriptionDetail label="Desconto" value={formatPlatformCurrency(discount)} />
        <MobileSubscriptionDetail
          label="Valor líquido"
          value={formatPlatformCurrency(Math.max(0, gross - discount))}
        />
        <MobileSubscriptionDetail
          label="Início"
          value={formatSubscriptionDate(row.startsAt ?? row.currentPeriodStart)}
        />
      </dl>
      <div className="mt-3 flex justify-end">
        <SubscriptionCardActions
          status={normalizeSubscriptionStatus(row.status)}
          disabled={disabled}
          onFinance={onFinance}
          onDetail={onDetail}
          onActivate={onActivate}
          onSuspend={onSuspend}
          onCancel={onCancel}
        />
      </div>
    </article>
  );
}

function SubscriptionCardActions({
  status,
  disabled,
  onDetail,
  onFinance,
  onActivate,
  onSuspend,
  onCancel,
}: {
  status: FlowStatus;
  disabled: boolean;
  onDetail: () => void;
  onFinance: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onCancel: () => void;
}) {
  const canGenerateFinance = status === "DRAFT" || status === "TRIALING";
  const canActivate = ["FINANCE_RELEASED", "SUSPENDED", "CANCELLED"].includes(status);
  const canSuspend = status === "ACTIVE";
  const canCancel = status !== "CANCELLED";
  const activateLabel =
    status === "SUSPENDED" || status === "CANCELLED" ? "Reativar assinatura" : "Ativar assinatura";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1" aria-label="Ações da assinatura">
      <CardActionIcon
        icon={Eye}
        label="Detalhar"
        tone="primary"
        disabled={disabled}
        onClick={onDetail}
      />
      <CardActionIcon
        icon={DollarSign}
        label="Gerar financeiro"
        tone="success"
        disabled={disabled || !canGenerateFinance}
        onClick={onFinance}
      />
      <CardActionIcon
        icon={Play}
        label={activateLabel}
        tone="primary"
        disabled={disabled || !canActivate}
        onClick={onActivate}
      />
      <CardActionIcon
        icon={Pause}
        label="Suspender assinatura"
        tone="destructive"
        disabled={disabled || !canSuspend}
        onClick={onSuspend}
      />
      <CardActionIcon
        icon={Ban}
        label="Cancelar assinatura"
        tone="destructive"
        disabled={disabled || !canCancel}
        onClick={onCancel}
      />
    </div>
  );
}

function CardActionIcon({
  icon: Icon,
  label,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "primary" | "success" | "destructive";
  disabled: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    primary: "action-hover-primary",
    success: "action-hover-success",
    destructive: "action-hover-destructive",
  }[tone];

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-1 text-muted-foreground transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function MobileSubscriptionDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}

function CreateForm({
  open,
  plans,
  clients,
  onClose,
  onSaved,
}: {
  open: boolean;
  plans: PlatformPlan[];
  clients: PlatformClient[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const activePlans = React.useMemo(
    () => plans.filter((item) => item.status === "ACTIVE"),
    [plans],
  );
  const eligibleClients = React.useMemo(
    () => clients.filter((item) => item.status !== "CANCELLED"),
    [clients],
  );
  const [clientId, setClientId] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [gross, setGross] = React.useState("0,00");
  const [discount, setDiscount] = React.useState("0,00");
  const [coupon, setCoupon] = React.useState(false);
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [indefinite, setIndefinite] = React.useState(true);
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    const plan = activePlans[0];
    setClientId(eligibleClients[0]?.id ?? "");
    setPlanId(plan?.id ?? "");
    setGross(formatPlatformMoneyInput(plan?.priceCents ?? 0));
    setDiscount("0,00");
    setCoupon(false);
    setStartsAt(new Date().toISOString().slice(0, 10));
    setEndsAt("");
    setIndefinite(true);
    setNotes("");
  }, [activePlans, eligibleClients, open]);
  const client = eligibleClients.find((item) => item.id === clientId);
  const grossCents = parsePlatformMoneyToCents(gross);
  const discountCents = coupon ? parsePlatformMoneyToCents(discount) : 0;
  const net = Math.max(0, grossCents - discountCents);
  React.useEffect(() => {
    setErrors((current) => {
      const next = { ...current };
      if (client) delete next.clientId;
      if (client?.responsibleName.trim()) delete next.responsibleName;
      if (client?.responsibleEmail.trim()) delete next.responsibleEmail;
      if (planId) delete next.planId;
      if (startsAt) delete next.startsAt;
      if (indefinite || endsAt) delete next.endsAt;
      if (grossCents > 0) delete next.gross;
      if (!coupon || discountCents > 0) delete next.discount;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [client, coupon, discountCents, endsAt, grossCents, indefinite, planId, startsAt]);
  async function save() {
    const nextErrors: Record<string, boolean> = {
      ...(!client ? { clientId: true } : {}),
      ...(!client?.responsibleName.trim() ? { responsibleName: true } : {}),
      ...(!client?.responsibleEmail.trim() ? { responsibleEmail: true } : {}),
      ...(!planId ? { planId: true } : {}),
      ...(!startsAt ? { startsAt: true } : {}),
      ...(!indefinite && !endsAt ? { endsAt: true } : {}),
    };
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      showRequiredFieldsToast(
        [
          ["clientId", "Cliente"],
          ["responsibleName", "Contato responsável"],
          ["responsibleEmail", "E-mail do responsável"],
          ["planId", "Plano"],
          ["startsAt", "Início do período"],
          ["endsAt", "Fim do período"],
        ]
          .filter(([key]) => nextErrors[key])
          .map(([, label]) => label),
      );
      return;
    }
    if (grossCents <= 0) {
      setErrors({ gross: true });
      return void toast.error("Informe um valor mensal válido.");
    }
    if (coupon && discountCents <= 0) {
      setErrors({ discount: true });
      return void toast.error("Informe o valor de desconto.");
    }
    if (discountCents > grossCents)
      return void toast.error("O desconto não pode ser maior que o valor mensal.");
    if (!indefinite && !endsAt)
      return void toast.error("Informe o fim do período ou marque Indeterminado.");
    if (!indefinite && endsAt < startsAt)
      return void toast.error("O fim do período não pode ser anterior ao início.");
    setSaving(true);
    try {
      await platformApi.createClientSubscription(clientId, {
        planId,
        startsAt: new Date(`${startsAt}T12:00:00`).toISOString(),
        currentPeriodEnd: indefinite ? undefined : new Date(`${endsAt}T12:00:00`).toISOString(),
        indefinite,
        monthlyValueCents: grossCents,
        discountCents,
        notes: notes.trim() || undefined,
      });
      toast.success("Assinatura cadastrada.");
      onSaved();
    } catch (saveError) {
      toast.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerenciar Assinatura"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className="save-action-button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <Field label="Status *">
            <div className="flex min-h-10 items-center rounded-lg border border-border bg-surface-1 px-3">
              <StatusBadge status="REGISTERING" />
            </div>
          </Field>
        </div>
        <div className="sm:col-span-4">
          <Field label="Cliente *">
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={requiredFieldClassName(Boolean(errors.clientId))}
              aria-invalid={Boolean(errors.clientId)}
            >
              {!eligibleClients.length && <option value="">Nenhum cliente disponível</option>}
              {eligibleClients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Contato responsável *">
            <Input
              disabled
              value={client?.responsibleName ?? ""}
              className={requiredFieldClassName(Boolean(errors.responsibleName))}
              aria-invalid={Boolean(errors.responsibleName)}
            />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="E-mail do responsável *">
            <Input
              disabled
              value={client?.responsibleEmail ?? ""}
              className={requiredFieldClassName(Boolean(errors.responsibleEmail))}
              aria-invalid={Boolean(errors.responsibleEmail)}
            />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Plano *">
            <Select
              value={planId}
              className={requiredFieldClassName(Boolean(errors.planId))}
              aria-invalid={Boolean(errors.planId)}
              onChange={(e) => {
                const id = e.target.value;
                setPlanId(id);
                const plan = activePlans.find((item) => item.id === id);
                if (plan?.priceCents != null) setGross(formatPlatformMoneyInput(plan.priceCents));
              }}
            >
              {!activePlans.length && <option value="">Nenhum plano ativo disponível</option>}
              {activePlans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Valor mensal (bruto) *">
            <Money value={gross} onChange={setGross} invalid={Boolean(errors.gross)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Possui cupom de desconto *">
            <ToggleLine value={coupon} onChange={setCoupon} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={`Valor de desconto${coupon ? " *" : ""}`}>
            <Money
              value={coupon ? discount : "0,00"}
              disabled={!coupon}
              onChange={setDiscount}
              invalid={Boolean(errors.discount)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Valor final (líquido) *">
            <Money value={formatPlatformMoneyInput(net)} disabled onChange={() => undefined} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Início do período *">
            <div
              aria-invalid={Boolean(errors.startsAt)}
              className={`rounded-lg border ${errors.startsAt ? `${requiredFieldClassName(true)} [&_input]:!border-transparent` : "border-transparent"}`}
            >
              <DashboardDateInput value={startsAt} readOnly={false} onChange={setStartsAt} />
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Fim do período">
            <div
              aria-invalid={Boolean(errors.endsAt)}
              className={`rounded-lg border ${errors.endsAt ? `${requiredFieldClassName(true)} [&_input]:!border-transparent` : "border-transparent"}`}
            >
              <DashboardDateInput value={endsAt} readOnly={indefinite} onChange={setEndsAt} />
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Indeterminado">
            <ToggleLine
              value={indefinite}
              onChange={(checked) => {
                setIndefinite(checked);
                if (checked) setEndsAt("");
              }}
            />
          </Field>
        </div>
        <div className="sm:col-span-6">
          <Field label="Nota">
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais sobre a assinatura..."
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function Actions({
  status,
  disabled,
  onDetail,
  onFinance,
  onActivate,
  onSuspend,
  onCancel,
}: {
  status: FlowStatus;
  disabled: boolean;
  onDetail: () => void;
  onFinance: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const canGenerateFinance = status === "DRAFT" || status === "TRIALING";
  const canActivate = ["FINANCE_RELEASED", "SUSPENDED", "CANCELLED"].includes(status);
  const canSuspend = status === "ACTIVE";
  const canCancel = status !== "CANCELLED";

  const updatePosition = React.useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeight = 218;
    const gap = 4;
    const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth));
    const top =
      rect.bottom + menuHeight + gap <= window.innerHeight
        ? rect.bottom + gap
        : Math.max(8, rect.top - menuHeight - gap);
    setPosition({ top, left });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, updatePosition]);

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[100] w-56 rounded-lg border border-border bg-card p-1 shadow-xl"
      style={position}
    >
      <ActionButton
        icon={Eye}
        label="Detalhar"
        tone="primary"
        disabled={disabled}
        onClick={onDetail}
        onClose={() => setOpen(false)}
      />
      <ActionButton
        icon={DollarSign}
        label="Gerar financeiro"
        tone="success"
        disabled={disabled || !canGenerateFinance}
        onClick={onFinance}
        onClose={() => setOpen(false)}
      />
      <ActionButton
        icon={Play}
        label={
          status === "SUSPENDED" || status === "CANCELLED"
            ? "Reativar assinatura"
            : "Ativar assinatura"
        }
        tone="primary"
        disabled={disabled || !canActivate}
        onClick={onActivate}
        onClose={() => setOpen(false)}
      />
      <ActionButton
        icon={Pause}
        label="Suspender assinatura"
        tone="destructive"
        disabled={disabled || !canSuspend}
        onClick={onSuspend}
        onClose={() => setOpen(false)}
      />
      <ActionButton
        icon={Ban}
        label="Cancelar assinatura"
        disabled={disabled || !canCancel}
        onClick={onCancel}
        onClose={() => setOpen(false)}
        tone="destructive"
      />
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Ações"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-1 hover:bg-surface-2"
      >
        <MoreVertical className="h-4 w-4" />
        <span className="sr-only">Ações</span>
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}
function ActionButton({
  icon: Icon,
  label,
  disabled,
  tone,
  onClick,
  onClose,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled: boolean;
  tone: "primary" | "success" | "destructive";
  onClick: () => void;
  onClose: () => void;
}) {
  const toneClass = {
    primary: "action-hover-primary",
    success: "action-hover-success",
    destructive: "action-hover-destructive",
  }[tone];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onClick();
        onClose();
      }}
      className={`flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-left text-sm transition disabled:opacity-50 ${toneClass}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ActionDialog({
  value,
  onClose,
  onSaved,
}: {
  value: { kind: "suspend" | "cancel"; row: PlatformSubscription } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setReason("");
    setReasonError(false);
  }, [value]);
  React.useEffect(() => {
    if (reason.trim()) setReasonError(false);
  }, [reason]);
  if (!value) return null;
  const current = value;
  const status = normalizeSubscriptionStatus(current.row.status);
  const suspend = current.kind === "suspend";
  async function confirm() {
    if (suspend && status !== "ACTIVE")
      return void toast.error(
        status === "SUSPENDED"
          ? "O registro já se encontra suspenso e não pode ser suspenso novamente."
          : "A suspensão só é permitida para uma assinatura ativa.",
      );
    if (suspend && !reason.trim()) {
      setReasonError(true);
      showRequiredFieldsToast(["Motivo da suspensão"]);
      return;
    }
    if (!suspend && status === "CANCELLED")
      return void toast.error(
        "O registro já se encontra cancelado e não pode ser cancelado novamente.",
      );
    if (
      !suspend &&
      !["DRAFT", "TRIALING", "PENDING_FINANCE", "FINANCE_RELEASED", "ACTIVE", "SUSPENDED"].includes(
        status,
      )
    )
      return void toast.error("O cancelamento não é permitido no status atual.");
    setSaving(true);
    try {
      if (suspend) {
        await platformApi.suspendSubscription(current.row.id, { reason: reason.trim() });
        toast.success("Assinatura suspensa.");
      } else {
        await platformApi.cancelSubscription(current.row.id, {
          reason: "Cancelamento confirmado pelo administrador da plataforma.",
          cancelAtPeriodEnd: false,
        });
        toast.success("Assinatura cancelada.");
      }
      onSaved();
    } catch (actionError) {
      toast.error((actionError as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={suspend ? "Suspender assinatura" : "Cancelar assinatura"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant={suspend ? "primary" : "destructive"}
            disabled={saving}
            onClick={() => void confirm()}
          >
            {saving ? "Processando..." : "Confirmar"}
          </Button>
        </>
      }
    >
      {suspend ? (
        <Field label="Motivo da suspensão *">
          <Textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={requiredFieldClassName(reasonError)}
            aria-invalid={reasonError}
          />
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">
          Confirma o cancelamento desta assinatura? A Tenant vinculada e todos os seus dados serão
          excluídos definitivamente. A assinatura, o cliente, o financeiro e o histórico do Platform
          serão preservados.
        </p>
      )}
    </Modal>
  );
}

function ActivationConfirmModal({
  value,
  onClose,
  onConfirm,
}: {
  value: PlatformSubscription | null;
  onClose: () => void;
  onConfirm: (row: PlatformSubscription) => Promise<boolean>;
}) {
  const [saving, setSaving] = React.useState(false);
  const status = value ? normalizeSubscriptionStatus(value.status) : null;
  const reactivatingSuspended = status === "SUSPENDED";
  const recreatingCancelled = status === "CANCELLED";
  const reactivating = reactivatingSuspended || recreatingCancelled;

  const confirm = async () => {
    if (!value) return;
    setSaving(true);
    try {
      await onConfirm(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      closeOnBackdrop={!saving}
      title={reactivating ? "Reativar assinatura" : "Ativar assinatura"}
      description="Confirme os dados antes de continuar."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Voltar
          </Button>
          <Button onClick={() => void confirm()} disabled={saving}>
            {saving ? "Processando..." : reactivating ? "Reativar" : "Ativar"}
          </Button>
        </>
      }
    >
      {value && (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border bg-surface-1 p-4">
            <div className="font-semibold">{value.client?.name ?? value.tenant?.name}</div>
            <div className="mt-1 text-muted-foreground">Plano {value.plan.name}</div>
          </div>
          <p className="text-muted-foreground">
            {reactivating
              ? recreatingCancelled
                ? "Uma nova Tenant será criada e configurada do zero. Os dados da Tenant excluída não serão recuperados."
                : "A Tenant existente e o acesso dos usuários serão restabelecidos."
              : "A Tenant será criada e configurada conforme o plano. O convite para definição da senha será enviado ao e-mail do responsável."}
          </p>
        </div>
      )}
    </Modal>
  );
}

function SubscriptionDetailModal({
  value,
  onClose,
}: {
  value: PlatformSubscription | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<PlatformSubscriptionDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!value) {
      setDetail(null);
      setError(null);
      return;
    }
    let active = true;
    setDetail(null);
    setError(null);
    platformApi
      .subscription(value.id)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, [value]);

  const gross = detail?.monthlyValueCents ?? detail?.plan.priceCents ?? 0;
  const discount = detail?.discountCents ?? 0;

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title="Detalhes da assinatura"
      description="Visão completa do cliente, plano, assinatura e financeiro."
      size="xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {!detail && !error && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Carregando detalhes...
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}
      {detail && (
        <div className="space-y-6">
          <DetailSection title="Cliente" subtitle="Dados cadastrais e contato responsável.">
            <DetailValue label="Nome" value={detail.client?.name ?? detail.tenant?.name ?? "—"} />
            <DetailValue label="CNPJ" value={detail.client?.document ?? "Não informado"} />
            <DetailValue
              label="Responsável"
              value={detail.client?.responsibleName ?? detail.tenant?.responsibleName ?? "—"}
            />
            <DetailValue
              label="E-mail"
              value={detail.client?.responsibleEmail ?? detail.tenant?.responsibleEmail ?? "—"}
            />
            <DetailValue
              label="Cidade/UF"
              value={detail.client ? `${detail.client.city} / ${detail.client.state}` : "—"}
            />
            <DetailValue label="Situação do cliente" value={detail.client?.status ?? "—"} />
            <DetailValue
              label="Cadastro"
              value={formatOptionalDateTime(detail.client?.registeredAt ?? null)}
            />
            <DetailValue
              label="Observações"
              value={detail.client?.notes || "Sem observações"}
              wide
            />
          </DetailSection>

          <DetailSection title="Plano" subtitle="Configuração contratada pela assinatura.">
            <DetailValue label="Plano" value={detail.plan.name} />
            <DetailValue label="Código" value={detail.plan.code} />
            <DetailValue label="Status" value={detail.plan.status} />
            <DetailValue
              label="Periodicidade"
              value={detail.plan.billingPeriod === "YEARLY" ? "Anual" : "Mensal"}
            />
            <DetailValue
              label="Preço do plano"
              value={formatPlatformCurrency(detail.plan.priceCents ?? 0)}
            />
            <DetailValue label="Dias de trial" value={String(detail.plan.trialDays)} />
            <DetailValue
              label="Descrição"
              value={detail.plan.description || "Sem descrição"}
              wide
            />
            <DetailValue label="Limites" value={formatKeyValues(detail.limitsSnapshot)} wide />
            <DetailValue
              label="Módulos habilitados"
              value={formatEnabledFeatures(detail.featuresSnapshot)}
              wide
            />
          </DetailSection>

          <DetailSection title="Assinatura" subtitle="Período, situação e valores contratados.">
            <DetailValue label="Status" value={<StatusBadge status={detail.status} />} />
            <DetailValue
              label="Tenant"
              value={
                detail.tenant
                  ? `${detail.tenant.slug} · ${detail.tenant.status}`
                  : normalizeSubscriptionStatus(detail.status) === "CANCELLED"
                    ? "Excluída após cancelamento"
                    : "Ainda não criada"
              }
            />
            <DetailValue label="Início" value={formatOptionalDateTime(detail.startsAt)} />
            <DetailValue
              label="Fim do período"
              value={
                detail.indefinite
                  ? "Indeterminado"
                  : formatOptionalDateTime(detail.currentPeriodEnd)
              }
            />
            <DetailValue label="Trial até" value={formatOptionalDateTime(detail.trialEndsAt)} />
            <DetailValue label="Cancelada em" value={formatOptionalDateTime(detail.cancelledAt)} />
            <DetailValue label="Valor bruto" value={formatPlatformCurrency(gross)} />
            <DetailValue label="Desconto" value={formatPlatformCurrency(discount)} />
            <DetailValue
              label="Valor líquido"
              value={formatPlatformCurrency(Math.max(0, gross - discount))}
            />
            <DetailValue label="Cupom" value={detail.couponCode || "Não possui"} />
            <DetailValue
              label="Criada em"
              value={formatOptionalDateTime(detail.createdAt ?? null)}
            />
            <DetailValue label="Atualizada em" value={formatOptionalDateTime(detail.updatedAt)} />
            <DetailValue
              label="Motivo da suspensão"
              value={detail.suspensionReason || "Não informado"}
              wide
            />
            <DetailValue label="Nota" value={detail.notes || "Sem nota"} wide />
          </DetailSection>

          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-semibold">Financeiro</h3>
              <p className="text-xs text-muted-foreground">Faturas vinculadas à assinatura.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="bg-surface-1 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Fatura</th>
                    <th>Referência</th>
                    <th>Vencimento</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Pago</th>
                    <th className="text-center">Liberada</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t border-border/70">
                      <td className="px-4 py-3 font-medium">{invoice.number}</td>
                      <td>{invoice.reference || "—"}</td>
                      <td>{formatOptionalDateTime(invoice.dueAt)}</td>
                      <td className="text-right">{formatPlatformCurrency(invoice.totalCents)}</td>
                      <td className="text-right">{formatPlatformCurrency(invoice.paidCents)}</td>
                      <td className="text-center">{invoice.released ? "Sim" : "Não"}</td>
                      <td>{invoiceStatusLabel(invoice.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail.invoices.length && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma fatura gerada.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Histórico</h3>
            <p className="text-xs text-muted-foreground">Últimas movimentações da assinatura.</p>
            <div className="mt-4 space-y-3">
              {detail.history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex gap-3 rounded-lg border border-border bg-surface-1 p-3"
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {entry.previousStatus ?? "Início"} → {entry.nextStatus ?? "Sem alteração"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {entry.reason} · {formatOptionalDateTime(entry.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
              {!detail.history.length && (
                <div className="text-sm text-muted-foreground">
                  Nenhuma movimentação registrada.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

function DetailSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function DetailValue({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface-1 px-3 py-2 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
    >
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function formatOptionalDateTime(value: string | null) {
  return value ? formatSubscriptionDate(value) : "Não informado";
}

function formatKeyValues(values: Record<string, number>) {
  const entries = Object.entries(values);
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join(" · ")
    : "Sem limites";
}

function formatEnabledFeatures(values: Record<string, boolean>) {
  const enabled = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return enabled.length ? enabled.join(" · ") : "Nenhum módulo habilitado";
}

function invoiceStatusLabel(status: string) {
  return (
    {
      DRAFT: "Rascunho",
      OPEN: "Em aberto",
      RELEASED: "Liberada",
      PAID: "Paga",
      OVERDUE: "Vencida",
      CANCELLED: "Cancelada",
    }[status] ?? status
  );
}

function StatusBadge({ status }: { status: string }) {
  const value = normalizeSubscriptionStatus(status);
  const cfg: Record<
    FlowStatus,
    { label: string; tone: "default" | "success" | "warning" | "info" | "destructive" | "brand" }
  > = {
    TRIALING: { label: "Trial", tone: "warning" },
    DRAFT: { label: "Em cadastro", tone: "info" },
    PENDING_FINANCE: { label: "Aguardando financeiro", tone: "brand" },
    FINANCE_RELEASED: { label: "Financeiro liberado", tone: "success" },
    ACTIVE: { label: "Ativo", tone: "success" },
    SUSPENDED: { label: "Suspensa", tone: "destructive" },
    CANCELLED: { label: "Cancelada", tone: "destructive" },
  };
  const toneClasses = {
    default: "border-border bg-surface-2 text-foreground",
    success: "border-success/30 bg-success/15 text-success",
    warning: "border-warning/30 bg-warning/15 text-warning",
    info: "border-info/30 bg-info/15 text-info",
    destructive: "border-destructive/30 bg-destructive/15 text-destructive",
    brand: "border-primary/30 bg-primary/15 text-primary",
  } as const;
  const selected = cfg[value];
  const statusClass =
    value === "SUSPENDED"
      ? "border-red-700/60 bg-red-600/25 text-red-700 dark:border-red-400/60 dark:bg-red-500/25 dark:text-red-300"
      : toneClasses[selected.tone];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 whitespace-normal rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${statusClass}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
      <span className="min-w-0 text-center leading-tight">{selected.label}</span>
    </span>
  );
}
function Filter({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
function ToggleLine({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex min-h-10 items-center gap-3 rounded-lg border border-border bg-surface-1 px-3">
      <Switch checked={value} onCheckedChange={onChange} />
      <span className="text-sm">{value ? "Sim" : "Não"}</span>
    </div>
  );
}
function Money({
  value,
  disabled = false,
  invalid = false,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      aria-invalid={invalid}
      className={`flex overflow-hidden rounded-lg border border-border bg-surface-1 ${requiredFieldClassName(invalid)}`}
    >
      <span className="flex items-center border-r border-border px-3 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(maskPlatformMoney(e.target.value))}
        className="rounded-none border-0 bg-transparent"
      />
    </div>
  );
}

function normalizeSubscriptionStatus(status: string): FlowStatus {
  const aliases: Record<string, FlowStatus> = {
    TRIAL: "TRIALING",
    TRIALING: "TRIALING",
    DRAFT: "DRAFT",
    REGISTERING: "DRAFT",
    REGISTERED: "DRAFT",
    REGISTRATION: "DRAFT",
    PENDING_FINANCE: "PENDING_FINANCE",
    AWAITING_FINANCE: "PENDING_FINANCE",
    FINANCE_PENDING: "PENDING_FINANCE",
    FINANCE_RELEASED: "FINANCE_RELEASED",
    FINANCIAL_RELEASED: "FINANCE_RELEASED",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    CANCELLED: "CANCELLED",
    CANCELED: "CANCELLED",
  };
  return aliases[status] ?? "DRAFT";
}
function validateImmediateAction(status: FlowStatus, action: "finance" | "activate") {
  if (action === "finance")
    return status === "DRAFT" || status === "TRIALING" ? null : "Financeiro já gerado.";
  if (status === "SUSPENDED" || status === "CANCELLED") return null;
  if (status === "DRAFT" || status === "TRIALING") return "Financeiro ainda não gerado.";
  if (status === "PENDING_FINANCE")
    return "Assinatura não pode ser ativada porque o financeiro ainda não está liberado.";
  if (status === "ACTIVE") return "A assinatura já está ativa e não pode ser ativada novamente.";
  return status === "FINANCE_RELEASED" ? null : "A ativação não é permitida no status atual.";
}
function getClient(row: PlatformSubscription, clients: Map<string, PlatformClient>) {
  const client = row.client?.id ? clients.get(row.client.id) : undefined;
  return {
    name: row.client?.name ?? client?.name ?? row.tenant?.name ?? "Cliente não informado",
    responsibleName: row.client?.responsibleName ?? client?.responsibleName ?? "Não informado",
    city: row.client?.city ?? client?.city ?? row.tenant?.platformClient?.city ?? "",
    state: row.client?.state ?? client?.state ?? row.tenant?.platformClient?.state ?? "",
  };
}
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function periodRange(period: Period, customStart: string, customEnd: string) {
  if (period === "all") return { from: 0, to: 0 };
  if (period === "custom")
    return {
      from: customStart ? new Date(`${customStart}T00:00:00`).getTime() : 0,
      to: customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : 0,
    };
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  if (period === "month") from.setDate(1);
  if (period === "year") from.setMonth(0, 1);
  return { from: from.getTime(), to: now.getTime() };
}
function dateValue(value: number) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatSubscriptionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  const formattedTime = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date);
  return `${formattedDate} ${formattedTime}`;
}
