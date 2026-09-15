import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { ConfirmDialog, Modal } from "@/components/modal";
import { platformApi, type PlatformPlan } from "@/lib/trixus-api";
import { sortByOptionLabel } from "@/lib/sort-options";

export const Route = createFileRoute("/admin/planos")({
  head: () => ({ meta: [{ title: "Planos · Trixus Admin" }] }),
  component: PlanosAdmin,
});

function PlanosAdmin() {
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<PlatformPlan | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [archiving, setArchiving] = React.useState<PlatformPlan | null>(null);
  const load = React.useCallback(() => {
    platformApi
      .plans({ pageSize: 50 })
      .then((data) => setPlans(data.items))
      .catch((err) => setError((err as Error).message));
  }, []);
  React.useEffect(() => void load(), [load]);

  return (
    <AdminContainer>
      <SectionHeader
        title="Planos"
        subtitle="Catálogo server-side com snapshot de features e limites em cada assinatura."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo plano
          </Button>
        }
      />
      {error && <Card className="border-destructive/40 text-sm text-destructive">{error}</Card>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortByOptionLabel(plans, (plan) => plan.name).map((plan) => (
          <Card key={plan.id}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-xs text-muted-foreground">{plan.code}</p>
              </div>
              <Badge tone={plan.status === "ACTIVE" ? "success" : "default"}>{plan.status}</Badge>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <Limit icon={Users} label="Usuários" value={plan.limits.maxUsers} />
              <Limit icon={Database} label="Departamentos" value={plan.limits.maxDepartments} />
              <Limit icon={Phone} label="Connections" value={plan.limits.maxConnections} />
              <Limit icon={Database} label="Contatos" value={plan.limits.maxContacts} />
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Features
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(plan.features).map(([feature, enabled]) => (
                  <Badge key={feature} tone={enabled ? "success" : "default"}>
                    <Check className="h-3 w-3" /> {feature}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {plan._count?.subscriptions ?? 0} assinaturas vinculadas.
            </p>
            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="secondary" size="sm" onClick={() => setEditing(plan)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="trash-action"
                disabled={(plan._count?.subscriptions ?? 0) > 0 || plan.status === "ARCHIVED"}
                onClick={() => setArchiving(plan)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Arquivar
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <PlanForm
        open={creating || Boolean(editing)}
        initial={editing ?? undefined}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />
      <ConfirmDialog
        open={Boolean(archiving)}
        title="Arquivar plano?"
        description="Planos vinculados não podem ser arquivados nesta tela."
        destructive
        confirmLabel="Arquivar"
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (!archiving) return;
          platformApi
            .archivePlan(archiving.id)
            .then(() => {
              toast.success("Plano arquivado.");
              setArchiving(null);
              load();
            })
            .catch((error) => toast.error((error as Error).message));
        }}
      />
    </AdminContainer>
  );
}

const DEFAULT_FEATURES = {
  campaigns: false,
  tickets: true,
  multipleConnections: false,
  storage: true,
  realtime: true,
};
const DEFAULT_LIMITS = {
  maxUsers: 3,
  maxDepartments: 2,
  maxConnections: 1,
  maxContacts: 1000,
  maxCampaignRecipients: 0,
  maxStorageBytes: 52428800,
};

function PlanForm({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: PlatformPlan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [status, setStatus] = React.useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [trialDays, setTrialDays] = React.useState(0);
  const [features, setFeatures] = React.useState(JSON.stringify(DEFAULT_FEATURES, null, 2));
  const [limits, setLimits] = React.useState(JSON.stringify(DEFAULT_LIMITS, null, 2));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(initial?.name ?? "");
    setCode(initial?.code ?? "");
    setStatus(initial?.status === "ACTIVE" ? "ACTIVE" : "DRAFT");
    setTrialDays(initial?.trialDays ?? 0);
    setFeatures(JSON.stringify(initial?.features ?? DEFAULT_FEATURES, null, 2));
    setLimits(JSON.stringify(initial?.limits ?? DEFAULT_LIMITS, null, 2));
  }, [initial, open]);

  async function save() {
    try {
      const payload = {
        name: name.trim(),
        status,
        trialDays: Number(trialDays),
        features: JSON.parse(features) as Record<string, boolean>,
        limits: JSON.parse(limits) as Record<string, number>,
      };
      if (!payload.name || !Number.isInteger(payload.trialDays) || payload.trialDays < 0) {
        throw new Error("Informe nome e dias de trial válidos.");
      }
      setSaving(true);
      if (initial) await platformApi.updatePlan(initial.id, payload);
      else await platformApi.createPlan({ ...payload, code: code.trim().toLowerCase() });
      toast.success(initial ? "Plano atualizado." : "Plano criado.");
      onSaved();
    } catch (error) {
      toast.error((error as Error).message || "Configuração do plano inválida.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar plano" : "Novo plano"}
      size="lg"
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Código">
          <Input
            value={code}
            disabled={Boolean(initial)}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as "DRAFT" | "ACTIVE")}
          >
            <option value="DRAFT">Rascunho</option>
            <option value="ACTIVE">Ativo</option>
          </Select>
        </Field>
        <Field label="Dias de trial">
          <Input
            type="number"
            min={0}
            max={90}
            value={trialDays}
            onChange={(event) => setTrialDays(Number(event.target.value))}
          />
        </Field>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Funcionalidades (JSON)">
          <Textarea
            rows={12}
            value={features}
            onChange={(event) => setFeatures(event.target.value)}
          />
        </Field>
        <Field label="Limites (JSON)">
          <Textarea rows={12} value={limits} onChange={(event) => setLimits(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function Limit({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="font-mono text-xs">{value.toLocaleString("pt-BR")}</span>
    </div>
  );
}
