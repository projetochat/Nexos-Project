import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Alert, Badge, Card, SectionHeader } from "@/components/ui-kit";
import { fmtDate } from "@/lib/format";
import { platformApi, type PlatformTenantDetail } from "@/lib/trixus-api";

export const Route = createFileRoute("/admin/tenants/$tenantId")({
  head: () => ({ meta: [{ title: "Tenant | Trixus" }] }),
  component: TenantDetailPage,
});

function TenantDetailPage() {
  const { tenantId } = Route.useParams();
  const [tenant, setTenant] = React.useState<PlatformTenantDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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

  return (
    <AdminContainer>
      <SectionHeader
        title="Visualizar Tenant"
        subtitle="Consulta das informações e configurações da tenant."
        actions={
          <Link
            to="/admin/tenants"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Voltar
          </Link>
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
