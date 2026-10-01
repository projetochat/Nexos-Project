import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Lock, LockOpen, MoreVertical, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import { DashboardDateInput } from "@/components/dashboard-filters";
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
import { DASHBOARD_PERIOD_OPTIONS, datesForOperationalPeriod } from "@/lib/operational-filters";
import {
  platformApi,
  type OperationalPeriod,
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
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [period, setPeriod] = React.useState<OperationalPeriod>("today");
  const initialDates = React.useMemo(() => datesForOperationalPeriod("today"), []);
  const [dateFrom, setDateFrom] = React.useState(initialDates.start);
  const [dateTo, setDateTo] = React.useState(initialDates.end);
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

  const load = React.useCallback(
    () =>
      Promise.all([
        platformApi.tenants({
          q: q || undefined,
          status: status || undefined,
          planId: planId || undefined,
          dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
          dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
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
    [dateFrom, dateTo, page, pageSize, planId, q, status],
  );

  React.useEffect(() => void load(), [load]);
  React.useEffect(() => setPage(1), [dateFrom, dateTo, pageSize, planId, q, status]);

  return (
    <AdminContainer>
      <SectionHeader title="Tenants" subtitle="Consulta das tenants cadastradas." />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Busca">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Buscar por nome, cliente ou responsável..."
            />
          </Field>
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
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="ACTIVE">Ativo</option>
              <option value="TRIAL">Em configuração</option>
              <option value="SUSPENDED">Suspenso</option>
              <option value="TERMINATED">Cancelado</option>
            </Select>
          </Field>
          <Field label="Período">
            <Select
              value={period}
              onChange={(event) => {
                const nextPeriod = event.target.value as OperationalPeriod;
                setPeriod(nextPeriod);
                if (nextPeriod !== "custom") {
                  const dates = datesForOperationalPeriod(nextPeriod);
                  setDateFrom(dates.start);
                  setDateTo(dates.end);
                }
              }}
            >
              {DASHBOARD_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dt. Inicial">
            <DashboardDateInput
              value={dateFrom}
              readOnly={period !== "custom"}
              onChange={setDateFrom}
            />
          </Field>
          <Field label="Dt. Final">
            <DashboardDateInput
              value={dateTo}
              readOnly={period !== "custom"}
              onChange={setDateTo}
            />
          </Field>
        </div>
      </Card>
      <Card className="p-0">
        {error && (
          <div className="border-b border-border p-4 text-sm text-destructive">{error}</div>
        )}
        <div className="overflow-x-auto px-4">
          <table className="w-full min-w-[1160px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-3">Cliente</th>
                <th>Responsável</th>
                <th>Tenant</th>
                <th>Plano</th>
                <th className="text-center">Instâncias</th>
                <th className="text-center">Usuários</th>
                <th className="text-center">Campanhas</th>
                <th className="text-center">Dt./Hora</th>
                <th>Status</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(data.items as TenantListRow[]).map((tenant) => {
                const client = tenant.client ?? tenant.platformClient;
                const campaigns =
                  tenant.maxCampaigns ?? tenant.plan?.limits?.campaigns ?? tenant.campaigns ?? 0;
                return (
                  <tr key={tenant.id} className="border-b border-border/70 hover:bg-surface-1">
                    <td className="py-3 font-medium">{client?.name ?? tenant.name}</td>
                    <td>
                      <div className="font-medium">
                        {tenant.responsibleName ?? client?.responsibleName ?? "Não informado"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tenant.responsibleEmail ?? client?.responsibleEmail ?? "Não informado"}
                      </div>
                    </td>
                    <td className="font-medium">{tenant.slug}</td>
                    <td>{tenant.plan?.name ?? "Sem plano"}</td>
                    <td className="text-center">{tenant.maxConnections ?? tenant.connections}</td>
                    <td className="text-center">{tenant.maxUsers ?? tenant.activeUsers}</td>
                    <td className="text-center">{campaigns}</td>
                    <td className="text-center">{formatTenantTableDate(tenant.createdAt)}</td>
                    <td>
                      <TenantStatus value={tenant.status} />
                    </td>
                    <td className="text-center">
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
                        <DropdownMenuContent align="end" className="w-80">
                          <DropdownMenuItem
                            onSelect={() => setSelectedTenant(tenant)}
                            className="cursor-pointer focus:bg-blue-50 focus:text-blue-700 dark:focus:bg-blue-950/40 dark:focus:text-blue-300"
                          >
                            <Eye /> Visualizar
                          </DropdownMenuItem>
                          {tenant.status === "ACTIVE" && (
                            <DropdownMenuItem
                              onSelect={() => setCredentialTenant(tenant)}
                              className="cursor-pointer focus:bg-amber-50 focus:text-amber-700 dark:focus:bg-amber-950/40 dark:focus:text-amber-300"
                            >
                              <KeyRound /> Gerenciar credenciais
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onSelect={() => setConfigurationTenant(tenant)}
                            className="cursor-pointer focus:bg-blue-50 focus:text-blue-700 dark:focus:bg-blue-950/40 dark:focus:text-blue-300"
                          >
                            <Settings2 /> Configuração da Tenant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span>
              Mostrando {data.items.length} de {data.total}
            </span>
            <Select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="h-8 min-h-8 w-20 py-1"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </Button>
            <span>
              {page} / {data.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              ›
            </Button>
          </div>
        </div>
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
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={loading || saving || !configuration}>
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
  const [saving, setSaving] = React.useState(false);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setResponsibleName(tenant?.responsibleName ?? client?.responsibleName ?? "");
    setResponsibleEmail(tenant?.responsibleEmail ?? client?.responsibleEmail ?? "");
    setNewPassword("");
    setPasswordUnlocked(false);
    setShowPassword(false);
  }, [client?.responsibleEmail, client?.responsibleName, tenant]);

  const save = async () => {
    if (!tenant) return;
    const name = responsibleName.trim();
    const email = responsibleEmail.trim().toLowerCase();
    if (!name) return toast.error("Informe o nome do responsável.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return toast.error("Informe um e-mail válido.");
    }
    if (passwordUnlocked && newPassword.length < 6) {
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
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do responsável *">
          <Input
            value={responsibleName}
            onChange={(event) => setResponsibleName(event.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="E-mail do responsável *">
          <Input
            type="email"
            value={responsibleEmail}
            onChange={(event) => setResponsibleEmail(event.target.value)}
            disabled={saving}
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
              className="pr-20"
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
