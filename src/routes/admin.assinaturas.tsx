import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import {
  Badge,
  Button,
  Card,
  Field,
  SearchInput,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { Modal } from "@/components/modal";
import { fmtDate } from "@/lib/format";
import { platformApi, type PlatformPlan, type PlatformSubscription } from "@/lib/trixus-api";

export const Route = createFileRoute("/admin/assinaturas")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: AssinaturasAdmin,
});

function AssinaturasAdmin() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<PlatformSubscription[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<PlatformSubscription | null>(null);
  const load = React.useCallback(() => {
    Promise.all([platformApi.subscriptions({ pageSize: 50 }), platformApi.plans({ pageSize: 100 })])
      .then(([subscriptions, planList]) => {
        setRows(subscriptions.items);
        setPlans(planList.items.filter((plan) => plan.status === "ACTIVE"));
      })
      .catch((err) => setError((err as Error).message));
  }, []);
  React.useEffect(() => void load(), [load]);
  const filtered = rows.filter((row) =>
    `${row.tenant.name} ${row.tenant.slug} ${row.plan.name}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );

  return (
    <AdminContainer>
      <SectionHeader
        title="Assinaturas"
        subtitle="Operações administrativas. Sem cobrança recorrente automática nesta sprint."
      />
      <Card>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Buscar assinatura..."
          className="mb-4 max-w-md"
        />
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Tenant</th>
                <th className="pb-2">Plano</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Fim do período</th>
                <th className="pb-2">Cancelamento</th>
                <th className="pb-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60 hover:bg-surface-1">
                  <td className="py-3">
                    <div className="font-medium">{row.tenant.name}</div>
                    <div className="text-xs text-muted-foreground">{row.tenant.slug}</div>
                  </td>
                  <td className="py-3">{row.plan.name}</td>
                  <td className="py-3">
                    <Badge tone={row.status === "ACTIVE" ? "success" : "warning"}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-xs">
                    {fmtDate(new Date(row.currentPeriodEnd).getTime())}
                  </td>
                  <td className="py-3 text-xs">
                    {row.cancelAtPeriodEnd ? "No fim do período" : "Não agendado"}
                  </td>
                  <td className="py-3 text-center">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(row)}>
                      <Pencil className="h-3.5 w-3.5" /> Gerenciar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <SubscriptionForm
        open={Boolean(editing)}
        initial={editing ?? undefined}
        plans={plans}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </AdminContainer>
  );
}

function SubscriptionForm({
  open,
  initial,
  plans,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: PlatformSubscription;
  plans: PlatformPlan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [planId, setPlanId] = React.useState("");
  const [status, setStatus] = React.useState("ACTIVE");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setPlanId(initial?.plan.id ?? "");
    setStatus(initial?.status ?? "ACTIVE");
    setReason("");
  }, [initial, open]);
  async function save() {
    if (!initial || !reason.trim()) {
      toast.error("Informe o motivo da alteração.");
      return;
    }
    setSaving(true);
    try {
      await platformApi.updateSubscription(initial.id, {
        planId,
        status: status as "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "EXPIRED",
        reason,
      });
      toast.success("Assinatura atualizada.");
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
      title="Gerenciar assinatura"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={saving} onClick={save}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Plano">
          <Select value={planId} onChange={(event) => setPlanId(event.target.value)}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="TRIALING">Trial</option>
            <option value="ACTIVE">Ativa</option>
            <option value="PAST_DUE">Em atraso</option>
            <option value="SUSPENDED">Suspensa</option>
            <option value="EXPIRED">Expirada</option>
          </Select>
        </Field>
        <Field label="Motivo obrigatório">
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
