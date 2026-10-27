import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Eye,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Receipt,
  Trash2,
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
import { ConfirmDialog, Modal } from "@/components/modal";
import { DashboardDateInput } from "@/components/dashboard-filters";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import { GridPaginationFooter } from "@/components/grid-pagination-footer";
import { useIsMobile } from "@/hooks/use-mobile";
import { fmtDate } from "@/lib/format";
import { DASHBOARD_PERIOD_OPTIONS, datesForOperationalPeriod } from "@/lib/operational-filters";
import {
  formatPlatformCurrency,
  formatPlatformMoneyInput,
  maskPlatformMoney,
  parsePlatformMoneyToCents,
} from "@/lib/platform-field-formats";
import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields";
import {
  platformApi,
  type OperationalPeriod,
  type PlatformInvoice,
  type PlatformSubscription,
} from "@/lib/trixus-api";

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: FinanceiroAdmin,
});

type FinanceInvoice = PlatformInvoice & {
  paidCents?: number;
  released?: boolean;
};

type FinancePeriod = OperationalPeriod | "all";

type FinanceSubscription = Omit<PlatformSubscription, "tenant"> & {
  tenant: PlatformSubscription["tenant"] | null;
};

type FinanceApi = typeof platformApi & {
  updateInvoice: (id: string, data: Record<string, unknown>) => Promise<PlatformInvoice>;
  deleteInvoice: (id: string) => Promise<{ id: string; deleted: boolean }>;
};

