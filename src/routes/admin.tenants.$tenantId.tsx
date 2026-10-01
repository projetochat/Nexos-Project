import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Modal } from "@/components/modal";
import { Alert, Badge, Button, Card, SectionHeader } from "@/components/ui-kit";
import { fmtDate } from "@/lib/format";
import {
  createImpersonationHandoff,
  platformApi,
  type PlatformTenantDetail,
} from "@/lib/trixus-api";

export const Route = createFileRoute("/admin/tenants/$tenantId")({
  head: () => ({ meta: [{ title: "Tenant | Trixus" }] }),
  component: TenantDetailPage,
});

function TenantDetailPage() {
  const { tenantId } = Route.useParams();
  const [tenant, setTenant] = React.useState<PlatformTenantDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [accessOpen, setAccessOpen] = React.useState(false);
  const [accessReason, setAccessReason] = React.useState("");
  const [accessError, setAccessError] = React.useState<string | null>(null);
  const [accessBusy, setAccessBusy] = React.useState(false);

  React.useEffect(() => {
    platformApi
      .tenant(tenantId)
      .then(setTenant)
      .catch((reason) => setError((reason as Error).message));
  }, [tenantId]);

  if (!tenant) {
    return (
      <AdminContainer>
        <SectionHeader title="Visualizar Tenant" subtitle="Consulta em modo somente leitura." />
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

  const details = tenant.detail;
  const subscription = details.subscriptions[0];
  const limits =
    (subscription?.plan as { limits?: Record<string, number> } | undefined)?.limits ?? {};
  const client = (
    tenant as PlatformTenantDetail & {
      client?: {
        name: string;
        responsibleName?: string | null;
        responsibleEmail?: string | null;
      } | null;
    }
  ).client;
  const activeMemberships = details.users.filter(
    (membership) => membership.status === "ACTIVE" && membership.user.status === "ACTIVE",
  );
  const accessMembership =
    activeMemberships.find((membership) => membership.role.key === "tenant_admin") ??
    activeMemberships[0];

  const beginTenantAccess = async () => {
    if (!accessMembership || !accessReason.trim()) return;
    setAccessBusy(true);
    setAccessError(null);
    try {
      const handoff = await createImpersonationHandoff({
        tenantId: tenant.id,
        membershipId: accessMembership.id,
        reason: accessReason.trim(),
      });
      window.location.assign(handoff.url);
    } catch (reason) {
      setAccessError((reason as Error).message);
      setAccessBusy(false);
    }
  };

  return (
    <AdminContainer>
      <SectionHeader
        title="Visualizar Tenant"
        subtitle="Consulta das informações e configurações da tenant."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setAccessOpen(true)}
              disabled={!accessMembership}
              title={!accessMembership ? "Nenhum usuário ativo disponível" : undefined}
            >
              Acessar tenant
            </Button>
            <Link
              to="/admin/tenants"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Voltar
            </Link>
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Status">
          <TenantStatus value={tenant.status} />
        </Metric>
        <Metric label="Plano" value={tenant.plan?.name ?? "Sem plano"} />
        <Metric
          label="Usuários"
          value={`${tenant.usage.activeUsers} / ${tenant.maxUsers ?? limits.users ?? "—"}`}
        />
        <Metric
          label="Instâncias"
          value={`${tenant.usage.connections} / ${tenant.maxConnections ?? limits.instances ?? "—"}`}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold">Identificação</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Cliente" value={client?.name ?? tenant.name} />
            <Info
              label="Responsável"
              value={tenant.responsibleName ?? client?.responsibleName ?? "Não informado"}
            />
            <Info
              label="E-mail"
              value={tenant.responsibleEmail ?? client?.responsibleEmail ?? "Não informado"}
            />
            <Info label="Tenant" value={tenant.name} />
            <Info label="Domínio" value={tenant.slug} />
            <Info label="Data de criação" value={fmtDate(new Date(tenant.createdAt).getTime())} />
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Plano e limites</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Plano" value={tenant.plan?.name ?? "Sem plano"} />
            <Info label="Assinatura" value={tenant.subscriptionStatus ?? "Não informada"} />
            <Info
              label="Limite de usuários"
              value={String(tenant.maxUsers ?? limits.users ?? "—")}
            />
            <Info
              label="Limite de instâncias"
              value={String(tenant.maxConnections ?? limits.instances ?? "—")}
            />
            <Info label="Limite de campanhas" value={String(limits.campaigns ?? "—")} />
            <Info label="Campanhas utilizadas" value={String(tenant.usage.campaignsThisPeriod)} />
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Utilização atual</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Usuários ativos" value={String(tenant.usage.activeUsers)} />
            <Info label="Instâncias configuradas" value={String(tenant.usage.connections)} />
            <Info label="Contatos" value={String(tenant.usage.contacts)} />
            <Info label="Conversas" value={String(tenant.usage.conversations)} />
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Configurações</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Fuso horário" value={details.timezone} />
            <Info label="Idioma" value={details.locale} />
            <Info label="Ativada em" value={formatOptionalDate(details.activatedAt)} />
            <Info label="Suspensa em" value={formatOptionalDate(details.suspendedAt)} />
          </div>
        </Card>
      </div>
      <Modal
        open={accessOpen}
        onClose={() => !accessBusy && setAccessOpen(false)}
        title="Acessar tenant como suporte"
        description={tenant.name}
        dismissible={!accessBusy}
        initialFocus="#tenant-access-reason"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccessOpen(false)}
              disabled={accessBusy}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={beginTenantAccess}
              disabled={accessBusy || !accessMembership || !accessReason.trim()}
            >
              {accessBusy ? "Abrindo…" : "Continuar"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          O acesso é temporário e auditado. Durante a sessão, o Chat exibirá permanentemente o
          tenant, o ator real e o horário de expiração.
        </p>
        <label htmlFor="tenant-access-reason" className="mt-4 block text-sm font-medium">
          Motivo do acesso
        </label>
        <textarea
          id="tenant-access-reason"
          value={accessReason}
          onChange={(event) => setAccessReason(event.target.value)}
          maxLength={500}
          rows={4}
          placeholder="Descreva por que este acesso é necessário"
          className="mt-2 w-full resize-y rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {accessMembership ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Perfil utilizado: {accessMembership.user.name} ({accessMembership.role.name}).
          </p>
        ) : (
          <div className="mt-4">
            <Alert tone="warning" title="Acesso indisponível">
              Este tenant não possui um usuário ativo disponível para o suporte.
            </Alert>
          </div>
        )}
        {accessError && (
          <div className="mt-4">
            <Alert tone="destructive" title="Não foi possível iniciar o acesso">
              {accessError}
            </Alert>
          </div>
        )}
      </Modal>
    </AdminContainer>
  );
}

function Metric({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-2 text-2xl font-semibold">{children ?? value}</div>
    </Card>
  );
}
function Info({ label, value }: { label: string; value: string }) {
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
function formatOptionalDate(value: string | null) {
  return value ? fmtDate(new Date(value).getTime()) : "Não registrada";
}
