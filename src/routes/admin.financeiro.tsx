import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Eye,
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
import { fmtDate } from "@/lib/format";
import { DASHBOARD_PERIOD_OPTIONS, datesForOperationalPeriod } from "@/lib/operational-filters";
import {
  formatPlatformCurrency,
  formatPlatformMoneyInput,
  maskPlatformMoney,
  parsePlatformMoneyToCents,
} from "@/lib/platform-field-formats";
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
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

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
  const visibleIds = filtered.map((row) => row.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  function toggleAllVisible() {
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  }

  return (
    <AdminContainer className="max-w-[112rem]">
      <SectionHeader
        title="Financeiro"
        subtitle="Gestão de faturas, pagamentos e recebimentos da plataforma."
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <div className="xl:col-span-2">
            <Field label="Busca" asLabel={false}>
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder="Buscar por cliente, número da fatura ou referência..."
              />
            </Field>
          </div>
          <Field label="Nº da Fatura">
            <Input
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="Ex.: 12345"
            />
          </Field>
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
          <Field label="Dt. Inicial">
            <DashboardDateInput
              value={startDate}
              readOnly={period !== "custom"}
              onChange={setStartDate}
            />
          </Field>
          <Field label="Dt. Final">
            <DashboardDateInput
              value={endDate}
              readOnly={period !== "custom"}
              onChange={setEndDate}
            />
          </Field>
        </div>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total de faturas" rows={metrics.total} icon={Receipt} />
        <Metric label="Em aberto" rows={metrics.open} icon={Clock3} />
        <Metric label="Pagas" rows={metrics.paid} icon={CheckCircle2} />
        <Metric label="Vencidas" rows={metrics.overdue} icon={AlertTriangle} />
        <Metric label="Canceladas" rows={metrics.void} icon={Ban} />
      </div>

      <Card className="mt-4">
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] table-fixed text-sm">
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[7%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2 pr-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Selecionar todas as faturas visíveis"
                  />
                </th>
                <th className="px-2 pb-2">Número</th>
                <th className="px-2 pb-2">Cliente</th>
                <th className="px-2 pb-2">Plano</th>
                <th className="px-2 pb-2">Vencimento</th>
                <th className="px-2 pb-2 text-right">Vlr. Bruto</th>
                <th className="px-2 pb-2 text-center leading-tight">Possui Cupom</th>
                <th className="px-2 pb-2 text-right">Vlr. Líquido</th>
                <th className="whitespace-nowrap px-2 pb-2 text-right">Vlr. Pago</th>
                <th className="whitespace-nowrap px-2 pb-2">Status</th>
                <th className="px-2 pb-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60 hover:bg-surface-1">
                  <td className="py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() =>
                        setSelectedIds((current) =>
                          current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : [...current, row.id],
                        )
                      }
                      aria-label={`Selecionar fatura ${row.number}`}
                    />
                  </td>
                  <td className="truncate px-2 py-3 font-mono text-xs" title={row.number}>
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
                  <td className="truncate px-2 py-3 text-xs text-muted-foreground">
                    {row.subscription?.plan?.name ?? "Não informado"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs">
                    {fmtDate(new Date(row.dueAt).getTime())}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                    {formatPlatformCurrency(row.subtotalCents)}
                  </td>
                  <td className="px-2 py-3 text-center">{row.discountCents > 0 ? "Sim" : "Não"}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                    {formatPlatformCurrency(row.totalCents)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                    {formatPlatformCurrency((row as FinanceInvoice).paidCents ?? 0)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3">
                    <InvoiceStatus status={row.status} />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <div className="flex justify-center gap-1.5">
                      <InvoiceAction label="Visualizar" onClick={() => setViewing(row)}>
                        <Eye className="h-4 w-4" />
                      </InvoiceAction>
                      <InvoiceAction label="Editar" onClick={() => setEditing(row)}>
                        <Pencil className="h-4 w-4" />
                      </InvoiceAction>
                      <InvoiceAction
                        label="Excluir"
                        disabled={row.status === "VOID"}
                        onClick={() => setRemoving(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </InvoiceAction>
                    </div>
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
      </Card>

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
  const [saving, setSaving] = React.useState(false);
  const availableSubscriptions = subscriptions.filter((rawItem) => {
    const item = rawItem as unknown as FinanceSubscription;
    return (item.client?.id ?? item.tenant?.id) === tenantId;
  });

  React.useEffect(() => {
    if (!open) return;
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
    if (
      !subscription ||
      !dueAt ||
      !referenceDate ||
      !reference.trim() ||
      subtotalCents <= 0 ||
      discountCents < 0 ||
      discountCents > subtotalCents ||
      paidCents > totalCents
    ) {
      toast.error("Informe cliente, plano, valores e vencimento válidos.");
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
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={saving} onClick={save}>
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
          <DashboardDateInput value={dueAt} readOnly={false} onChange={setDueAt} />
        </Field>
        <Field label="Data de referência *">
          <DashboardDateInput value={referenceDate} readOnly={false} onChange={setReferenceDate} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Referência *">
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Ex.: 10/2026, SET/2026..."
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
            <CurrencyInput value={amount} onChange={setAmount} />
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
          <ReadOnly label="Vencimento" value={fmtDate(new Date(invoice.dueAt).getTime())} />
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
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-10 overflow-hidden rounded-lg border border-border bg-surface-1 focus-within:border-primary">
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
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1 text-muted-foreground transition disabled:cursor-not-allowed disabled:opacity-35 ${actionClass}`}
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
}: {
  label: string;
  rows: PlatformInvoice[];
  icon: React.ComponentType<{ className?: string }>;
}) {
  const total = rows.reduce((sum, item) => sum + item.totalCents, 0);
  return (
    <Card className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="mt-2 font-mono text-2xl font-semibold">{rows.length}</div>
        <div className="text-xs text-muted-foreground">{formatPlatformCurrency(total)}</div>
      </div>
      <Icon className="h-5 w-5 text-muted-foreground" />
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
