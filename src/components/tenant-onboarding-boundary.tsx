import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Headset,
  Loader2,
  LogOut,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Tag,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, Field, Input, LogoMark, Select } from "@/components/ui-kit";
import { DepartmentIcon } from "@/components/department-icon";
import { ErrorState, Spinner } from "@/components/feedback";
import { Modal } from "@/components/modal";
import { connectionRemoveErrorMessage } from "@/lib/connection-remove-errors";
import {
  TrixusApiError,
  connectionsApi,
  crmApi,
  onboardingApi,
  organizationApi,
  quickReplyApi,
  type ApiMessagingConnection,
  type ApiDepartment,
  type ApiQuickReply,
  type ApiRole,
  type ApiTag,
  type ApiTenantOnboardingStatus,
  type ApiUserMembership,
} from "@/lib/trixus-api";
import { signOut, useSession } from "@/lib/session";
import {
  ONBOARDING_INSTANCE_IDEMPOTENCY_KEY,
  canAdvanceOnboardingStep,
  isOnboardingInstanceNotFound,
} from "@/lib/onboarding";
import type { DepartamentoFormData } from "@/routes/departamentos";
import type { PerfilFormData } from "@/routes/perfis";

const OfficialDepartmentForm = React.lazy(() =>
  import("@/routes/departamentos").then((module) => ({ default: module.DepartamentoForm })),
);
const OfficialProfileForm = React.lazy(() =>
  import("@/routes/perfis").then((module) => ({ default: module.OnboardingPerfilForm })),
);
const OfficialQuickReplyEditor = React.lazy(() =>
  import("@/routes/mensagens-rapidas").then((module) => ({ default: module.QuickReplyEditor })),
);
const OfficialTagForm = React.lazy(() =>
  import("@/routes/etiquetas").then((module) => ({ default: module.EtiquetaForm })),
);

const ONBOARDING_QUERY_KEY = ["trixus", "onboarding"] as const;
const CONNECTIONS_QUERY_KEY = ["trixus", "messaging-connections"] as const;
const DEPARTMENTS_QUERY_KEY = ["trixus", "departments"] as const;
const ROLES_QUERY_KEY = ["trixus", "roles"] as const;
const USERS_QUERY_KEY = ["trixus", "users"] as const;
const QUICK_REPLIES_QUERY_KEY = ["trixus", "quick-replies", "catalog"] as const;
const TAGS_QUERY_KEY = ["trixus", "tags"] as const;

const STEPS = [
  { label: "Boas-vindas", icon: Rocket },
  { label: "Instância", icon: Wifi },
  { label: "Departamentos", icon: Network },
  { label: "Perfis e Acessos", icon: ShieldCheck },
  { label: "Atendentes", icon: Headset },
  { label: "Mensagens Rápidas", icon: Zap },
  { label: "Etiquetas", icon: Tag },
  { label: "Conclusão", icon: CheckCircle2 },
] as const;

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function TenantOnboardingBoundary({ children }: { children: React.ReactNode }) {
  const user = useSession((state) => state.user);
  const statusQuery = useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: onboardingApi.status,
    enabled: !!user && user.role !== "super_admin",
    staleTime: 0,
    retry: false,
  });

  if (!user || user.role === "super_admin") return children;
  if (statusQuery.isPending) {
    return (
      <OnboardingFrame>
        <div className="flex min-h-[28rem] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Spinner size={26} />
          <p className="text-sm">Verificando a configuração inicial…</p>
        </div>
      </OnboardingFrame>
    );
  }
  if (statusQuery.isError) {
    return (
      <OnboardingFrame>
        <ErrorState
          title="Não foi possível verificar a configuração inicial"
          description="A plataforma continuará protegida até que essa verificação seja concluída."
          onRetry={() => void statusQuery.refetch()}
        />
      </OnboardingFrame>
    );
  }

  const state = statusQuery.data;
  if (!state.required || state.status === "not_required" || state.status === "completed") {
    return children;
  }
  if (!state.canManage || user.role !== "admin")
    return <PendingForCommonUser message={state.message} />;
  return <TenantOnboardingWizard initial={state} />;
}

function OnboardingFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-h-dvh bg-gradient-subtle p-2 text-foreground sm:p-4 lg:p-6">
      <div className="mx-auto min-h-[calc(100dvh-1rem)] max-w-[96rem] overflow-hidden rounded-2xl border border-border bg-background shadow-elevated sm:min-h-[calc(100dvh-2rem)] lg:min-h-[calc(100dvh-3rem)]">
        {children}
      </div>
    </div>
  );
}

