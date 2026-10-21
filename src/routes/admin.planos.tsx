import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArchiveRestore,
  Copy,
  Eye,
  Layers3,
  Megaphone,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  PowerOff,
  TicketCheck,
  Trash2,
  Users,
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
} from "@/components/ui-kit";
import { Switch } from "@/components/ui/switch";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import { ConfirmDialog, Modal } from "@/components/modal";
import { platformApi, type PlatformPlan } from "@/lib/trixus-api";
import { sortByOptionLabel } from "@/lib/sort-options";

export const Route = createFileRoute("/admin/planos")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: PlanosAdmin,
});

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  INACTIVE: "Inativo",
  DRAFT: "Rascunho",
  ARCHIVED: "Arquivado",
};

const PLAN_STATUS_OPTIONS = ["ACTIVE", "SUSPENDED", "INACTIVE", "ARCHIVED", "DRAFT"] as const;

const FEATURE_OPTIONS = [
  { key: "chat", label: "Chat", description: "Acesso ao módulo de chat", icon: MessageCircle },
  {
    key: "campaigns",
    label: "Campanhas",
    description: "Acesso ao módulo de campanhas",
    icon: Megaphone,
  },
  {
    key: "tickets",
    label: "Chamados",
    description: "Acesso ao módulo de geração e gerenciamento de chamados",
    icon: TicketCheck,
  },
] as const;

type FeatureKey = (typeof FEATURE_OPTIONS)[number]["key"];

