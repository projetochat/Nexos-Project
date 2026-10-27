import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Eye,
  EyeOff,
  KeyRound,
  LayoutGrid,
  List,
  Lock,
  LockOpen,
  MoreVertical,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import { GridPaginationFooter } from "@/components/grid-pagination-footer";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import { Modal } from "@/components/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { fmtDate } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields";
import {
  platformApi,
  type PlatformPlan,
  type PlatformTenant,
  type PlatformTenantConfiguration,
} from "@/lib/trixus-api";

export const Route = createFileRoute("/admin/tenants")({
  head: () => ({ meta: [{ title: "Tenants | Trixus" }] }),
  component: TenantsAdmin,
});

type TenantListRow = PlatformTenant & {
  client?: {
    id: string;
    name: string;
    responsibleName?: string | null;
    responsibleEmail?: string | null;
  } | null;
  platformClient?: {
    id: string;
    name: string;
    responsibleName?: string | null;
    responsibleEmail?: string | null;
  } | null;
  campaigns?: number;
  maxCampaigns?: number | null;
  plan: (PlatformTenant["plan"] & { limits?: Record<string, number> }) | null;
};

function TenantsAdmin() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = React.useState<"cards" | "list">("list");
  const viewModeTouched = React.useRef(false);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [data, setData] = React.useState({
    items: [] as PlatformTenant[],
    total: 0,
    totalPages: 1,
  });
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = React.useState<TenantListRow | null>(null);
  const [credentialTenant, setCredentialTenant] = React.useState<TenantListRow | null>(null);
  const [configurationTenant, setConfigurationTenant] = React.useState<TenantListRow | null>(null);

  React.useEffect(() => {
    if (isMobile) {
      setViewMode("cards");
      return;
    }
    if (!viewModeTouched.current) setViewMode("list");
  }, [isMobile]);

  const load = React.useCallback(
    () =>
      Promise.all([
        platformApi.tenants({
          q: q || undefined,
          status: status || undefined,
          planId: planId || undefined,
          page,
          pageSize,
        }),
        platformApi.plans({ pageSize: 100 }),
      ])
        .then(([tenants, planList]) => {
          setData(tenants);
          setPlans(planList.items);
          setError(null);
        })
        .catch((reason) => setError((reason as Error).message)),
    [page, pageSize, planId, q, status],
  );

  React.useEffect(() => void load(), [load]);
  React.useEffect(() => setPage(1), [pageSize, planId, q, status]);
  const hasActiveFilters = Boolean(q || status || planId);

  function clearFilters() {
    setQ("");
    setStatus("");
    setPlanId("");
    setPage(1);
  }

  const paginationFooter = (
    <GridPaginationFooter
      visible={data.items.length}
      total={data.total}
      page={page}
      totalPages={data.totalPages}
      pageSize={pageSize}
      onPage={(nextPage) => setPage(nextPage)}
      onPageSize={(nextPageSize) => setPageSize(nextPageSize)}
      ariaLabelPrefix="tenants"
    />
  );

  return (
    <AdminContainer>
      <SectionHeader title="Tenants" subtitle="Consulta das tenants cadastradas." />
      <Card className="mb-4">
        <div
          className={`grid grid-cols-2 gap-3 md:grid-cols-2 ${
            hasActiveFilters ? "xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]" : "xl:grid-cols-6"
          }`}
          data-platform-filter-grid
        >
          <div className="col-span-2 min-w-0 md:col-span-1 xl:col-span-4">
            <Field label="Busca">
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder="Buscar por nome, cliente ou responsável..."
              />
            </Field>
          </div>
          <div className="min-w-0">
            <Field label="Plano">
              <Select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                <option value="">Todos</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-0">
            <Field label="Status">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos</option>
                <option value="ACTIVE">Ativo</option>
                <option value="TRIAL">Em configuração</option>
                <option value="SUSPENDED">Suspenso</option>
                <option value="TERMINATED">Cancelado</option>
              </Select>
            </Field>
          </div>
          {hasActiveFilters && (
            <div className="col-span-2 flex justify-end md:col-span-1 md:items-end">
              <ClearFiltersButton onClick={clearFilters} />
            </div>
          )}
        </div>
      </Card>
      <div className="mb-3 hidden justify-end gap-1 md:flex" aria-label="Visualização das tenants">
        <Button
          type="button"
          variant={viewMode === "cards" ? "primary" : "secondary"}
          size="icon"
          aria-label="Visualizar tenants em cards"
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
          aria-label="Visualizar tenants em lista"
          aria-pressed={viewMode === "list"}
          onClick={() => {
            viewModeTouched.current = true;
            setViewMode("list");
          }}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
      {error && <div className="mb-3 text-sm text-destructive">{error}</div>}
      <div data-platform-card-shell className={viewMode === "cards" ? "space-y-3" : "hidden"}>
        <div
          data-platform-mobile-list
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {(data.items as TenantListRow[]).map((tenant) => {
            const client = tenant.client ?? tenant.platformClient;
            const campaigns =
              tenant.maxCampaigns ?? tenant.plan?.limits?.campaigns ?? tenant.campaigns ?? 0;
            return (
              <article key={tenant.id} className="rounded-xl border border-border bg-surface-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{client?.name ?? tenant.name}</h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{tenant.slug}</p>
                  </div>
                  <TenantStatus value={tenant.status} />
                </div>
                <dl className="mt-3 grid gap-2 border-y border-border/70 py-3 text-sm">
                  <MobileTenantDetail
                    label="Responsável"
                    value={tenant.responsibleName ?? client?.responsibleName ?? "Não informado"}
                  />
                  <MobileTenantDetail
                    label="E-mail"
                    value={tenant.responsibleEmail ?? client?.responsibleEmail ?? "Não informado"}
                  />
                  <MobileTenantDetail label="Plano" value={tenant.plan?.name ?? "Sem plano"} />
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <MobileTenantMetric
                      label="Instâncias"
                      value={tenant.maxConnections ?? tenant.connections}
                    />
                    <MobileTenantMetric
                      label="Usuários"
                      value={tenant.maxUsers ?? tenant.activeUsers}
                    />
                    <MobileTenantMetric label="Campanhas" value={campaigns} />
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    Criada em {formatTenantTableDate(tenant.createdAt)}
                  </span>
                  <TenantCardActions
                    tenant={tenant}
                    onView={() => setSelectedTenant(tenant)}
                    onCredentials={() => setCredentialTenant(tenant)}
                    onConfiguration={() => setConfigurationTenant(tenant)}
                  />
                </div>
              </article>
            );
          })}
          {!data.items.length && (
            <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
              Nenhum tenant encontrado.
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
      <Card padding={false} className={viewMode === "list" ? "overflow-hidden p-0" : "hidden"}>
        <div data-platform-desktop-table className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground [&_th]:px-3 [&_th]:py-3 [&_th]:font-medium">
              <tr>
                <th className="!px-4 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">Responsável</th>
                <th className="px-3 py-3 font-medium">Tenant</th>
                <th className="px-3 py-3 font-medium">Plano</th>
                <th className="px-3 py-3 text-center font-medium">Instâncias</th>
                <th className="px-3 py-3 text-center font-medium">Usuários</th>
                <th className="px-3 py-3 text-center font-medium">Campanhas</th>
                <th className="px-3 py-3 text-center font-medium">Dt./Hora</th>
                <th>Status</th>
                <th className="px-4 py-3 text-center font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border [&_td]:px-3 [&_td]:py-3">
              {(data.items as TenantListRow[]).map((tenant) => {
                const client = tenant.client ?? tenant.platformClient;
                const campaigns =
                  tenant.maxCampaigns ?? tenant.plan?.limits?.campaigns ?? tenant.campaigns ?? 0;
                return (
                  <tr key={tenant.id} className="transition hover:bg-surface-1">
                    <td className="!px-4 py-3 font-medium">{client?.name ?? tenant.name}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">
                        {tenant.responsibleName ?? client?.responsibleName ?? "Não informado"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tenant.responsibleEmail ?? client?.responsibleEmail ?? "Não informado"}
                      </div>
                    </td>
                    <td className="font-medium">{tenant.slug}</td>
                    <td className="px-3 py-3">{tenant.plan?.name ?? "Sem plano"}</td>
                    <td className="px-3 py-3 text-center">
                      {tenant.maxConnections ?? tenant.connections}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {tenant.maxUsers ?? tenant.activeUsers}
                    </td>
                    <td className="px-3 py-3 text-center">{campaigns}</td>
                    <td className="px-3 py-3 text-center">
                      {formatTenantTableDate(tenant.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <TenantStatus value={tenant.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TenantActions
                        tenant={tenant}
                        onView={() => setSelectedTenant(tenant)}
                        onCredentials={() => setCredentialTenant(tenant)}
                        onConfiguration={() => setConfigurationTenant(tenant)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!data.items.length && (
            <div className="py-14 text-center text-sm text-muted-foreground">
              Nenhum tenant encontrado.
            </div>
          )}
        </div>
        {paginationFooter}
      </Card>
      <TenantSummaryModal tenant={selectedTenant} onClose={() => setSelectedTenant(null)} />
      <TenantCredentialsModal
        tenant={credentialTenant}
        onClose={() => setCredentialTenant(null)}
        onSaved={async () => {
          await load();
          setCredentialTenant(null);
        }}
      />
      <TenantConfigurationModal
        tenant={configurationTenant}
        onClose={() => setConfigurationTenant(null)}
        onSaved={async () => {
          await load();
          setConfigurationTenant(null);
        }}
      />
    </AdminContainer>
  );
}

function TenantCardActions({
  tenant,
  onView,
  onCredentials,
  onConfiguration,
}: {
  tenant: TenantListRow;
  onView: () => void;
  onCredentials: () => void;
  onConfiguration: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1" aria-label="Ações da tenant">
      <TenantCardActionIcon icon={Eye} label="Visualizar" onClick={onView} />
      {tenant.status === "ACTIVE" && (
        <TenantCardActionIcon
          icon={KeyRound}
          label="Gerenciar credenciais"
          tone="warning"
          onClick={onCredentials}
        />
      )}
      <TenantCardActionIcon
        icon={Settings2}
        label="Configuração da Tenant"
        onClick={onConfiguration}
      />
    </div>
  );
}

function TenantCardActionIcon({
  icon: Icon,
  label,
  tone = "primary",
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "primary" | "warning";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-1 text-muted-foreground transition ${
        tone === "warning"
          ? "hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:hover:border-amber-800 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
          : "action-hover-primary"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function TenantActions({
  tenant,
  onView,
  onCredentials,
  onConfiguration,
}: {
  tenant: TenantListRow;
  onView: () => void;
  onCredentials: () => void;
  onConfiguration: () => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Ações da Tenant ${tenant.slug}`}
          className="action-hover-primary inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1 text-muted-foreground transition"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onSelect={onView}
          className="cursor-pointer focus:bg-blue-50 focus:text-blue-700 dark:focus:bg-blue-950/40 dark:focus:text-blue-300"
        >
          <Eye /> Visualizar
        </DropdownMenuItem>
        {tenant.status === "ACTIVE" && (
          <DropdownMenuItem
            onSelect={onCredentials}
            className="cursor-pointer focus:bg-amber-50 focus:text-amber-700 dark:focus:bg-amber-950/40 dark:focus:text-amber-300"
          >
            <KeyRound /> Gerenciar credenciais
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={onConfiguration}
          className="cursor-pointer focus:bg-blue-50 focus:text-blue-700 dark:focus:bg-blue-950/40 dark:focus:text-blue-300"
        >
          <Settings2 /> Configuração da Tenant
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileTenantDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  );
}

function MobileTenantMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 border-r border-border/70 last:border-r-0">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function formatTenantTableDate(value: string) {
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

const TENANT_LIMIT_FIELDS = [
  ["maxUsers", "Usuários"],
  ["maxDepartments", "Departamentos"],
  ["maxConnections", "Instâncias"],
  ["maxCampaigns", "Campanhas por período"],
  ["maxContacts", "Contatos"],
  ["maxCampaignRecipients", "Destinatários por campanha"],
  ["maxStorageBytes", "Armazenamento (bytes)"],
] as const;

function TenantConfigurationModal({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: TenantListRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [configuration, setConfiguration] = React.useState<PlatformTenantConfiguration | null>(
    null,
  );
  const [modules, setModules] = React.useState({ campaigns: false, tickets: false });
  const [limits, setLimits] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!tenant) {
      setConfiguration(null);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void platformApi
      .tenantConfiguration(tenant.id)
      .then((result) => {
        if (cancelled) return;
        setConfiguration(result);
        setModules({ campaigns: result.modules.campaigns, tickets: result.modules.tickets });
        setLimits(
          Object.fromEntries(
            TENANT_LIMIT_FIELDS.map(([key]) => {
              const override = result.overrides.limits[key];
              return [key, override == null ? "" : String(override)];
            }),
          ),
        );
      })
      .catch((reason) => {
        if (!cancelled) setError((reason as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant]);

  const save = async () => {
    if (!tenant || !configuration) return;
    const normalizedLimits: Record<string, number | null> = {};
    for (const [key, label] of TENANT_LIMIT_FIELDS) {
      const raw = limits[key]?.trim() ?? "";
      if (!raw) {
        normalizedLimits[key] = null;
        continue;
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        toast.error(`Informe um limite válido para ${label}.`);
        return;
      }
      normalizedLimits[key] = value;
    }
    setSaving(true);
    try {
      await platformApi.updateTenantConfiguration(tenant.id, {
        modules: { chat: true, campaigns: modules.campaigns, tickets: modules.tickets },
        limits: normalizedLimits,
      });
      toast.success("Configuração da Tenant atualizada.");
      await onSaved();
    } catch (reason) {
      toast.error((reason as Error).message || "Não foi possível atualizar a configuração.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(tenant)}
      onClose={onClose}
      closeOnBackdrop={!saving}
      title="Configuração da Tenant"
      description={tenant ? `Módulos e limites individuais de ${tenant.name}.` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="save-action-button"
            onClick={() => void save()}
            disabled={loading || saving || !configuration}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando configuração...</p>
      ) : error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : configuration ? (
        <div className="space-y-6">
          <section>
            <h3 className="font-semibold">Módulos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A desativação preserva os dados e remove o acesso ao módulo na Tenant.
            </p>
            <div className="mt-3 space-y-2">
              <ModuleToggle
                label="Chat"
                description="Módulo obrigatório e sempre habilitado."
                checked
                disabled
                onCheckedChange={() => undefined}
              />
              <ModuleToggle
                label="Campanhas"
                description="Controla menu, permissões e operações de campanhas."
                checked={modules.campaigns}
                disabled={saving}
                onCheckedChange={(checked) =>
                  setModules((current) => ({ ...current, campaigns: checked }))
                }
              />
              <ModuleToggle
                label="Chamados"
                description="Controla menu, permissões e geração de chamados pelo Chat."
                checked={modules.tickets}
                disabled={saving}
                onCheckedChange={(checked) =>
                  setModules((current) => ({ ...current, tickets: checked }))
                }
              />
            </div>
          </section>

          <section className="border-t border-border pt-5">
            <h3 className="font-semibold">Limites do plano</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Deixe vazio para herdar o limite atual do plano contratado.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {TENANT_LIMIT_FIELDS.map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={limits[key] ?? ""}
                    placeholder={`Plano: ${configuration.limits[key] ?? "—"}`}
                    disabled={saving}
                    onChange={(event) =>
                      setLimits((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

function ModuleToggle({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-1 p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={`${checked ? "Desabilitar" : "Habilitar"} ${label}`}
      />
    </div>
  );
}

function TenantCredentialsModal({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: TenantListRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const client = tenant?.client ?? tenant?.platformClient;
  const [responsibleName, setResponsibleName] = React.useState("");
  const [responsibleEmail, setResponsibleEmail] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [passwordUnlocked, setPasswordUnlocked] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const [loadingAdministrator, setLoadingAdministrator] = React.useState(false);
  const [administratorLoadError, setAdministratorLoadError] = React.useState<string | null>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setErrors({});
    setResponsibleName(tenant?.responsibleName ?? client?.responsibleName ?? "");
    setResponsibleEmail(
      (tenant?.responsibleEmail ?? client?.responsibleEmail ?? "").toLocaleLowerCase("en-US"),
    );
    setNewPassword("");
    setPasswordUnlocked(false);
    setShowPassword(false);
    setAdministratorLoadError(null);
    if (!tenant) {
      setLoadingAdministrator(false);
      return;
    }

    let current = true;
    setLoadingAdministrator(true);
    void platformApi
      .tenant(tenant.id)
      .then((detail) => {
        if (!current) return;
        const administrator = detail.detail.users.find(
          (membership) => membership.status === "ACTIVE" && membership.role.key === "tenant_admin",
        );
        if (administrator) {
          setResponsibleName(administrator.user.name);
          setResponsibleEmail(administrator.user.email.toLocaleLowerCase("en-US"));
        }
      })
      .catch((reason) => {
        if (!current) return;
        setAdministratorLoadError(
          (reason as Error).message || "Não foi possível carregar o usuário administrador.",
        );
      })
      .finally(() => {
        if (current) setLoadingAdministrator(false);
      });

    return () => {
      current = false;
    };
  }, [client?.responsibleEmail, client?.responsibleName, tenant]);

  React.useEffect(() => {
    setErrors((current) => {
      const next = { ...current };
      if (responsibleName.trim()) delete next.responsibleName;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(responsibleEmail.trim())) delete next.responsibleEmail;
      if (!passwordUnlocked || newPassword.length >= 6) delete next.newPassword;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [newPassword, passwordUnlocked, responsibleEmail, responsibleName]);

  const save = async () => {
    if (!tenant) return;
    if (loadingAdministrator || administratorLoadError) return;
    const name = responsibleName.trim();
    const email = responsibleEmail.trim().toLowerCase();
    const nextErrors: Record<string, boolean> = {
      ...(!name ? { responsibleName: true } : {}),
      ...(!email ? { responsibleEmail: true } : {}),
      ...(passwordUnlocked && !newPassword ? { newPassword: true } : {}),
    };
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      showRequiredFieldsToast(
        [
          ["responsibleName", "Nome do responsável"],
          ["responsibleEmail", "E-mail do responsável"],
          ["newPassword", "Nova senha"],
        ]
          .filter(([key]) => nextErrors[key])
          .map(([, label]) => label),
      );
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors({ responsibleEmail: true });
      return toast.error("Informe um e-mail válido.");
    }
    if (passwordUnlocked && newPassword.length < 6) {
      setErrors({ newPassword: true });
      return toast.error("A nova senha deve ter ao menos 6 caracteres.");
    }
    setSaving(true);
    try {
      await platformApi.updateTenantAdministratorCredentials(tenant.id, {
        responsibleName: name,
        responsibleEmail: email,
        ...(passwordUnlocked ? { newPassword } : {}),
      });
      await onSaved();
      toast.success("Credenciais do administrador atualizadas.");
    } catch (reason) {
      toast.error((reason as Error).message || "Não foi possível atualizar as credenciais.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(tenant)}
      onClose={onClose}
      closeOnBackdrop={!saving}
      title="Gerenciar credenciais do usuário administrador"
      description="As alterações serão refletidas também na Configuração da Empresa da Tenant."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="save-action-button"
            onClick={() => void save()}
            disabled={saving || loadingAdministrator || Boolean(administratorLoadError)}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      {administratorLoadError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {administratorLoadError}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do responsável *">
          <Input
            value={responsibleName}
            onChange={(event) => setResponsibleName(event.target.value)}
            disabled={saving || loadingAdministrator}
            className={requiredFieldClassName(Boolean(errors.responsibleName))}
            aria-invalid={Boolean(errors.responsibleName)}
          />
        </Field>
        <Field label="E-mail do responsável *">
          <Input
            type="email"
            value={responsibleEmail}
            onChange={(event) => setResponsibleEmail(event.target.value.toLocaleLowerCase("en-US"))}
            disabled={saving || loadingAdministrator}
            className={requiredFieldClassName(Boolean(errors.responsibleEmail))}
            aria-invalid={Boolean(errors.responsibleEmail)}
          />
        </Field>
        <Field label={passwordUnlocked ? "Nova senha *" : "Nova senha"}>
          <div className="relative">
            <Input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={!passwordUnlocked || saving}
              placeholder={passwordUnlocked ? "Digite a nova senha" : "Senha protegida"}
              className={`pr-20 ${requiredFieldClassName(Boolean(errors.newPassword))}`}
              aria-invalid={Boolean(errors.newPassword)}
            />
            <button
              type="button"
              aria-label={passwordUnlocked ? "Bloquear alteração de senha" : "Alterar senha"}
              disabled={saving}
              onClick={() => {
                if (passwordUnlocked) {
                  setPasswordUnlocked(false);
                  setShowPassword(false);
                  setNewPassword("");
                  return;
                }
                setPasswordUnlocked(true);
                requestAnimationFrame(() => passwordRef.current?.focus());
              }}
              className={`absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground transition ${passwordUnlocked ? "hover:text-red-600" : "hover:text-blue-600"}`}
            >
              {passwordUnlocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </button>
            {passwordUnlocked && (
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Visualizar senha"}
                disabled={saving}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-10 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground transition hover:text-primary"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Se o primeiro acesso ainda estiver pendente, esta senha será temporária e deverá ser
            substituída pelo administrador ao entrar.
          </p>
        </Field>
      </div>
    </Modal>
  );
}

function TenantSummaryModal({
  tenant,
  onClose,
}: {
  tenant: TenantListRow | null;
  onClose: () => void;
}) {
  const client = tenant?.client ?? tenant?.platformClient;
  const campaigns =
    tenant?.maxCampaigns ?? tenant?.plan?.limits?.campaigns ?? tenant?.campaigns ?? 0;

  return (
    <Modal
      open={Boolean(tenant)}
      onClose={onClose}
      title="Resumo da tenant"
      description="Consulta em modo somente leitura."
      size="lg"
      footer={
        tenant && (
          <>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Link
              to="/admin/tenants/$tenantId"
              params={{ tenantId: tenant.id }}
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Ver detalhes completos
            </Link>
          </>
        )
      }
    >
      {tenant && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnly label="Cliente" value={client?.name ?? tenant.name} />
          <ReadOnly
            label="Responsável"
            value={tenant.responsibleName ?? client?.responsibleName ?? "Não informado"}
          />
          <ReadOnly
            label="E-mail"
            value={tenant.responsibleEmail ?? client?.responsibleEmail ?? "Não informado"}
          />
          <ReadOnly label="Tenant" value={tenant.name} />
          <ReadOnly label="Domínio" value={tenant.slug} />
          <ReadOnly label="Plano" value={tenant.plan?.name ?? "Sem plano"} />
          <ReadOnly label="Status" value={<TenantStatus value={tenant.status} />} />
          <ReadOnly label="Assinatura" value={tenant.subscriptionStatus ?? "Não informada"} />
          <ReadOnly
            label="Instâncias"
            value={String(tenant.maxConnections ?? tenant.connections)}
          />
          <ReadOnly label="Usuários" value={String(tenant.maxUsers ?? tenant.activeUsers)} />
          <ReadOnly label="Campanhas" value={String(campaigns)} />
          <ReadOnly label="Data de criação" value={fmtDate(new Date(tenant.createdAt).getTime())} />
        </div>
      )}
    </Modal>
  );
}

function ReadOnly({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-3 py-2">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function TenantStatus({ value }: { value: string }) {
  const labels: Record<string, string> = {
    ACTIVE: "Ativo",
    PROVISIONING: "Em configuração",
    TRIAL: "Em configuração",
    SUSPENDED: "Suspenso",
    TERMINATED: "Cancelado",
  };
  const tone =
    value === "ACTIVE"
      ? "success"
      : value === "SUSPENDED"
        ? "info"
        : value === "TERMINATED"
          ? "destructive"
          : "warning";
  return <Badge tone={tone}>{labels[value] ?? value}</Badge>;
}