function PendingForCommonUser({ message }: { message: string | null }) {
  const logout = useSession((state) => state.logout);
  const leave = async () => {
    await signOut();
    logout();
    window.location.assign("/login");
  };
  return (
    <OnboardingFrame>
      <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center p-5">
        <Card className="max-w-xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-info/15 text-info">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">Configuração inicial em andamento</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {message ||
              "A configuração inicial da organização ainda não foi concluída pelo administrador."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tente novamente depois que o administrador finalizar as etapas obrigatórias.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => void leave()}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </Card>
      </div>
    </OnboardingFrame>
  );
}

function TenantOnboardingWizard({ initial }: { initial: ApiTenantOnboardingStatus }) {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState(initial);
  const [step, setStep] = React.useState(() =>
    Math.max(1, Math.min(8, initial.progress.currentStep)),
  );
  const [saving, setSaving] = React.useState(false);

  const refreshStatus = React.useCallback(async () => {
    const refreshed = await queryClient.fetchQuery({
      queryKey: ONBOARDING_QUERY_KEY,
      queryFn: onboardingApi.status,
      staleTime: 0,
    });
    setState(refreshed);
    setStep((current) => Math.max(current, refreshed.progress.currentStep));
    return refreshed;
  }, [queryClient]);

  const persistStep = async (nextStep: number, completedStep: number) => {
    if (state.version == null || saving) return;
    setSaving(true);
    try {
      const updated = await onboardingApi.progress({
        currentStep: nextStep,
        maxCompletedStep: Math.max(state.progress.maxCompletedStep, completedStep),
        version: state.version,
      });
      setState(updated);
      setStep(nextStep);
      queryClient.setQueryData(ONBOARDING_QUERY_KEY, updated);
    } catch (error) {
      if (error instanceof TrixusApiError && error.code === "ONBOARDING_VERSION_CONFLICT") {
        await refreshStatus();
        toast.info("O progresso foi atualizado em outra sessão. Exibimos a versão mais recente.");
      } else {
        toast.error((error as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => setStep((current) => Math.max(1, current - 1));
  const complete = async () => {
    if (state.version == null || saving) return;
    setSaving(true);
    try {
      const updated = await onboardingApi.complete(state.version);
      setState(updated);
      queryClient.setQueryData(ONBOARDING_QUERY_KEY, updated);
      await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    } catch (error) {
      if (error instanceof TrixusApiError && error.code === "ONBOARDING_VERSION_CONFLICT") {
        await refreshStatus();
        toast.info("O progresso mudou em outra sessão. Revise a situação atual.");
      } else {
        toast.error((error as Error).message);
        await refreshStatus().catch(() => undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  if (state.status === "completed") return null;

  return (
    <OnboardingFrame>
      <div className="grid min-h-[calc(100dvh-1rem)] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-border bg-surface-1 p-4 lg:border-b-0 lg:border-r lg:p-6">
          <div className="mb-5 flex items-center gap-3 lg:mb-8">
            <LogoMark size={48} />
            <div>
              <p className="text-lg font-bold tracking-[0.18em]">TRIXUS</p>
              <p className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
                Soluções que conectam
              </p>
            </div>
          </div>
          <ol className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-1 lg:gap-1.5">
            {STEPS.map((item, index) => {
              const number = index + 1;
              const complete = number <= state.progress.maxCompletedStep;
              const active = number === step;
              const Icon = item.icon;
              return (
                <li
                  key={item.label}
                  aria-current={active ? "step" : undefined}
                  className={`flex min-w-0 items-center gap-3 rounded-xl p-2 transition lg:px-3 lg:py-2.5 ${
                    active
                      ? "bg-primary/10 text-primary"
                      : complete
                        ? "text-success"
                        : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : complete
                          ? "border-success bg-success text-success-foreground"
                          : "border-border bg-surface-2"
                    }`}
                  >
                    {complete && !active ? <Check className="h-4 w-4" /> : number}
                  </span>
                  <Icon className="hidden h-4 w-4 shrink-0 xl:block" />
                  <span className="hidden truncate text-sm font-medium lg:block">{item.label}</span>
                </li>
              );
            })}
          </ol>
        </aside>
        <main className="flex min-w-0 flex-col p-4 sm:p-6 lg:p-10">
          <div className="mb-6">
            <p className="text-sm font-medium text-muted-foreground">Passo {step} de 8</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{STEPS[step - 1].label}</h1>
          </div>
          <div className="min-h-0 flex-1">
            {step === 1 && <WelcomeStep />}
            {step === 2 && <InstanceStep onServerChange={refreshStatus} />}
            {step === 3 && <DepartmentsStep onServerChange={refreshStatus} />}
            {step === 4 && <RolesStep onServerChange={refreshStatus} />}
            {step === 5 && <UsersStep onServerChange={refreshStatus} />}
            {step === 6 && <QuickRepliesStep />}
            {step === 7 && <TagsStep />}
            {step === 8 && <ConclusionStep checklist={state.checklist} />}
          </div>
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
            <Button variant="outline" onClick={goBack} disabled={step === 1 || saving}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            {step < 8 ? (
              <Button
                size="lg"
                disabled={saving || !canAdvanceOnboardingStep(step, state)}
                onClick={() => void persistStep(step + 1, step)}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {step === 1 ? "Vamos dar início" : "Avançar"} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="lg" disabled={saving} onClick={() => void complete()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Acessar a plataforma <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </main>
      </div>
    </OnboardingFrame>
  );
}

function WelcomeStep() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(20rem,1.2fr)]">
      <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/10 text-primary sm:h-64 sm:w-64">
        <Rocket className="h-28 w-28" strokeWidth={1.25} />
      </div>
      <div>
        <h2 className="text-2xl font-semibold">Bem-vindo ao Trixus Chat!</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Este assistente vai guiar a configuração inicial do seu ambiente de atendimento de forma
          rápida e organizada. Em poucos passos, você estará pronto para atender seus clientes.
        </p>
        <Card className="mt-6 bg-info/5">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <CheckCircle2 className="h-5 w-5 text-info" /> Este processo levará apenas alguns
              minutos.
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="h-5 w-5 text-info" /> Você poderá ajustar essas configurações
              depois.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function InstanceStep({ onServerChange }: { onServerChange: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: CONNECTIONS_QUERY_KEY, queryFn: connectionsApi.list });
  const visible = (connections.data ?? []).filter((item) => item.status !== "removed");
  const [name, setName] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [orphanedConnectionId, setOrphanedConnectionId] = React.useState<string | null>(null);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];

  React.useEffect(() => {
    if (!selectedId && visible[0]) setSelectedId(visible[0].id);
  }, [selectedId, visible]);

  React.useEffect(() => {
    if (!selected || selected.status === "connected" || orphanedConnectionId === selected.id)
      return;
    let active = true;
    const poll = async () => {
      try {
        const updated = await connectionsApi.status(selected.id);
        if (!active) return;
        queryClient.setQueryData<ApiMessagingConnection[]>(CONNECTIONS_QUERY_KEY, (current = []) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        if (updated.provider?.reason === "INSTANCE_NOT_FOUND") {
          setOrphanedConnectionId(updated.id);
          setConnectionError(
            "A instância não existe mais no provedor. Remova este vínculo órfão para recriá-la com segurança.",
          );
          return;
        }
        if (updated.status === "connected") {
          setConnectionError(null);
          setQr(null);
          await onServerChange();
        }
      } catch (error) {
        if (isOnboardingInstanceNotFound(error)) {
          setOrphanedConnectionId(selected.id);
          setConnectionError(
            "A instância não foi encontrada no provedor. Remova este vínculo órfão antes de tentar novamente.",
          );
          return;
        }
        setConnectionError(
          "Não foi possível verificar a conexão. Confira sua internet e tente novamente.",
        );
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [onServerChange, orphanedConnectionId, queryClient, selected]);

  const create = useMutation({
    mutationFn: () =>
      connectionsApi.createEvolution({
        name: name.trim(),
        serviceEnabled: true,
        idempotencyKey: ONBOARDING_INSTANCE_IDEMPOTENCY_KEY,
      }),
    onSuccess: async (connection) => {
      setConnectionError(null);
      setOrphanedConnectionId(null);
      setSelectedId(connection.id);
      setQr(connection.qrCodeBase64 ?? null);
      await connections.refetch();
      await onServerChange();
    },
    onError: (error) => {
      setConnectionError((error as Error).message);
      toast.error((error as Error).message);
    },
  });
  const requestQr = useMutation({
    mutationFn: (connection: ApiMessagingConnection) => connectionsApi.qr(connection.id),
    onSuccess: async (result) => {
      setConnectionError(null);
      setQr(result.qrCodeBase64);
      await connections.refetch();
      await onServerChange();
    },
    onError: (error) => {
      if (selected && isOnboardingInstanceNotFound(error)) {
        setOrphanedConnectionId(selected.id);
        setConnectionError(
          "A instância não foi encontrada no provedor. Remova este vínculo órfão para recriá-la.",
        );
      } else {
        setConnectionError((error as Error).message);
      }
      toast.error((error as Error).message);
    },
  });
  const removeOrphan = useMutation({
    mutationFn: (connection: ApiMessagingConnection) =>
      connectionsApi.remove(connection.id, { removeConversationHistory: false }),
    onSuccess: async (_result, connection) => {
      setName(connection.name);
      setQr(null);
      setSelectedId(null);
      setOrphanedConnectionId(null);
      setConnectionError(null);
      await connections.refetch();
      await onServerChange();
      toast.success("Vínculo órfão removido. O histórico foi preservado.");
    },
    onError: (error) => toast.error(connectionRemoveErrorMessage(error)),
  });

  const confirmRemoveOrphan = () => {
    if (!selected || selected.id !== orphanedConnectionId || removeOrphan.isPending) return;
    if (
      !window.confirm(
        `Remover a instância órfã “${selected.name}” para recriá-la? O histórico de conversas será preservado.`,
      )
    )
      return;
    removeOrphan.mutate(selected);
  };

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground">
        Conecte sua conta do WhatsApp Business para começar a atender conversas.
      </p>
      {connectionError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1">{connectionError}</p>
          {selected?.id === orphanedConnectionId ? (
            <Button
              variant="outline"
              size="sm"
              disabled={removeOrphan.isPending}
              onClick={confirmRemoveOrphan}
            >
              {removeOrphan.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remover e recriar
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!selected || requestQr.isPending}
              onClick={() => selected && requestQr.mutate(selected)}
            >
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </Button>
          )}
        </div>
      )}
      {visible.length === 0 ? (
        <Card className="max-w-2xl">
          <Field
            label="Nome da instância *"
            hint="Este será o nome que identificará esta instância no Trixus."
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: WhatsApp Comercial"
            />
          </Field>
          <Button
            className="mt-4"
            disabled={name.trim().length < 2 || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4" />
            )}
            Gerar QR Code
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <Field label="Instância">
              <Select
                value={selected?.id ?? ""}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setQr(null);
                  setConnectionError(null);
                  setOrphanedConnectionId(null);
                }}
              >
                {visible.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            {selected && (
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  tone={
                    selected.status === "connected"
                      ? "success"
                      : selected.status === "error"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {selected.status === "connected"
                    ? "Conectada"
                    : selected.status === "connecting"
                      ? "Conectando"
                      : "Desconectada"}
                </Badge>
              </div>
            )}
            {selected?.status !== "connected" && selected?.id !== orphanedConnectionId && (
              <Button
                className="mt-5"
                disabled={!selected || requestQr.isPending}
                onClick={() => selected && requestQr.mutate(selected)}
              >
                <RefreshCw className={`h-4 w-4 ${requestQr.isPending ? "animate-spin" : ""}`} />{" "}
                {qr ? "Gerar novo QR Code" : "Gerar QR Code"}
              </Button>
            )}
          </Card>
          <Card className="flex min-h-72 items-center justify-center text-center">
            {selected?.status === "connected" ? (
              <div>
                <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
                <h3 className="mt-4 text-xl font-semibold">Instância conectada com sucesso!</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selected.name}
                  {selected.ownerPhoneMasked ? ` · ${selected.ownerPhoneMasked}` : ""}
                </p>
              </div>
            ) : qr ? (
              <div>
                <img
                  src={qr}
                  alt={`QR Code - ${selected?.name ?? "instância"}`}
                  className="mx-auto max-h-64 max-w-full rounded-lg"
                />
                <p className="mt-3 text-sm text-muted-foreground">
                  Leia o QR Code e aguarde a confirmação.
                </p>
              </div>
            ) : requestQr.isPending ? (
              <div>
                <Spinner size={28} />
                <p className="mt-3 text-sm">Aguarde, QR Code está sendo gerado!</p>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <Wifi className="mx-auto h-12 w-12" />
                <p className="mt-3 text-sm">Gere um QR Code para conectar.</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function DepartmentsStep({ onServerChange }: { onServerChange: () => Promise<unknown> }) {
  const departments = useQuery({
    queryKey: DEPARTMENTS_QUERY_KEY,
    queryFn: organizationApi.listDepartments,
  });
  const connections = useQuery({
    queryKey: ["trixus", "department-connection-options"],
    queryFn: organizationApi.departmentConnectionOptions,
  });
  const [connectionId, setConnectionId] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiDepartment | null>(null);
  React.useEffect(() => {
    if (!connectionId && connections.data?.[0]) setConnectionId(connections.data[0].id);
  }, [connectionId, connections.data]);
  const create = useMutation({
    mutationFn: (departmentName: string) =>
      organizationApi.createDepartment({
        name: departmentName,
        color: "#3B82F6",
        icon: "department",
        connectionIds: connectionId ? [connectionId] : [],
      }),
    onSuccess: async () => {
      await departments.refetch();
      await onServerChange();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const remove = useMutation({
    mutationFn: organizationApi.deleteDepartment,
    onSuccess: async () => {
      await departments.refetch();
      await onServerChange();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveOfficial = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: DepartamentoFormData }) =>
      id
        ? organizationApi.updateDepartment(id, data)
        : organizationApi.createDepartment({
            name: data.name ?? "",
            description: data.description,
            color: data.color,
            icon: data.icon,
            connectionIds: data.connectionIds,
          }),
    onSuccess: async () => {
      setCreating(false);
      setEditing(null);
      await departments.refetch();
      await onServerChange();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const addSuggestion = (suggestion: string) => {
    if ((departments.data ?? []).some((item) => normalized(item.name) === normalized(suggestion)))
      return toast.info(`${suggestion} já está cadastrado.`);
    create.mutate(suggestion);
  };
  return (
    <CatalogStep
      title="Organize o atendimento por departamentos."
      loading={departments.isPending}
      form={
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Defina nome, cor, ícone e instâncias vinculadas no formulário oficial.
          </p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Novo departamento
          </Button>
        </div>
      }
      suggestions={
        <SuggestionButtons
          values={["Comercial", "Suporte", "Financeiro", "Pós-vendas"]}
          onPick={addSuggestion}
          busy={create.isPending}
        />
      }
      items={(departments.data ?? []).map((item) => (
        <CatalogRow
          key={item.id}
          title={item.name}
          subtitle={item.description ?? (item.active ? "Ativo" : "Inativo")}
          icon={
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: `${item.color}24`, color: item.color }}
            >
              <DepartmentIcon icon={item.icon} />
            </span>
          }
          onEdit={() => setEditing(item)}
          onDelete={() => remove.mutate(item.id)}
        />
      ))}
      overlay={
        <React.Suspense fallback={null}>
          <OfficialDepartmentForm
            open={creating}
            onClose={() => setCreating(false)}
            departments={departments.data ?? []}
            connections={connections.data ?? []}
            onSubmit={(data) => saveOfficial.mutate({ data })}
          />
          <OfficialDepartmentForm
            open={!!editing}
            onClose={() => setEditing(null)}
            initial={editing ?? undefined}
            departments={departments.data ?? []}
            connections={connections.data ?? []}
            onSubmit={(data) => editing && saveOfficial.mutate({ id: editing.id, data })}
          />
        </React.Suspense>
      }
    />
  );
}

function RolesStep({ onServerChange }: { onServerChange: () => Promise<unknown> }) {
  const roles = useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: organizationApi.listRoles });
  const scopeOptions = useQuery({
    queryKey: ["trixus", "role-scope-options"],
    queryFn: organizationApi.roleScopeOptions,
  });
  const grantablePermissionIds = useSession((state) => state.user?.permissions ?? []);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiRole | null>(null);
  const create = useMutation({
    mutationFn: (roleName: string) =>
      organizationApi.createRole({
        name: roleName,
        permissionIds:
          roleName === "Supervisor"
            ? [
                "conversations.read",
                "messages.send",
                "contacts.read",
                "chat.tags.read",
                "chat.quick_replies.read",
              ]
            : ["conversations.read", "messages.send", "contacts.read", "chat.quick_replies.read"],
      }),
    onSuccess: async () => {
      await roles.refetch();
      await onServerChange();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const remove = useMutation({
    mutationFn: organizationApi.deleteRole,
    onSuccess: async () => {
      await roles.refetch();
      await onServerChange();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveOfficial = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: PerfilFormData }) => {
      const metadata = {
        departmentIds: data.departmentIds,
        connectionIds: data.connectionIds,
        chatScopes: data.chatScopes,
        workSchedule: data.workSchedule,
        color: data.color,
        language: data.language,
        timezone: data.timezone,
      };
      return id
        ? organizationApi.updateRole(id, {
            name: data.name,
            description: data.description,
            permissionIds: data.permissionIds,
            metadata: {
              ...(editing?.metadata &&
              typeof editing.metadata === "object" &&
              !Array.isArray(editing.metadata)
                ? editing.metadata
                : {}),
              ...metadata,
            },
          })
        : organizationApi.createRole({
            name: data.name,
            description: data.description,
            permissionIds: data.permissionIds,
            metadata,
          });
    },
    onSuccess: async () => {
      setCreating(false);
      setEditing(null);
      await roles.refetch();
      await onServerChange();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const addSuggestion = (suggestion: string) => {
    if ((roles.data ?? []).some((item) => normalized(item.name) === normalized(suggestion)))
      return toast.info(`${suggestion} já existe.`);
    create.mutate(suggestion);
  };
  return (
    <CatalogStep
      title="Revise os perfis oficiais, escopos e permissões da tenant."
      loading={roles.isPending}
      notice="O Perfil Administrador é protegido e conserva o catálogo completo aprovado na D-009."
      form={
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Configure escopos, permissões e jornada no mesmo formulário do cadastro oficial.
          </p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Novo perfil
          </Button>
        </div>
      }
      suggestions={
        <SuggestionButtons
          values={["Atendente", "Supervisor"]}
          onPick={addSuggestion}
          busy={create.isPending}
        />
      }
      items={(roles.data ?? []).map((item) => {
        const admin = item.key === "tenant_admin" || normalized(item.name) === "administrador";
        return (
          <CatalogRow
            key={item.id}
            title={item.name}
            subtitle={
              admin
                ? "Perfil padrão protegido · catálogo completo"
                : `${item.permissionIds.length} permissões`
            }
            icon={<ShieldCheck className={admin ? "text-success" : "text-primary"} />}
            onEdit={admin ? undefined : () => setEditing(item)}
            onDelete={admin ? undefined : () => remove.mutate(item.id)}
          />
        );
      })}
      overlay={
        <React.Suspense fallback={null}>
          <OfficialProfileForm
            open={creating}
            onClose={() => setCreating(false)}
            roles={roles.data ?? []}
            connections={scopeOptions.data?.connections ?? []}
            grantablePermissionIds={grantablePermissionIds}
            onSubmit={(data) => saveOfficial.mutate({ data })}
          />
          <OfficialProfileForm
            open={!!editing}
            onClose={() => setEditing(null)}
            initial={editing ?? undefined}
            roles={roles.data ?? []}
            connections={scopeOptions.data?.connections ?? []}
            grantablePermissionIds={grantablePermissionIds}
            onSubmit={(data) => editing && saveOfficial.mutate({ id: editing.id, data })}
          />
        </React.Suspense>
      }
    />
  );
}

function UsersStep({ onServerChange }: { onServerChange: () => Promise<unknown> }) {
  const users = useQuery({ queryKey: USERS_QUERY_KEY, queryFn: organizationApi.listUsers });
  const roles = useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: organizationApi.listRoles });
  const assignable = (roles.data ?? []).filter((role) => role.key !== "tenant_admin");
  const [form, setForm] = React.useState({ name: "", email: "", password: "", roleId: "" });
  const [editing, setEditing] = React.useState<ApiUserMembership | null>(null);
  React.useEffect(() => {
    if (!form.roleId && assignable[0])
      setForm((current) => ({ ...current, roleId: assignable[0].id }));
  }, [assignable, form.roleId]);
  const create = useMutation({
    mutationFn: () =>
      organizationApi.createUser({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        roleId: form.roleId,
      }),
    onSuccess: async () => {
      setForm((current) => ({ name: "", email: "", password: "", roleId: current.roleId }));
      await users.refetch();
      await onServerChange();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const toggle = useMutation({
    mutationFn: (item: ApiUserMembership) =>
      item.status === "ACTIVE"
        ? organizationApi.deactivateUser(item.id)
        : organizationApi.activateUser(item.id),
    onSuccess: async () => {
      await users.refetch();
      await onServerChange();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const update = useMutation({
    mutationFn: (data: { name: string; detail: string }) => {
      if (!editing) throw new Error("Atendente não selecionado.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.detail))
        throw new Error("Informe um e-mail válido.");
      return organizationApi.updateUser(editing.id, {
        name: data.name,
        email: data.detail.toLocaleLowerCase("en-US"),
      });
    },
    onSuccess: async () => {
      await users.refetch();
      await onServerChange();
    },
  });
  return (
    <CatalogStep
      title="O administrador ativo e corretamente vinculado já aparece nesta lista."
      loading={users.isPending}
      form={
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Nome *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="E-mail *">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Senha *">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Perfil *">
            <Select
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            >
              {assignable.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            className="self-end"
            disabled={
              form.name.trim().length < 3 ||
              !form.email.includes("@") ||
              form.password.length < 6 ||
              !form.roleId ||
              create.isPending
            }
            onClick={() => create.mutate()}
          >
            <Plus className="h-4 w-4" /> Novo atendente
          </Button>
        </div>
      }
      items={(users.data ?? []).map((item) => {
        const admin = item.role.key === "tenant_admin";
        const active = item.status === "ACTIVE" && item.user.status === "ACTIVE";
        return (
          <CatalogRow
            key={item.id}
            title={item.presentationName || item.user.presentationName || item.user.name}
            subtitle={`${item.role.name} · ${active ? "Ativo" : "Inativo"}`}
            icon={<Headset className={active ? "text-success" : "text-muted-foreground"} />}
            onEdit={admin ? undefined : () => setEditing(item)}
            action={
              admin ? undefined : (
                <Button variant="outline" size="sm" onClick={() => toggle.mutate(item)}>
                  {active ? "Desativar" : "Ativar"}
                </Button>
              )
            }
          />
        );
      })}
      overlay={
        <CatalogEditDialog
          open={!!editing}
          title="Editar Atendente"
          initialName={
            editing?.presentationName || editing?.user.presentationName || editing?.user.name || ""
          }
          initialDetail={editing?.user.email}
          detailLabel="E-mail"
          detailRequired
          onClose={() => setEditing(null)}
          onSave={(data) => update.mutateAsync(data).then(() => undefined)}
        />
      }
    />
  );
}

function QuickRepliesStep() {
  const replies = useQuery({
    queryKey: QUICK_REPLIES_QUERY_KEY,
    queryFn: () => quickReplyApi.list({ scope: "catalog" }),
  });
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiQuickReply | null>(null);
  const create = useMutation({
    mutationFn: (value: { title: string; shortcut: string; content: string }) =>
      quickReplyApi.create(value),
    onSuccess: async () => {
      await replies.refetch();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const remove = useMutation({
    mutationFn: quickReplyApi.archive,
    onSuccess: async () => {
      await replies.refetch();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const suggestions = [
    {
      title: "Saudação Inicial",
      shortcut: "oi",
      content: "Olá! Seja bem-vindo(a). Como posso ajudar?",
    },
    { title: "Agradecimento", shortcut: "obrigado", content: "Obrigado pelo seu contato!" },
    {
      title: "Encerramento",
      shortcut: "tchau",
      content: "Se precisar de mais alguma coisa, é só chamar.",
    },
  ];
  const addSuggestion = (shortcut: string) => {
    const suggestion = suggestions.find((item) => item.shortcut === shortcut)!;
    if ((replies.data ?? []).some((item) => normalized(item.shortcut) === shortcut))
      return toast.info(`/${shortcut} já existe.`);
    create.mutate(suggestion);
  };
  return (
    <CatalogStep
      title="Revise as mensagens rápidas. Esta etapa não exige quantidade mínima."
      loading={replies.isPending}
      form={
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Use sequências, anexos, variáveis e encerramento no editor oficial.
          </p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nova mensagem
          </Button>
        </div>
      }
      suggestions={
        <SuggestionButtons
          values={suggestions.map((item) => `/${item.shortcut}`)}
          onPick={(value) => addSuggestion(value.slice(1))}
          busy={create.isPending}
        />
      }
      items={(replies.data ?? []).map((item) => (
        <CatalogRow
          key={item.id}
          title={item.title}
          subtitle={`/${item.shortcut} · ${item.content}`}
          icon={<Zap className="text-primary" />}
          onEdit={() => setEditing(item)}
          onDelete={() => remove.mutate(item.id)}
        />
      ))}
      overlay={
        <React.Suspense fallback={null}>
          <OfficialQuickReplyEditor
            open={creating}
            onClose={() => setCreating(false)}
            initial={null}
            existingReplies={replies.data ?? []}
            onSaved={() => {
              setCreating(false);
              void replies.refetch();
            }}
          />
          <OfficialQuickReplyEditor
            open={!!editing}
            onClose={() => setEditing(null)}
            initial={editing}
            existingReplies={replies.data ?? []}
            onSaved={() => {
              setEditing(null);
              void replies.refetch();
            }}
          />
        </React.Suspense>
      }
    />
  );
}

function TagsStep() {
  const tags = useQuery({ queryKey: TAGS_QUERY_KEY, queryFn: crmApi.listTags });
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiTag | null>(null);
  const create = useMutation({
    mutationFn: (data: { name: string; description?: string; color: string }) =>
      crmApi.createTag(data),
    onSuccess: async () => {
      await tags.refetch();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const remove = useMutation({
    mutationFn: crmApi.archiveTag,
    onSuccess: async () => {
      await tags.refetch();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const suggestions = [
    { name: "Cliente", description: "Identificação de clientes", color: "#3B82F6" },
    { name: "Fornecedor", description: "Conversas com fornecedores", color: "#22C55E" },
    { name: "Informação", description: "Conversas informativas", color: "#EAB308" },
    { name: "Suporte", description: "Atendimentos de suporte", color: "#F43F5E" },
    { name: "Financeiro", description: "Assuntos financeiros", color: "#8B5CF6" },
  ];
  const addSuggestion = (suggestionName: string) => {
    if ((tags.data ?? []).some((item) => normalized(item.nome) === normalized(suggestionName))) {
      toast.info(`${suggestionName} já existe.`);
      return;
    }
    const suggestion = suggestions.find((item) => item.name === suggestionName)!;
    create.mutate(suggestion);
  };
  return (
    <CatalogStep
      title="Revise as etiquetas. Esta etapa não exige quantidade mínima."
      loading={tags.isPending}
      form={
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Nome, descrição, cor e validações são os mesmos do cadastro oficial.
          </p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nova etiqueta
          </Button>
        </div>
      }
      suggestions={
        <SuggestionButtons
          values={suggestions.map((item) => item.name)}
          onPick={addSuggestion}
          busy={create.isPending}
        />
      }
      items={(tags.data ?? []).map((item) => (
        <CatalogRow
          key={item.id}
          title={item.nome}
          subtitle={item.descricao || item.cor}
          icon={<span className="h-5 w-5 rounded-full" style={{ backgroundColor: item.cor }} />}
          onEdit={() => setEditing(item)}
          onDelete={() => remove.mutate(item.id)}
        />
      ))}
      overlay={
        <React.Suspense fallback={null}>
          <OfficialTagForm
            open={creating}
            onClose={() => setCreating(false)}
            tags={tags.data ?? []}
            onSubmit={async (data) => {
              await crmApi.createTag(data);
              setCreating(false);
              await tags.refetch();
            }}
          />
          <OfficialTagForm
            open={!!editing}
            onClose={() => setEditing(null)}
            initial={editing ?? undefined}
            tags={tags.data ?? []}
            onSubmit={async (data) => {
              if (!editing) return;
              await crmApi.updateTag(editing.id, data);
              setEditing(null);
              await tags.refetch();
            }}
          />
        </React.Suspense>
      }
    />
  );
}

function ConclusionStep({ checklist }: { checklist: ApiTenantOnboardingStatus["checklist"] }) {
  const items = [
    ["Instância configurada", checklist.instanceConnected],
    ["Departamento ativo cadastrado", checklist.activeDepartment],
    ["Perfil Administrador validado", checklist.administratorProfile],
    ["Administrador ativo e vinculado", checklist.activeAdministrator],
    ["Mensagens rápidas revisadas", checklist.quickRepliesReviewed],
    ["Etiquetas revisadas", checklist.tagsReviewed],
  ] as const;
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2">
      <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full bg-success/10 text-success">
        <Rocket className="h-28 w-28" />
      </div>
      <div>
        <h2 className="text-3xl font-semibold">Tudo pronto!</h2>
        <p className="mt-3 text-muted-foreground">
          Seu TRIXUS está configurado e pronto para uso. A validação final será feita pelo servidor.
        </p>
        <Card className="mt-6 bg-success/5">
          <ul className="space-y-3">
            {items.map(([label, ready]) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${ready ? "bg-success text-success-foreground" : "bg-warning/15 text-warning"}`}
                >
                  {ready ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </span>
                {label}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function CatalogStep({
  title,
  loading,
  notice,
  form,
  suggestions,
  items,
  overlay,
}: {
  title: string;
  loading: boolean;
  notice?: string;
  form?: React.ReactNode;
  suggestions?: React.ReactNode;
  items: React.ReactNode[];
  overlay?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground">{title}</p>
      {notice && (
        <div className="rounded-xl border border-info/25 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
          {notice}
        </div>
      )}
      {form && <Card>{form}</Card>}
      {suggestions}
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.length ? (
            items
          ) : (
            <Card className="text-sm text-muted-foreground">Nenhum registro cadastrado.</Card>
          )}
        </div>
      )}
      {overlay}
    </div>
  );
}

function SuggestionButtons({
  values,
  onPick,
  busy,
}: {
  values: string[];
  onPick: (value: string) => void;
  busy: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sugestões
      </p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <Button
            key={value}
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onPick(value)}
          >
            <Plus className="h-3.5 w-3.5" /> {value}
          </Button>
        ))}
      </div>
    </div>
  );
}

function CatalogRow({
  title,
  subtitle,
  icon,
  onDelete,
  onEdit,
  action,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onDelete?: () => void;
  onEdit?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
      {onEdit && (
        <Button variant="ghost" size="icon" title={`Editar ${title}`} onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="trash-action"
          title={`Excluir ${title}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </Card>
  );
}

function CatalogEditDialog({
  open,
  title,
  initialName,
  initialDetail,
  nameLabel = "Nome *",
  detailLabel = "Descrição",
  detailRequired = false,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initialName: string;
  initialDetail?: string | null;
  nameLabel?: string;
  detailLabel?: string;
  detailRequired?: boolean;
  onClose: () => void;
  onSave: (data: { name: string; detail: string }) => Promise<void>;
}) {
  const [name, setName] = React.useState(initialName);
  const [detail, setDetail] = React.useState(initialDetail ?? "");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    setName(initialName);
    setDetail(initialDetail ?? "");
  }, [initialDetail, initialName, open]);
  const save = async () => {
    if (name.trim().length < 2) return toast.error("Informe um nome válido.");
    if (detailRequired && !detail.trim())
      return toast.error(`Informe ${detailLabel.toLowerCase()}.`);
    setBusy(true);
    try {
      await onSave({ name: name.trim(), detail: detail.trim() });
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={nameLabel}>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={`${detailLabel}${detailRequired ? " *" : ""}`}>
          <Input value={detail} onChange={(event) => setDetail(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
