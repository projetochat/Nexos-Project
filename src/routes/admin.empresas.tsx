import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
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
} from "@/components/ui-kit";
import { platformApi, type PlatformPlan, type PlatformTenant } from "@/lib/nexos-api";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/admin/empresas")({
  head: () => ({ meta: [{ title: "Tenants - Nexo Admin" }] }),
  component: EmpresasSaaS,
});

const steps = ["Empresa", "Slug", "Regiao", "Admin", "Plano", "Vigencia", "Revisao", "Confirmacao"];

type TenantForm = {
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planId: string;
  trial: string;
};

const initialForm: TenantForm = {
  name: "",
  slug: "",
  timezone: "America/Sao_Paulo",
  locale: "pt-BR",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  planId: "",
  trial: "trial",
};

function EmpresasSaaS() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<PlatformTenant[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<TenantForm>(initialForm);
  const [created, setCreated] = React.useState<PlatformTenant | null>(null);

  const load = React.useCallback(() => {
    Promise.all([platformApi.tenants({ q, pageSize: 50 }), platformApi.plans({ pageSize: 50 })])
      .then(([tenants, planList]) => {
        setRows(tenants.items);
        setPlans(planList.items.filter((plan) => plan.status === "ACTIVE"));
        setError(null);
        setForm((current) => ({
          ...current,
          planId:
            current.planId || planList.items.find((plan) => plan.status === "ACTIVE")?.id || "",
        }));
      })
      .catch((err) => setError((err as Error).message));
  }, [q]);

  React.useEffect(() => {
    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  function update<K extends keyof TenantForm>(key: K, value: TenantForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: key === "slug" ? normalizeSlug(value) : value,
      ...(key === "name" && !current.slug ? { slug: normalizeSlug(value) } : {}),
    }));
  }

  async function submit() {
    setCreating(true);
    setError(null);
    try {
      const result = await platformApi.createTenant({
        name: form.name,
        slug: form.slug,
        timezone: form.timezone,
        locale: form.locale,
        planId: form.planId,
        admin: {
          name: form.adminName,
          email: form.adminEmail,
          password: form.adminPassword,
        },
      });
      setCreated(result);
      setStep(7);
      toast.success("Tenant criado com assinatura e tenant_admin inicial");
      load();
    } catch (err) {
      setError((err as Error).message);
      toast.error("Criacao transacional nao concluida");
    } finally {
      setCreating(false);
    }
  }

  const selectedPlan = plans.find((plan) => plan.id === form.planId);
  const canContinue = stepIsValid(step, form);

  return (
    <AdminContainer>
      <SectionHeader
        title="Tenants"
        subtitle="Gestao real de organizacoes, planos, status e limites via Nexos Platform API."
        actions={
          <Button onClick={() => setStep(0)}>
            <Plus className="h-4 w-4" /> Novo tenant
          </Button>
        }
      />

      {error && (
        <Alert tone="destructive" title="Operacao nao concluida">
          {error}
        </Alert>
      )}

      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar tenant..."
                className="pl-9"
              />
            </div>
            <Button variant="secondary" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  <th className="pb-2">Tenant</th>
                  <th className="pb-2">Plano</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Usuarios</th>
                  <th className="pb-2">Connections</th>
                  <th className="pb-2">Criado</th>
                  <th className="pb-2 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tenant) => (
                  <tr key={tenant.id} className="border-b border-border/60 hover:bg-surface-1">
                    <td className="py-3">
                      <div className="font-medium">{tenant.name}</div>
                      <div className="text-xs text-muted-foreground">{tenant.slug}</div>
                    </td>
                    <td className="py-3">{tenant.plan?.name ?? "Sem plano"}</td>
                    <td className="py-3">
                      <TenantStatus status={tenant.status} />
                    </td>
                    <td className="py-3 font-mono text-xs">{tenant.activeUsers}</td>
                    <td className="py-3 font-mono text-xs">{tenant.connections}</td>
                    <td className="py-3 text-xs text-muted-foreground">
                      {fmtDate(new Date(tenant.createdAt).getTime())}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        to="/admin/empresas/$tenantId"
                        params={{ tenantId: tenant.id }}
                        className="inline-flex items-center justify-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2"
                      >
                        Abrir detalhe
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum tenant encontrado.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Criacao de tenant</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Etapa {step + 1} de {steps.length}: {steps[step]}
              </p>
            </div>
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mb-4 grid grid-cols-8 gap-1">
            {steps.map((label, index) => (
              <div
                key={label}
                className={`h-1.5 rounded-full ${index <= step ? "bg-primary" : "bg-surface-3"}`}
              />
            ))}
          </div>

          {step === 0 && (
            <Field label="Nome da empresa">
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Tenant Sprint 13"
              />
            </Field>
          )}
          {step === 1 && (
            <Field label="Slug imutavel">
              <Input
                value={form.slug}
                onChange={(e) => update("slug", e.target.value)}
                placeholder="tenant-sprint-13"
              />
            </Field>
          )}
          {step === 2 && (
            <div className="grid gap-3">
              <Field label="Timezone">
                <Input value={form.timezone} onChange={(e) => update("timezone", e.target.value)} />
              </Field>
              <Field label="Locale">
                <Input value={form.locale} onChange={(e) => update("locale", e.target.value)} />
              </Field>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-3">
              <Field label="Nome do tenant_admin">
                <Input
                  value={form.adminName}
                  onChange={(e) => update("adminName", e.target.value)}
                />
              </Field>
              <Field label="E-mail do tenant_admin">
                <Input
                  value={form.adminEmail}
                  onChange={(e) => update("adminEmail", e.target.value)}
                />
              </Field>
              <Field label="Senha inicial">
                <Input
                  type="password"
                  value={form.adminPassword}
                  onChange={(e) => update("adminPassword", e.target.value)}
                />
              </Field>
            </div>
          )}
          {step === 4 && (
            <Field label="Plano inicial">
              <Select value={form.planId} onChange={(e) => update("planId", e.target.value)}>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {step === 5 && (
            <Field label="Vigencia">
              <Select value={form.trial} onChange={(e) => update("trial", e.target.value)}>
                <option value="trial">Trial conforme plano</option>
                <option value="active">Ativar administrativamente apos criacao</option>
              </Select>
            </Field>
          )}
          {step === 6 && (
            <div className="space-y-2 text-sm">
              <Review label="Tenant" value={form.name} />
              <Review label="Slug" value={form.slug} />
              <Review label="Regiao" value={`${form.timezone} / ${form.locale}`} />
              <Review label="Admin" value={`${form.adminName} - ${form.adminEmail}`} />
              <Review label="Plano" value={selectedPlan?.name ?? "Nao selecionado"} />
            </div>
          )}
          {step === 7 && created && (
            <Alert tone="success" title="Tenant criado">
              Subscription criada, tenant_admin inicial provisionado, status {created.status}, plano{" "}
              {created.plan?.name ?? "sem plano"}.
              <div className="mt-3">
                <Link
                  to="/admin/empresas/$tenantId"
                  params={{ tenantId: created.id }}
                  className="inline-flex items-center rounded-md border border-success/40 px-2 py-1 text-xs font-medium"
                >
                  Abrir detalhe
                </Link>
              </div>
            </Alert>
          )}

          <div className="mt-5 flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={step === 0 || creating}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
            {step < 6 ? (
              <Button
                disabled={!canContinue || creating}
                onClick={() => setStep((value) => Math.min(6, value + 1))}
              >
                Avancar <ChevronRight className="h-4 w-4" />
              </Button>
            ) : step === 6 ? (
              <Button disabled={!canContinue || creating} onClick={submit}>
                <CheckCircle2 className="h-4 w-4" /> Confirmar criacao
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(initialForm);
                  setCreated(null);
                  setStep(0);
                }}
              >
                Nova criacao
              </Button>
            )}
          </div>
        </Card>
      </div>
    </AdminContainer>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-1 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function TenantStatus({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "success"
      : status === "TRIAL"
        ? "info"
        : status === "SUSPENDED"
          ? "warning"
          : status === "TERMINATED"
            ? "destructive"
            : "default";
  return <Badge tone={tone}>{status}</Badge>;
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function stepIsValid(step: number, form: TenantForm) {
  if (step === 0) return form.name.trim().length >= 2;
  if (step === 1) return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(form.slug);
  if (step === 2) return Boolean(form.timezone.trim() && form.locale.trim());
  if (step === 3)
    return Boolean(
      form.adminName.trim() && form.adminEmail.includes("@") && form.adminPassword.length >= 6,
    );
  if (step === 4) return Boolean(form.planId);
  return true;
}