function FinanceiroAdmin() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = React.useState<"cards" | "list">("list");
  const viewModeTouched = React.useRef(false);
  const [q, setQ] = React.useState("");
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [period, setPeriod] = React.useState<FinancePeriod>("all");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [rows, setRows] = React.useState<PlatformInvoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [subscriptions, setSubscriptions] = React.useState<PlatformSubscription[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [viewing, setViewing] = React.useState<PlatformInvoice | null>(null);
  const [editing, setEditing] = React.useState<PlatformInvoice | null>(null);
  const [removing, setRemoving] = React.useState<PlatformInvoice | null>(null);
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
      platformApi.invoices({ pageSize: 100 }),
      platformApi.subscriptions({ pageSize: 100 }),
    ])
      .then(([invoices, subscriptionList]) => {
        setRows(invoices.items);
        setSubscriptions(
          subscriptionList.items.filter((item) =>
            [
              "REGISTERING",
              "TRIALING",
              "AWAITING_FINANCE",
              "FINANCE_RELEASED",
              "ACTIVE",
              "PAST_DUE",
              "SUSPENDED",
            ].includes(item.status),
          ),
        );
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  React.useEffect(() => void load(), [load]);

  const normalizedQuery = q.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const dueAt = new Date(row.dueAt);
    const matchesPeriod =
      (!startDate || dueAt >= new Date(`${startDate}T00:00:00`)) &&
      (!endDate || dueAt <= new Date(`${endDate}T23:59:59.999`));

    return (
      (!normalizedQuery ||
        `${row.number} ${invoiceClientName(row)} ${row.reference ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery)) &&
      (!invoiceNumber || row.number.toLowerCase().includes(invoiceNumber.trim().toLowerCase())) &&
      (!status || row.status === status) &&
      matchesPeriod
    );
  });

  const metrics = {
    total: filtered,
    open: filtered.filter((row) => row.status === "OPEN"),
    paid: filtered.filter((row) => ["PAID", "RELEASED"].includes(row.status)),
    overdue: filtered.filter((row) => row.status === "OVERDUE"),
    void: filtered.filter((row) => row.status === "VOID"),
  };
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasActiveFilters = Boolean(
    q || invoiceNumber || status || period !== "all" || startDate || endDate,
  );

  function clearFilters() {
    setQ("");
    setInvoiceNumber("");
    setStatus("");
    setPeriod("all");
    setStartDate("");
    setEndDate("");
    setPage(1);
  }

  React.useEffect(() => setPage(1), [q, invoiceNumber, status, startDate, endDate, pageSize]);
  React.useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages]);

  const paginationFooter = (
    <GridPaginationFooter
      visible={pagedRows.length}
      total={filtered.length}
      page={page}
      totalPages={totalPages}
      pageSize={pageSize}
      onPage={(nextPage) => setPage(nextPage)}
      onPageSize={(nextPageSize) => setPageSize(nextPageSize)}
      ariaLabelPrefix="faturas"
    />
  );

  return (
    <AdminContainer className="max-w-[112rem]">
      <SectionHeader
        title="Financeiro"
        subtitle="Gestão de faturas, pagamentos e recebimentos da plataforma."
        subtitleClassName="hidden md:block"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Nova Fatura
          </Button>
        }
      />

      <Card>
        <div
          className={`grid gap-4 md:grid-cols-2 ${
            hasActiveFilters ? "xl:grid-cols-[repeat(7,minmax(0,1fr))_auto]" : "xl:grid-cols-7"
          }`}
          data-platform-filter-grid
        >
          <div className="xl:col-span-2">
            <Field label="Busca" asLabel={false}>
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder="Buscar por cliente, número da fatura ou referência..."
              />
            </Field>
          </div>
          <div className="hidden md:block">
            <Field label="Nº da Fatura">
              <Input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder="Ex.: 12345"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 md:contents">
            <Field label="Situação">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todas</option>
                <option value="OPEN">Em aberto</option>
                <option value="PAID">Paga</option>
                <option value="OVERDUE">Vencida</option>
                <option value="VOID">Cancelada</option>
                <option value="RELEASED">Liberada</option>
              </Select>
            </Field>
            <Field label="Período">
              <Select
                value={period}
                onChange={(event) => {
                  const nextPeriod = event.target.value as FinancePeriod;
                  setPeriod(nextPeriod);
                  if (nextPeriod === "all") {
                    setStartDate("");
                    setEndDate("");
                  } else if (nextPeriod !== "custom") {
                    const dates = datesForOperationalPeriod(nextPeriod);
                    setStartDate(dates.start);
                    setEndDate(dates.end);
                  }
                }}
              >
                <option value="all">Todos</option>
                {DASHBOARD_PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 md:contents">
            <Field label="Dt. Inicial">
              <DashboardDateInput
                value={startDate}
                readOnly={period !== "custom"}
                mobilePlaceholder={period === "all" ? "dd/mm/aaaa" : undefined}
                onChange={setStartDate}
              />
            </Field>
            <Field label="Dt. Final">
              <DashboardDateInput
                value={endDate}
                readOnly={period !== "custom"}
                mobilePlaceholder={period === "all" ? "dd/mm/aaaa" : undefined}
                onChange={setEndDate}
              />
            </Field>
          </div>
          {hasActiveFilters && (
            <div className="col-span-2 flex justify-end xl:col-span-1 xl:items-end">
              <ClearFiltersButton onClick={clearFilters} />
            </div>
          )}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Metric label="Total de faturas" rows={metrics.total} icon={Receipt} tone="primary" />
        <Metric label="Em aberto" rows={metrics.open} icon={Clock3} tone="info" />
        <Metric label="Pagas" rows={metrics.paid} icon={CheckCircle2} tone="success" />
        <Metric label="Vencidas" rows={metrics.overdue} icon={AlertTriangle} tone="warning" />
        <Metric label="Canceladas" rows={metrics.void} icon={Ban} tone="destructive" />
      </div>

      <div className="mt-3 hidden justify-end gap-1 md:flex" aria-label="Visualização das faturas">
        <Button
          type="button"
          variant={viewMode === "cards" ? "primary" : "secondary"}
          size="icon"
          aria-label="Visualizar faturas em cards"
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
          aria-label="Visualizar faturas em lista"
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
      <div data-platform-card-shell className={viewMode === "cards" ? "mt-4 space-y-3" : "hidden"}>
        <div data-platform-mobile-list className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pagedRows.map((row) => (
            <article key={row.id} className="rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{invoiceClientName(row)}</h2>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {row.number}
                      </p>
                    </div>
                    <InvoiceStatus status={row.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/70 py-3 text-sm">
                    <MobileInvoiceDetail
                      label="Plano"
                      value={row.subscription?.plan?.name ?? "Não informado"}
                    />
                    <MobileInvoiceDetail
                      label="Vencimento"
                      value={formatInvoiceDueDate(row.dueAt)}
                    />
                    <MobileInvoiceDetail
                      label="Valor bruto"
                      value={formatPlatformCurrency(row.subtotalCents)}
                    />
                    <MobileInvoiceDetail
                      label="Desconto"
                      value={formatPlatformCurrency(row.discountCents)}
                    />
                    <MobileInvoiceDetail
                      label="Valor líquido"
                      value={formatPlatformCurrency(row.totalCents)}
                    />
                    <MobileInvoiceDetail
                      label="Valor pago"
                      value={formatPlatformCurrency((row as FinanceInvoice).paidCents ?? 0)}
                    />
                  </dl>
                  <InvoiceActions
                    placement="card"
                    row={row}
                    onView={() => setViewing(row)}
                    onEdit={() => setEditing(row)}
                    onRemove={() => setRemoving(row)}
                  />
                </div>
              </div>
            </article>
          ))}
          {!filtered.length && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma fatura encontrada.
            </div>
          )}
        </div>
        <div
          className="overflow-hidden rounded-xl border border-border"
          data-platform-card-pagination
        >
          {paginationFooter}
        </div>
      </div>
      <div data-platform-desktop-table className={viewMode === "list" ? "mt-4" : "hidden"}>
        <Card className="overflow-hidden p-0" padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1260px] table-fixed text-sm">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[13%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead className="bg-surface-2">
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Número</th>
                  <th className="px-2 py-3">Cliente</th>
                  <th className="px-2 py-3">Plano</th>
                  <th className="px-2 py-3">Vencimento</th>
                  <th className="px-2 py-3 text-right">Vlr. Bruto</th>
                  <th className="px-2 py-3 text-right">Vlr. Líquido</th>
                  <th className="whitespace-nowrap px-2 py-3 text-right">Vlr. Pago</th>
                  <th className="whitespace-nowrap px-2 py-3 text-center">Status</th>
                  <th className="px-2 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-surface-1">
                    <td className="truncate px-4 py-3 font-mono" title={row.number}>
                      {row.number}
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <div className="truncate font-medium" title={invoiceClientName(row)}>
                        {invoiceClientName(row)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {invoiceClientLocation(row)}
                      </div>
                    </td>
                    <td className="truncate px-2 py-3 text-muted-foreground">
                      {row.subscription?.plan?.name ?? "Não informado"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {formatInvoiceDueDate(row.dueAt)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                      {formatPlatformCurrency(row.subtotalCents)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                      {formatPlatformCurrency(row.totalCents)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                      {formatPlatformCurrency((row as FinanceInvoice).paidCents ?? 0)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-center">
                      <InvoiceStatus status={row.status} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <InvoiceActions
                        row={row}
                        onView={() => setViewing(row)}
                        onEdit={() => setEditing(row)}
                        onRemove={() => setRemoving(row)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma fatura encontrada.
              </div>
            )}
          </div>
          {paginationFooter}
        </Card>
      </div>

      <InvoiceForm
        open={creating}
        initial={null}
        subscriptions={subscriptions}
        onClose={() => {
          setCreating(false);
        }}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />
      <InvoiceView invoice={viewing} onClose={() => setViewing(null)} />
      <InvoiceForm
        open={Boolean(editing)}
        initial={editing}
        subscriptions={subscriptions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Excluir fatura"
        description="A fatura será cancelada e permanecerá disponível para auditoria."
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (!removing) return;
          (platformApi as FinanceApi)
            .deleteInvoice(removing.id)
            .then(() => {
              toast.success("Fatura excluída.");
              setRemoving(null);
              load();
            })
            .catch((error) => toast.error((error as Error).message));
        }}
      />
    </AdminContainer>
  );
}

function InvoiceForm({
  open,
  initial,
  subscriptions,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: PlatformInvoice | null;
  subscriptions: PlatformSubscription[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const clients = React.useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();
    subscriptions.forEach((rawItem) => {
      const item = rawItem as unknown as FinanceSubscription;
      const client = item.client ?? item.tenant;
      if (client) unique.set(client.id, { id: client.id, name: client.name });
    });
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [subscriptions]);
  const [tenantId, setTenantId] = React.useState("");
  const [subscriptionId, setSubscriptionId] = React.useState("");
  const [amount, setAmount] = React.useState("0,00");
  const [discount, setDiscount] = React.useState("0,00");
  const [hasCoupon, setHasCoupon] = React.useState(false);
  const [paid, setPaid] = React.useState("0,00");
  const [released, setReleased] = React.useState(false);
  const [dueAt, setDueAt] = React.useState("");
  const [referenceDate, setReferenceDate] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const availableSubscriptions = subscriptions.filter((rawItem) => {
    const item = rawItem as unknown as FinanceSubscription;
    return (item.client?.id ?? item.tenant?.id) === tenantId;
  });

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    const first = initial?.subscription
      ? subscriptions.find((item) => item.id === initial.subscription?.id)
      : subscriptions[0];
    const financeFirst = first as unknown as FinanceSubscription | undefined;
    setTenantId(financeFirst?.client?.id ?? financeFirst?.tenant?.id ?? "");
    setSubscriptionId(first?.id ?? "");
    setAmount(formatPlatformMoneyInput(initial?.subtotalCents ?? 0));
    setDiscount(formatPlatformMoneyInput(initial?.discountCents ?? 0));
    setHasCoupon(Boolean(initial?.discountCents));
    setPaid(formatPlatformMoneyInput((initial as FinanceInvoice | null)?.paidCents ?? 0));
    setReleased((initial as FinanceInvoice | null)?.released ?? false);
    setDueAt(
      initial?.dueAt
        ? new Date(initial.dueAt).toISOString().slice(0, 10)
        : new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString().slice(0, 10),
    );
    setReferenceDate(
      initial?.referenceDate
        ? new Date(initial.referenceDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    );
    setReference(initial?.reference ?? "");
    setNotes(initial?.notes ?? "");
  }, [initial, open, subscriptions]);

  const subtotalCents = parsePlatformMoneyToCents(amount);
  const discountCents = hasCoupon ? parsePlatformMoneyToCents(discount) : 0;
  const paidCents = parsePlatformMoneyToCents(paid);
  const totalCents = Math.max(0, subtotalCents - discountCents);

  React.useEffect(() => {
    setErrors((current) => {
      const next = { ...current };
      if (tenantId) delete next.tenantId;
      if (subscriptionId) delete next.subscriptionId;
      if (dueAt) delete next.dueAt;
      if (referenceDate) delete next.referenceDate;
      if (reference.trim()) delete next.reference;
      if (subtotalCents > 0) delete next.amount;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [dueAt, reference, referenceDate, subscriptionId, subtotalCents, tenantId]);

  function changeTenant(nextTenantId: string) {
    const firstSubscription = subscriptions.find((rawItem) => {
      const item = rawItem as unknown as FinanceSubscription;
      return (item.client?.id ?? item.tenant?.id) === nextTenantId;
    });
    setTenantId(nextTenantId);
    setSubscriptionId(firstSubscription?.id ?? "");
  }

  async function save() {
    const subscription = subscriptions.find((item) => item.id === subscriptionId);
    const nextErrors: Record<string, boolean> = {
      ...(!tenantId ? { tenantId: true } : {}),
      ...(!subscription ? { subscriptionId: true } : {}),
      ...(!dueAt ? { dueAt: true } : {}),
      ...(!referenceDate ? { referenceDate: true } : {}),
      ...(!reference.trim() ? { reference: true } : {}),
    };
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      showRequiredFieldsToast(
        [
          ["tenantId", "Cliente"],
          ["subscriptionId", "Plano"],
          ["dueAt", "Data de vencimento"],
          ["referenceDate", "Data de referência"],
          ["reference", "Referência"],
        ]
          .filter(([key]) => nextErrors[key])
          .map(([, label]) => label),
      );
      return;
    }
    if (!subscription) return;
    if (subtotalCents <= 0) {
      setErrors({ amount: true });
      toast.error("Informe um valor original válido.");
      return;
    }
    if (discountCents < 0 || discountCents > subtotalCents || paidCents > totalCents) {
      toast.error("Informe valores válidos para desconto e pagamento.");
      return;
    }

    setSaving(true);
    try {
      const financeSubscription = subscription as unknown as FinanceSubscription;
      const financialData = {
        subtotalCents,
        discountCents,
        paidCents,
        released,
        dueAt: new Date(`${dueAt}T12:00:00`).toISOString(),
        referenceDate: new Date(`${referenceDate}T12:00:00`).toISOString(),
        reference: reference.trim(),
        notes: notes.trim() || undefined,
      };
      if (initial) {
        await (platformApi as FinanceApi).updateInvoice(initial.id, financialData);
        toast.success("Fatura atualizada.");
      } else {
        const payload = {
          ...financialData,
          ...(financeSubscription.tenant?.id ? { tenantId: financeSubscription.tenant.id } : {}),
          subscriptionId: subscription.id,
        } as Parameters<typeof platformApi.createInvoice>[0];
        await platformApi.createInvoice(payload);
        toast.success("Fatura criada.");
      }
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar Fatura" : "Nova Fatura"}
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className={initial ? "save-action-button" : undefined}
            disabled={saving}
            onClick={save}
          >
            {saving ? "Salvando..." : initial ? "Salvar" : "Criar Fatura"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente *">
          <Select
            disabled={Boolean(initial)}
            value={tenantId}
            onChange={(event) => changeTenant(event.target.value)}
            className={requiredFieldClassName(Boolean(errors.tenantId))}
            aria-invalid={Boolean(errors.tenantId)}
          >
            {!clients.length && <option value="">Nenhum cliente disponível</option>}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plano *">
          <Select
            disabled={Boolean(initial)}
            value={subscriptionId}
            onChange={(event) => setSubscriptionId(event.target.value)}
            className={requiredFieldClassName(Boolean(errors.subscriptionId))}
            aria-invalid={Boolean(errors.subscriptionId)}
          >
            {!availableSubscriptions.length && <option value="">Nenhum plano disponível</option>}
            {availableSubscriptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.plan.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data de vencimento *">
          <div
            aria-invalid={Boolean(errors.dueAt)}
            className={`rounded-lg border ${errors.dueAt ? `${requiredFieldClassName(true)} [&_input]:!border-transparent` : "border-transparent"}`}
          >
            <DashboardDateInput value={dueAt} readOnly={false} onChange={setDueAt} />
          </div>
        </Field>
        <Field label="Data de referência *">
          <div
            aria-invalid={Boolean(errors.referenceDate)}
            className={`rounded-lg border ${errors.referenceDate ? `${requiredFieldClassName(true)} [&_input]:!border-transparent` : "border-transparent"}`}
          >
            <DashboardDateInput
              value={referenceDate}
              readOnly={false}
              onChange={setReferenceDate}
            />
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Referência *">
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Ex.: 10/2026, SET/2026..."
              className={requiredFieldClassName(Boolean(errors.reference))}
              aria-invalid={Boolean(errors.reference)}
            />
          </Field>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-base font-semibold">Valores</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe o valor e o desconto para gerar a fatura.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Field label="Valor original (R$) *">
            <CurrencyInput value={amount} onChange={setAmount} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Tem cupom de desconto? *">
            <Select
              value={hasCoupon ? "yes" : "no"}
              onChange={(event) => {
                const enabled = event.target.value === "yes";
                setHasCoupon(enabled);
                if (!enabled) setDiscount("0,00");
              }}
            >
              <option value="no">Não</option>
              <option value="yes">Sim</option>
            </Select>
          </Field>
          <Field label="Desconto (R$)">
            <CurrencyInput value={discount} onChange={setDiscount} disabled={!hasCoupon} />
          </Field>
          <Field label="Valor líquido (R$)">
            <Input disabled value={formatPlatformCurrency(totalCents)} />
          </Field>
          <Field label="Valor pago (R$)">
            <CurrencyInput value={paid} onChange={setPaid} />
          </Field>
          <Field label="Liberado">
            <Toggle checked={released} onChange={setReleased} label={released ? "Sim" : "Não"} />
          </Field>
        </div>
      </div>

      <div className="mt-5">
        <Field label="Observações">
          <Textarea
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Informações adicionais sobre a fatura..."
          />
        </Field>
      </div>
    </Modal>
  );
}

function InvoiceView({
  invoice,
  onClose,
}: {
  invoice: PlatformInvoice | null;
  onClose: () => void;
}) {
  const financial = invoice as FinanceInvoice | null;
  return (
    <Modal
      open={Boolean(invoice)}
      onClose={onClose}
      title="Visualizar Fatura"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {invoice && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnly label="Nº da Fatura" value={invoice.number} />
          <ReadOnly label="Cliente" value={invoiceClientName(invoice)} />
          <ReadOnly label="Plano" value={invoice.subscription?.plan?.name ?? "Não informado"} />
          <ReadOnly label="Vencimento" value={formatInvoiceDueDate(invoice.dueAt)} />
          <ReadOnly label="Valor bruto" value={formatPlatformCurrency(invoice.subtotalCents)} />
          <ReadOnly label="Desconto" value={formatPlatformCurrency(invoice.discountCents)} />
          <ReadOnly label="Valor líquido" value={formatPlatformCurrency(invoice.totalCents)} />
          <ReadOnly label="Valor pago" value={formatPlatformCurrency(financial?.paidCents ?? 0)} />
          <ReadOnly label="Liberado" value={financial?.released ? "Sim" : "Não"} />
          <ReadOnly label="Status" value={invoiceStatusLabel(invoice.status)} />
          <div className="sm:col-span-2">
            <ReadOnly label="Observações" value={invoice.notes ?? "Não informadas"} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-3 py-2">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-10 w-full items-center gap-3 rounded-lg border border-border bg-surface-1 px-3 text-sm"
    >
      <span
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
      {label}
    </button>
  );
}

function CurrencyInput({
  value,
  onChange,
  disabled = false,
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      aria-invalid={invalid}
      className={`flex min-h-10 overflow-hidden rounded-lg border border-border bg-surface-1 focus-within:border-primary ${requiredFieldClassName(invalid)}`}
    >
      <span className="flex items-center border-r border-border px-3 text-sm text-muted-foreground">
        R$
      </span>
      <input
        disabled={disabled}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(maskPlatformMoney(event.target.value))}
        onBlur={() => onChange(formatPlatformMoneyInput(parsePlatformMoneyToCents(value)))}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

function InvoiceActions({
  placement = "table",
  row,
  onView,
  onEdit,
  onRemove,
}: {
  placement?: "card" | "table";
  row: PlatformInvoice;
  onView: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={
        placement === "card"
          ? "mt-3 flex justify-end gap-1.5"
          : "mt-3 flex min-w-max justify-end gap-1.5 md:mt-0 md:justify-center"
      }
    >
      <InvoiceAction label="Visualizar" onClick={onView}>
        <Eye className="h-4 w-4" />
      </InvoiceAction>
      <InvoiceAction label="Editar" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </InvoiceAction>
      <InvoiceAction label="Excluir" disabled={row.status === "VOID"} onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </InvoiceAction>
    </div>
  );
}

function MobileInvoiceDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}

function InvoiceAction({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const actionClass = label.includes("Excluir")
    ? "action-hover-destructive"
    : label.includes("Editar")
      ? "action-hover-warning"
      : "action-hover-primary";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-1 text-muted-foreground transition disabled:cursor-not-allowed disabled:opacity-35 ${actionClass}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Metric({
  label,
  rows,
  icon: Icon,
  tone,
}: {
  label: string;
  rows: PlatformInvoice[];
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "info" | "success" | "warning" | "destructive";
}) {
  const total = rows.reduce((sum, item) => sum + item.totalCents, 0);
  const tones = {
    primary: "bg-primary/10 text-primary",
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  } as const;
  return (
    <Card className="flex min-h-28 flex-col">
      <div className="w-full text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <div className="font-mono text-2xl font-semibold">{rows.length}</div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{formatPlatformCurrency(total)}</div>
    </Card>
  );
}

function InvoiceStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    OPEN: "Em aberto",
    PAID: "Paga",
    OVERDUE: "Vencida",
    VOID: "Cancelada",
    RELEASED: "Liberada",
  };
  const tone =
    status === "PAID" || status === "RELEASED"
      ? "success"
      : status === "OVERDUE"
        ? "warning"
        : status === "VOID"
          ? "default"
          : "info";
  return <Badge tone={tone}>{labels[status] ?? status}</Badge>;
}

function invoiceStatusLabel(status: string) {
  return (
    (
      {
        DRAFT: "Rascunho",
        OPEN: "Em aberto",
        PAID: "Paga",
        OVERDUE: "Vencida",
        VOID: "Cancelada",
        RELEASED: "Liberada",
      } as Record<string, string>
    )[status] ?? status
  );
}

function formatInvoiceDueDate(value: string) {
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function invoiceClientName(invoice: PlatformInvoice) {
  const value = invoice as unknown as {
    tenant?: { name: string } | null;
    subscription?: { client?: { name: string } | null } | null;
  };
  return value.subscription?.client?.name ?? value.tenant?.name ?? "Cliente não informado";
}

function invoiceClientLocation(invoice: PlatformInvoice) {
  const value = invoice as unknown as {
    tenant?: { slug?: string; platformClient?: { city?: string; state?: string } | null } | null;
    subscription?: { client?: { city?: string; state?: string } | null } | null;
  };
  const client = value.subscription?.client ?? value.tenant?.platformClient;
  return [client?.city, client?.state].filter(Boolean).join(" - ") || value.tenant?.slug || "";
}
