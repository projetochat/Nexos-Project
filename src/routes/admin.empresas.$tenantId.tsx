import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Ban, CheckCircle2, LogIn, Play, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import {
  activatePlatformImpersonation,
  platformApi,
  type PlatformTenantDetail,
} from "@/lib/nexos-api";
import { useSession } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { sortByOptionLabel } from "@/lib/sort-options";

export const Route = createFileRoute("/admin/empresas/$tenantId")({
  head: () => ({ meta: [{ title: "Tenant - Nexo Admin" }] }),
  component: TenantDetailPage,
});

function TenantDetailPage() {
  const { tenantId } = Route.useParams();
  const navigate = useNavigate();
  const actor = useSession((s) => s.user);
  const loginAs = useSession((s) => s.loginAs);
  const impersonate = useSession((s) => s.impersonate);
  const activeImpersonation = useSession((s) => s.impersonating);
  const [tenant, setTenant] = React.useState<PlatformTenantDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [suspendConfirm, setSuspendConfirm] = React.useState("");
  const [terminateSlug, setTerminateSlug] = React.useState("");
  const [terminationAware, setTerminationAware] = React.useState(false);
  const [membershipId, setMembershipId] = React.useState("");
  const [impersonationReason, setImpersonationReason] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    platformApi
      .tenant(tenantId)
      .then((data) => {
        setTenant(data);
        setError(null);
        setMembershipId((current) => current || data.detail.users[0]?.id || "");
      })
      .catch((err) => setError((err as Error).message));
  }, [tenantId]);

  React.useEffect(() => {
    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function mutate(action: "suspend" | "reactivate" | "terminate") {
    if (!tenant) return;
    setBusy(action);
    setError(null);
    try {
      if (action === "suspend") {
        await platformApi.suspendTenant(tenant.id, reason);
        toast.success("Tenant suspenso");
      }
      if (action === "reactivate") {
        await platformApi.reactivateTenant(tenant.id, reason || "Reativacao administrativa");
        toast.success("Tenant reativado");
      }
      if (action === "terminate") {
        await platformApi.terminateTenant(tenant.id, reason, terminateSlug);
        toast.success("Tenant encerrado sem hard delete");
      }
      load();
    } catch (err) {
      setError((err as Error).message);
      toast.error("Operacao recusada pela Platform API");
    } finally {
      setBusy(null);
    }
  }

  async function startImpersonation() {
    if (!tenant || !actor) return;
    setBusy("impersonation");
    setError(null);
    try {
      const session = await platformApi.startImpersonation({
        tenantId: tenant.id,
        membershipId,
        reason: impersonationReason,
      });
      const user = activatePlatformImpersonation(session, actor);
      loginAs(user);
      impersonate({
        sessionId: session.id,
        empresaId: session.tenant.id,
        empresaNome: session.tenant.name,
        membershipId: session.membership.id,
        expiresAt: session.expiresAt,
        actorName: actor.nome,
        actorEmail: actor.email,
      });
      toast.success("Acesso de suporte iniciado");
      navigate({ to: "/" });
    } catch (err) {
      setError((err as Error).message);
      toast.error("Impersonacao nao iniciada");
    } finally {
      setBusy(null);
    }
  }

  if (!tenant) {
    return (
      <AdminContainer>
        <SectionHeader title="Tenant" subtitle="Carregando dados do plano de controle." />
        {error ? (
          <Alert tone="destructive" title="Falha ao carregar">
            {error}
          </Alert>
        ) : (
          <Card>Carregando...</Card>
        )}
      </AdminContainer>
    );
  }

  const canSuspend =
    tenant.status !== "SUSPENDED" &&
    tenant.status !== "TERMINATED" &&
    reason.trim() &&
    suspendConfirm === "SUSPENDER" &&
    !busy;
  const canReactivate = tenant.status === "SUSPENDED" && !busy;
  const canTerminate =
    tenant.status === "SUSPENDED" &&
    reason.trim() &&
    terminateSlug === tenant.slug &&
    terminationAware &&
    !activeImpersonation &&
    !busy;
  const selectedMembership = tenant.detail.users.find((item) => item.id === membershipId);

  return (
    <AdminContainer>
      <SectionHeader
        title={tenant.name}
        subtitle={`${tenant.slug} - ${tenant.status}`}
        actions={
          <Link
            to="/admin/empresas"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Voltar
          </Link>
        }
      />
      {error && (
        <Alert tone="destructive" title="Operacao recusada">
          {error}
        </Alert>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Metric label="Usuarios ativos" value={tenant.usage.activeUsers} />
        <Metric label="Departamentos" value={tenant.usage.departments} />
        <Metric label="Connections" value={tenant.usage.connections} />
        <Metric label="Storage" value={`${Math.ceil(tenant.usage.storageBytes / 1024)} KB`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold">Dados cadastrais</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Info label="Nome legal" value={tenant.detail.legalName ?? tenant.name} />
              <Info label="Nome exibido" value={tenant.detail.displayName ?? tenant.name} />
              <Info label="Timezone" value={tenant.detail.timezone} />
              <Info label="Locale" value={tenant.detail.locale} />
              <Info label="Billing" value={tenant.detail.billingEmail ?? "Nao informado"} />
              <Info label="Tecnico" value={tenant.detail.technicalEmail ?? "Nao informado"} />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Lifecycle e assinatura</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Info label="Status" value={tenant.status} />
              <Info label="Ativado" value={formatDate(tenant.detail.activatedAt)} />
              <Info label="Suspenso" value={formatDate(tenant.detail.suspendedAt)} />
              <Info label="Encerrado" value={formatDate(tenant.detail.terminatedAt)} />
              <Info label="Plano atual" value={tenant.plan?.name ?? "Sem plano"} />
              <Info label="Assinatura" value={tenant.subscriptionStatus ?? "Sem assinatura"} />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Limites e consumo</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(tenant.usage).map(([key, value]) => (
                <Info key={key} label={key} value={String(value)} />
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Usuarios e departamentos</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <List
                title="Usuarios"
                items={tenant.detail.users.map((item) => `${item.user.name} - ${item.role.name}`)}
              />
              <List
                title="Departamentos"
                items={tenant.detail.departments.map(
                  (item) => `${item.name} - ${item.active ? "ativo" : "inativo"}`,
                )}
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Connections, campanhas, tickets e faturas</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <List
                title="Connections"
                items={tenant.detail.messagingConnections.map(
                  (item) => `${item.name} - ${item.status}`,
                )}
              />
              <List
                title="Faturas"
                items={tenant.detail.invoices.map((item) => `${item.number} - ${item.status}`)}
              />
              <Info label="Campanhas no periodo" value={String(tenant.usage.campaignsThisPeriod)} />
              <Info label="Tickets" value={String(tenant.usage.tickets)} />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Ultimos audit logs</h2>
            <div className="mt-4 space-y-2">
              {tenant.detail.auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm"
                >
                  <span>{log.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(new Date(log.createdAt).getTime())}
                  </span>
                </div>
              ))}
              {!tenant.detail.auditLogs.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhum evento administrativo recente.
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold">Governanca</h2>
            <div className="mt-4 space-y-3">
              <Field label="Motivo obrigatorio">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </Field>
              <Alert tone="warning" title="Impacto da suspensao">
                Login e sessoes operacionais sao bloqueados. Dados sao preservados e webhooks
                continuam observaveis.
              </Alert>
              <Field label="Digite SUSPENDER para suspender">
                <Input value={suspendConfirm} onChange={(e) => setSuspendConfirm(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!canSuspend} onClick={() => mutate("suspend")}>
                  <Ban className="h-4 w-4" /> Suspender
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canReactivate}
                  onClick={() => mutate("reactivate")}
                >
                  <Play className="h-4 w-4" /> Reativar
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Termination</h2>
            <div className="mt-4 space-y-3">
              <Alert tone="destructive" title="Operacao de alto risco">
                Nao faz hard delete, mas bloqueia login e operacoes. Exige tenant suspenso, motivo e
                slug exato.
              </Alert>
              <Field label="Digite o slug do tenant">
                <Input value={terminateSlug} onChange={(e) => setTerminateSlug(e.target.value)} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={terminationAware}
                  onChange={(e) => setTerminationAware(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Confirmo ciencia de que os dados serao preservados e o login sera bloqueado.
                </span>
              </label>
              <Button
                variant="destructive"
                disabled={!canTerminate}
                onClick={() => mutate("terminate")}
              >
                <Trash2 className="h-4 w-4" /> Encerrar tenant
              </Button>
              {activeImpersonation && (
                <p className="text-xs text-destructive">
                  Termination e proibida durante impersonacao.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Impersonacao segura</h2>
            <div className="mt-4 space-y-3">
              <Field label="Membership autorizada">
                <Select value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
                  {sortByOptionLabel(tenant.detail.users, (item) => `${item.user.name} ${item.role.name}`).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.user.name} - {item.role.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Motivo">
                <Textarea
                  value={impersonationReason}
                  onChange={(e) => setImpersonationReason(e.target.value)}
                  rows={3}
                />
              </Field>
              <Button
                disabled={!selectedMembership || !impersonationReason.trim() || Boolean(busy)}
                onClick={startImpersonation}
              >
                <LogIn className="h-4 w-4" /> Acessar tenant
              </Button>
              <div className="rounded-lg border border-border bg-surface-1 p-3 text-xs text-muted-foreground">
                O banner permanente mostra tenant, ator real, expiracao e botao Encerrar acesso em
                todas as rotas operacionais.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AdminContainer>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-3 py-2">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        {title}
        <Badge dot={false}>{items.length}</Badge>
      </div>
      <div className="max-h-64 space-y-2 overflow-auto">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm"
          >
            {item}
          </div>
        ))}
        {!items.length && <p className="text-sm text-muted-foreground">Nenhum registro.</p>}
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? fmtDate(new Date(value).getTime()) : "Nao registrado";
}
