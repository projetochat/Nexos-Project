import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Plus, Receipt } from "lucide-react";
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
} from "@/components/ui-kit";
import { Modal } from "@/components/modal";
import { fmtDate, formatCurrency } from "@/lib/format";
import { platformApi, type PlatformInvoice, type PlatformSubscription } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro · Trixus Admin" }] }),
  component: FinanceiroAdmin,
});

function FinanceiroAdmin() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<PlatformInvoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [updating, setUpdating] = React.useState<string | null>(null);
  const [subscriptions, setSubscriptions] = React.useState<PlatformSubscription[]>([]);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(() => {
    Promise.all([
      platformApi.invoices({ pageSize: 50 }),
      platformApi.subscriptions({ pageSize: 100 }),
    ])
      .then(([invoices, subscriptionList]) => {
        setRows(invoices.items);
        setSubscriptions(
          subscriptionList.items.filter((item) =>
            ["ACTIVE", "TRIALING", "PAST_DUE"].includes(item.status),
          ),
        );
      })
      .catch((err) => setError((err as Error).message));
  }, []);
  React.useEffect(() => void load(), [load]);

  async function updateStatus(id: string, status: PlatformInvoice["status"]) {
    setUpdating(id);
    try {
      await platformApi.updateInvoiceStatus(
        id,
        status as "DRAFT" | "OPEN" | "PAID" | "VOID" | "OVERDUE",
      );
      toast.success("Status da fatura atualizado.");
      load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdating(null);
    }
  }

  const filtered = rows.filter((row) =>
    `${row.number} ${row.tenant.name} ${row.tenant.slug}`.toLowerCase().includes(q.toLowerCase()),
  );
  const open = rows.filter((row) => row.status === "OPEN");
  const overdue = rows.filter((row) => row.status === "OVERDUE");

  return (
    <AdminContainer>
      <SectionHeader
        title="Faturas manuais"
        subtitle="Sem gateway de pagamento integrado. Mudanças de status são administrativas e auditadas."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova fatura
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Metric label="Total de faturas" value={rows.length} />
        </Card>
        <Card>
          <Metric
            label="Em aberto"
            value={open.length}
            detail={formatCurrency(open.reduce((sum, item) => sum + item.totalCents / 100, 0))}
            icon={Receipt}
          />
        </Card>
        <Card>
          <Metric
            label="Vencidas"
            value={overdue.length}
            detail={formatCurrency(overdue.reduce((sum, item) => sum + item.totalCents / 100, 0))}
            icon={AlertTriangle}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Buscar fatura..."
          className="mb-4 max-w-md"
        />
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Número</th>
                <th className="pb-2">Tenant</th>
                <th className="pb-2">Vencimento</th>
                <th className="pb-2">Valor</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Atualizar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60 hover:bg-surface-1">
                  <td className="py-3 font-mono text-xs">{row.number}</td>
                  <td className="py-3">
                    <div className="font-medium">{row.tenant.name}</div>
                    <div className="text-xs text-muted-foreground">{row.tenant.slug}</div>
                  </td>
                  <td className="py-3">
                    <Select
                      value={row.status}
                      disabled={updating === row.id}
                      onChange={(event) =>
                        updateStatus(row.id, event.target.value as PlatformInvoice["status"])
                      }
                      className="h-8 min-w-28 text-xs"
                    >
                      <option value="DRAFT">Rascunho</option>
                      <option value="OPEN">Em aberto</option>
                      <option value="PAID">Paga</option>
                      <option value="OVERDUE">Vencida</option>
                      <option value="VOID">Cancelada</option>
                    </Select>
                  </td>
                  <td className="py-3 text-xs">{fmtDate(new Date(row.dueAt).getTime())}</td>
                  <td className="py-3 font-mono text-xs">{formatCurrency(row.totalCents / 100)}</td>
                  <td className="py-3">
                    <Badge
                      tone={
                        row.status === "PAID"
                          ? "success"
                          : row.status === "OVERDUE"
                            ? "warning"
                            : "info"
                      }
                    >
                      {row.status}
                    </Badge>
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
        subscriptions={subscriptions}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load();
        }}
      />
    </AdminContainer>
  );
}

function InvoiceForm({
  open,
  subscriptions,
  onClose,
  onSaved,
}: {
  open: boolean;
  subscriptions: PlatformSubscription[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subscriptionId, setSubscriptionId] = React.useState("");
  const [amount, setAmount] = React.useState("0");
  const [discount, setDiscount] = React.useState("0");
  const [dueAt, setDueAt] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setSubscriptionId(subscriptions[0]?.id ?? "");
    setAmount("0");
    setDiscount("0");
    setDueAt(new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString().slice(0, 10));
  }, [open, subscriptions]);
  async function save() {
    const subscription = subscriptions.find((item) => item.id === subscriptionId);
    const subtotalCents = Math.round(Number(amount.replace(",", ".")) * 100);
    const discountCents = Math.round(Number(discount.replace(",", ".")) * 100);
    if (
      !subscription ||
      !dueAt ||
      !Number.isFinite(subtotalCents) ||
      subtotalCents < 0 ||
      !Number.isFinite(discountCents) ||
      discountCents < 0
    ) {
      toast.error("Informe assinatura, valores e vencimento válidos.");
      return;
    }
    setSaving(true);
    try {
      await platformApi.createInvoice({
        tenantId: subscription.tenant.id,
        subscriptionId: subscription.id,
        subtotalCents,
        discountCents,
        dueAt: new Date(`${dueAt}T12:00:00`).toISOString(),
      });
      toast.success("Fatura criada.");
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
      title="Nova fatura"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={saving} onClick={save}>
            {saving ? "Criando..." : "Criar fatura"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Assinatura">
          <Select
            value={subscriptionId}
            onChange={(event) => setSubscriptionId(event.target.value)}
          >
            {subscriptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.tenant.name} — {item.plan.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Valor (R$)">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Desconto (R$)">
            <Input
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </Field>
          <Field label="Vencimento">
            <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}