function PlanosAdmin() {
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<PlatformPlan | null>(null);
  const [viewing, setViewing] = React.useState<PlatformPlan | null>(null);
  const [duplicating, setDuplicating] = React.useState<PlatformPlan | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [planAction, setPlanAction] = React.useState<{
    plan: PlatformPlan;
    kind: "activate" | "deactivate" | "unarchive" | "delete";
  } | null>(null);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const load = React.useCallback(() => {
    setError(null);
    platformApi
      .plans({ pageSize: 50 })
      .then((data) => setPlans(data.items))
      .catch((err) => setError((err as Error).message));
  }, []);

  React.useEffect(() => void load(), [load]);

  const filteredPlans = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return sortByOptionLabel(
      plans.filter((plan) => {
        const matchesQuery =
          !normalizedQuery ||
          plan.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery) ||
          plan.code.toLocaleLowerCase("pt-BR").includes(normalizedQuery);
        return matchesQuery && (!statusFilter || plan.status === statusFilter);
      }),
      (plan) => plan.name,
    );
  }, [plans, query, statusFilter]);
  const hasActiveFilters = Boolean(query || statusFilter);

  function clearFilters() {
    setQuery("");
    setStatusFilter("");
  }

  return (
    <AdminContainer>
      <SectionHeader
        title="Planos"
        subtitle={`${plans.length} ${plans.length === 1 ? "plano cadastrado" : "planos cadastrados"}.`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo plano
          </Button>
        }
      />

      <Card className="mb-4" padding={false}>
        <div
          className={`grid grid-cols-[minmax(0,1fr)_minmax(7rem,0.65fr)] gap-3 p-4 sm:gap-4 sm:p-5 ${
            hasActiveFilters
              ? "sm:grid-cols-[minmax(0,1fr)_220px_auto]"
              : "sm:grid-cols-[minmax(0,1fr)_220px]"
          }`}
          data-platform-filter-grid
        >
          <div className="min-w-0">
            <Field label="Busca">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar por nome ou código..."
              />
            </Field>
          </div>
          <div className="min-w-0">
            <Field label="Status">
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">Todos</option>
                {PLAN_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {hasActiveFilters && (
            <div className="col-span-2 flex justify-end sm:col-span-1 sm:items-end">
              <ClearFiltersButton onClick={clearFilters} />
            </div>
          )}
        </div>
      </Card>

      {error && <Card className="border-destructive/40 text-sm text-destructive">{error}</Card>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredPlans.map((plan) => {
          const enabledFeatures = FEATURE_OPTIONS.filter(({ key }) => plan.features[key]);
          return (
            <Card key={plan.id} className="flex min-h-full min-w-0 flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-0.5 truncate text-xs uppercase text-muted-foreground">
                    {plan.code}
                  </p>
                </div>
                <Badge tone={statusTone(plan.status)}>
                  {STATUS_LABELS[plan.status] ?? plan.status}
                </Badge>
              </div>

              <div className="mt-5 space-y-2.5 text-sm">
                <Limit icon={Layers3} label="Instâncias" value={plan.limits.maxConnections} />
                <Limit icon={Users} label="Usuários" value={plan.limits.maxUsers} />
                <Limit icon={Megaphone} label="Campanhas" value={plan.limits.maxCampaigns} />
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Módulos e funcionalidades
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {enabledFeatures.length > 0 ? (
                    enabledFeatures.map(({ key, label }) => (
                      <Badge key={key} tone="success">
                        {label}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Nenhum módulo habilitado.</span>
                  )}
                </div>
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                {plan._count?.subscriptions ?? 0}{" "}
                {(plan._count?.subscriptions ?? 0) === 1
                  ? "assinatura vinculada."
                  : "assinaturas vinculadas."}
              </p>

              <div
                className="mt-auto flex justify-end gap-1.5 border-t border-border pt-4"
                aria-label={`Ações do plano ${plan.name}`}
              >
                <Button
                  variant="secondary"
                  size="icon"
                  className="action-hover-primary"
                  title={`Visualizar plano ${plan.name}`}
                  aria-label={`Visualizar plano ${plan.name}`}
                  onClick={() => setViewing(plan)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="action-hover-success"
                  title={`Duplicar plano ${plan.name}`}
                  aria-label={`Duplicar plano ${plan.name}`}
                  onClick={() => setDuplicating(plan)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="action-hover-warning"
                  title={`Editar plano ${plan.name}`}
                  aria-label={`Editar plano ${plan.name}`}
                  onClick={() => setEditing(plan)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {plan.status === "ARCHIVED" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="action-hover-primary"
                    title={`Desarquivar plano ${plan.name}`}
                    aria-label={`Desarquivar plano ${plan.name}`}
                    onClick={() => setPlanAction({ plan, kind: "unarchive" })}
                  >
                    <ArchiveRestore className="h-4 w-4" />
                  </Button>
                )}
                {plan.status === "INACTIVE" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="action-hover-primary"
                    title={`Ativar plano ${plan.name}`}
                    aria-label={`Ativar plano ${plan.name}`}
                    onClick={() => setPlanAction({ plan, kind: "activate" })}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                )}
                {(plan._count?.subscriptions ?? 0) > 0 &&
                  plan.status !== "ARCHIVED" &&
                  plan.status !== "INACTIVE" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="action-hover-destructive"
                      title={`Desabilitar plano ${plan.name}`}
                      aria-label={`Desabilitar plano ${plan.name}`}
                      onClick={() => setPlanAction({ plan, kind: "deactivate" })}
                    >
                      <PowerOff className="h-4 w-4" />
                    </Button>
                  )}
                {(plan._count?.subscriptions ?? 0) === 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="trash-action"
                    title={`Excluir plano ${plan.name}`}
                    aria-label={`Excluir plano ${plan.name}`}
                    onClick={() => setPlanAction({ plan, kind: "delete" })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {!error && filteredPlans.length === 0 && (
        <Card className="py-12 text-center text-sm text-muted-foreground">
          Nenhum plano encontrado para os filtros informados.
        </Card>
      )}

      <PlanForm
        open={creating || Boolean(editing) || Boolean(duplicating)}
        initial={editing ?? duplicating ?? undefined}
        forceCreate={Boolean(duplicating)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
          setDuplicating(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          setDuplicating(null);
          load();
        }}
      />

      <PlanView plan={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={Boolean(planAction)}
        title={
          planAction?.kind === "delete"
            ? "Excluir plano?"
            : planAction?.kind === "unarchive"
              ? "Desarquivar plano?"
              : planAction?.kind === "activate"
                ? "Ativar plano?"
                : "Desabilitar plano?"
        }
        description={
          planAction?.kind === "delete"
            ? "Esta exclusão é definitiva e só é permitida porque o plano nunca foi utilizado em uma assinatura."
            : planAction?.kind === "unarchive"
              ? "O plano voltará como inativo e poderá ser editado antes de uma nova ativação."
              : planAction?.kind === "activate"
                ? "O plano voltará a ficar disponível para novas assinaturas."
                : "O plano ficará inativo para novas assinaturas. Assinaturas e Tenants existentes não serão alterados."
        }
        destructive={planAction?.kind === "delete"}
        confirmLabel={
          planAction?.kind === "delete"
            ? "Excluir"
            : planAction?.kind === "unarchive"
              ? "Desarquivar"
              : planAction?.kind === "activate"
                ? "Ativar"
                : "Desabilitar"
        }
        onClose={() => setPlanAction(null)}
        onConfirm={() => {
          if (!planAction) return;
          const request =
            planAction.kind === "delete"
              ? platformApi.deletePlan(planAction.plan.id)
              : planAction.kind === "unarchive"
                ? platformApi.unarchivePlan(planAction.plan.id)
                : planAction.kind === "activate"
                  ? platformApi.activatePlan(planAction.plan.id)
                  : platformApi.deactivatePlan(planAction.plan.id);
          request
            .then(() => {
              toast.success(
                planAction.kind === "delete"
                  ? "Plano excluído."
                  : planAction.kind === "unarchive"
                    ? "Plano desarquivado."
                    : planAction.kind === "activate"
                      ? "Plano ativado."
                      : "Plano desabilitado.",
              );
              setPlanAction(null);
              load();
            })
            .catch((error) => toast.error((error as Error).message));
        }}
      />
    </AdminContainer>
  );
}

function PlanView({ plan, onClose }: { plan: PlatformPlan | null; onClose: () => void }) {
  const enabledFeatures = plan ? FEATURE_OPTIONS.filter(({ key }) => plan.features[key]) : [];

  return (
    <Modal
      open={Boolean(plan)}
      onClose={onClose}
      title="Visualizar Plano"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {plan && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <PlanReadOnlyDetail label="Nome do plano" value={plan.name} />
            <PlanReadOnlyDetail label="Código" value={plan.code} />
            <PlanReadOnlyDetail label="Status" value={STATUS_LABELS[plan.status] ?? plan.status} />
            <PlanReadOnlyDetail label="Dias de trial" value={plan.trialDays ?? 0} />
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="text-base font-semibold">Limites do plano</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <PlanReadOnlyDetail
                label="Instâncias"
                value={(plan.limits.maxConnections ?? 0).toLocaleString("pt-BR")}
              />
              <PlanReadOnlyDetail
                label="Usuários"
                value={(plan.limits.maxUsers ?? 0).toLocaleString("pt-BR")}
              />
              <PlanReadOnlyDetail
                label="Campanhas"
                value={(plan.limits.maxCampaigns ?? 0).toLocaleString("pt-BR")}
              />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="text-base font-semibold">Módulos e funcionalidades</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {enabledFeatures.length ? (
                enabledFeatures.map(({ key, label }) => (
                  <Badge key={key} tone="success">
                    {label}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Nenhum módulo habilitado.</span>
              )}
            </div>
          </div>

          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            {(plan._count?.subscriptions ?? 0).toLocaleString("pt-BR")}{" "}
            {(plan._count?.subscriptions ?? 0) === 1
              ? "assinatura vinculada."
              : "assinaturas vinculadas."}
          </p>
        </div>
      )}
    </Modal>
  );
}

function PlanReadOnlyDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

const DEFAULT_FEATURES: Record<string, boolean> = {
  chat: true,
  campaigns: true,
  tickets: true,
};

const DEFAULT_LIMITS: Record<string, number> = {
  maxUsers: 3,
  maxConnections: 1,
  maxCampaigns: 0,
};

function PlanForm({
  open,
  initial,
  forceCreate = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: PlatformPlan;
  forceCreate?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [status, setStatus] = React.useState<"ACTIVE" | "SUSPENDED" | "INACTIVE">("ACTIVE");
  const [trialDays, setTrialDays] = React.useState(0);
  const [features, setFeatures] = React.useState<Record<string, boolean>>(DEFAULT_FEATURES);
  const [limits, setLimits] = React.useState<Record<string, number>>(DEFAULT_LIMITS);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(forceCreate && initial ? `${initial.name} - Cópia` : (initial?.name ?? ""));
    setCode(forceCreate ? "" : (initial?.code ?? ""));
    setStatus(normalizeEditablePlanStatus(initial?.status));
    setTrialDays(initial?.trialDays ?? 0);
    setFeatures({ ...DEFAULT_FEATURES, ...(initial?.features ?? {}) });
    setLimits({ ...DEFAULT_LIMITS, ...(initial?.limits ?? {}) });
  }, [forceCreate, initial, open]);

  function setLimit(key: string, value: string) {
    const parsed = Number(value);
    setLimits((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  function setFeature(key: FeatureKey, enabled: boolean) {
    setFeatures((current) => ({ ...current, [key]: enabled }));
  }

  async function save() {
    try {
      const visibleLimits = [limits.maxUsers, limits.maxConnections, limits.maxCampaigns];
      if (!name.trim()) throw new Error("Informe o nome do plano.");
      if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 90) {
        throw new Error("Informe uma quantidade válida de dias de trial.");
      }
      if (visibleLimits.some((value) => !Number.isInteger(value) || value < 0)) {
        throw new Error("Os limites devem ser números inteiros iguais ou maiores que zero.");
      }

      const payload = {
        name: name.trim(),
        status,
        trialDays,
        features,
        limits,
      };
      setSaving(true);
      if (initial && !forceCreate) {
        await platformApi.updatePlan(
          initial.id,
          payload as Parameters<typeof platformApi.updatePlan>[1],
        );
      } else {
        await platformApi.createPlan({
          ...payload,
          status: status as "ACTIVE",
        });
      }
      toast.success(initial && !forceCreate ? "Plano atualizado." : "Plano criado.");
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
      title={initial && !forceCreate ? "Editar Plano" : "Novo Plano"}
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="save-action-button" disabled={saving} onClick={save}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status *">
          <PlanStatusSelect value={status} onChange={setStatus} />
        </Field>
        <Field label="Nome do plano *">
          <Input
            value={name}
            placeholder="Ex.: Basic, Profissional..."
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Código">
          <Input
            value={initial && !forceCreate ? code : ""}
            disabled
            placeholder="ID gerado automaticamente"
            aria-label="Código gerado automaticamente"
          />
        </Field>
        <Field label="Dias de trial">
          <Input
            type="number"
            min={0}
            max={90}
            step={1}
            value={trialDays}
            onChange={(event) => setTrialDays(Number(event.target.value))}
          />
        </Field>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-base font-semibold">Limites do plano</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina os limites de uso para este plano.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <LimitField
            icon={Layers3}
            label="Instâncias"
            value={limits.maxConnections}
            onChange={(value) => setLimit("maxConnections", value)}
          />
          <LimitField
            icon={Users}
            label="Usuários"
            value={limits.maxUsers}
            onChange={(value) => setLimit("maxUsers", value)}
          />
          <LimitField
            icon={Megaphone}
            label="Campanhas"
            value={limits.maxCampaigns}
            onChange={(value) => setLimit("maxCampaigns", value)}
          />
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-base font-semibold">Módulos e funcionalidades</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Habilite ou desabilite os módulos disponíveis neste plano.
        </p>
        <div className="mt-4 grid gap-3">
          {FEATURE_OPTIONS.map(({ key, label, description, icon: Icon }) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 p-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={features[key] === true}
                onCheckedChange={(checked) => setFeature(key, checked)}
                aria-label={`${features[key] ? "Desabilitar" : "Habilitar"} ${label}`}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function LimitField({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
        <Input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

type EditablePlanStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";

function PlanStatusSelect({
  value,
  onChange,
}: {
  value: EditablePlanStatus;
  onChange: (value: EditablePlanStatus) => void;
}) {
  const indicator =
    value === "ACTIVE" ? "bg-success" : value === "SUSPENDED" ? "bg-warning" : "bg-destructive";
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-3 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${indicator}`}
      />
      <Select
        value={value}
        className="pl-8"
        onChange={(event) => onChange(event.target.value as EditablePlanStatus)}
      >
        <option value="ACTIVE">Ativo</option>
        <option value="SUSPENDED">Suspenso</option>
        <option value="INACTIVE">Inativo</option>
      </Select>
    </div>
  );
}

function normalizeEditablePlanStatus(status?: string): EditablePlanStatus {
  if (status === "SUSPENDED") return "SUSPENDED";
  if (["INACTIVE", "DRAFT", "ARCHIVED"].includes(status ?? "")) return "INACTIVE";
  return "ACTIVE";
}

function Limit({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="font-mono text-xs">{(value ?? 0).toLocaleString("pt-BR")}</span>
    </div>
  );
}

function statusTone(status: string): "success" | "warning" | "destructive" | "default" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED") return "warning";
  if (["INACTIVE", "DRAFT", "ARCHIVED"].includes(status)) return "destructive";
  return "default";
}
