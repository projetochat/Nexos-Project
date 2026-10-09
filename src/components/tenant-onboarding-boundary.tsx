import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  Info,
  Loader2,
  LockKeyhole,
  LogOut,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Upload,
  Wifi,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, Badge, Button, Card, Field, Input, Select } from "@/components/ui-kit";
import { DepartmentIcon } from "@/components/department-icon";
import { ErrorState, Spinner } from "@/components/feedback";
import { Modal } from "@/components/modal";
import {
  ProfileCameraModal,
  ProfilePhotoMenu,
  ProfilePhotoMenuButton,
  ProfilePhotoPreviewModal,
} from "@/components/profile-photo-controls";
import { QrGenerationLoadingOverlay } from "@/components/qr-generation-loading-overlay";
import { createOnboardingConnectionWithQr } from "@/components/tenant-onboarding-connection";
import { usePhotoCropper } from "@/hooks/use-photo-cropper";
import { connectionRemoveErrorMessage } from "@/lib/connection-remove-errors";
import {
  TrixusApiError,
  apiErrorMessageWithRequestId,
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
  buildOnboardingAttendantPayload,
  canAdvanceOnboardingStep,
  formatOnboardingConnectedAt,
  isOnboardingInstanceNotFound,
  onboardingRoleColorClass,
  onboardingStepAfterRefresh,
  shouldPollOnboardingConnection,
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
const DEFAULT_BOOTSTRAP_STEPS = new Set([3, 4, 6, 7]);

type InstanceStepHandle = {
  generateQr: () => void;
};

type InstanceFooterState = {
  canGenerate: boolean;
  busy: boolean;
};

export const STEPS = [
  { label: "Boas-vindas", title: "Boas-vindas", subtitle: null },
  {
    label: "Instância",
    title: "Configuração da Instância",
    subtitle: "Conecte sua conta do WhatsApp para começar a receber e atender conversas.",
  },
  {
    label: "Departamentos",
    title: "Cadastro de Departamentos",
    subtitle:
      "Organize seu atendimento por departamentos, definindo um nome, cor, ícone e a instância que será utilizada nas conversas.",
  },
  {
    label: "Perfis e Acessos",
    title: "Perfis e Acessos",
    subtitle:
      "Crie perfis de usuários e defina quais departamentos e instâncias cada perfil terá acesso.",
  },
  {
    label: "Atendentes",
    title: "Cadastro de Atendentes",
    subtitle: "Cadastre os atendentes que irão operar o chat e vincule seus perfis de acesso.",
  },
  {
    label: "Etiquetas",
    title: "Cadastro de Etiquetas",
    subtitle: "Crie etiquetas para organizar e categorizar suas conversas.",
  },
  {
    label: "Mensagens Rápidas",
    title: "Mensagens Rápidas",
    subtitle: "Crie mensagens que podem ser usadas pelo seu time para agilizar o atendimento.",
  },
  { label: "Conclusão", title: "Conclusão", subtitle: null },
] as const;

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

const shouldBootstrapOnboardingDefaults = (step: number, maxCompletedStep: number) =>
  DEFAULT_BOOTSTRAP_STEPS.has(step) && maxCompletedStep < step;

export const SUPERVISOR_DEFAULT_PERMISSIONS = [
  "dashboard.read",
  "dashboard.create",
  "dashboard.update",
  "dashboard.delete",
  "conversations.read",
  "messages.send",
  "chat.messages.edit",
  "chat.messages.delete",
  "chat.agent_name.show",
  "history.read",
  "conversations.assign",
  "chat.phone.read",
  "chat.conversations.view_all_active",
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "contacts.delete",
  "contacts.additional_fields.read",
  "groups.read",
  "groups.create",
  "groups.update",
  "groups.leave",
  "users.read",
  "users.create",
  "users.update",
  "users.delete",
  "departments.read",
  "departments.create",
  "departments.update",
  "departments.delete",
  "chat.tags.read",
  "chat.tags.create",
  "chat.tags.update",
  "chat.tags.delete",
  "chat.quick_replies.read",
  "chat.quick_replies.create",
  "chat.quick_replies.update",
  "chat.quick_replies.delete",
] as const;

export const ATTENDANT_DEFAULT_PERMISSIONS = [
  "dashboard.read",
  "conversations.read",
  "messages.send",
  "chat.messages.edit",
  "chat.messages.delete",
  "chat.agent_name.show",
  "history.read",
  "conversations.assign",
  "chat.phone.read",
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "groups.read",
  "chat.tags.read",
  "chat.quick_replies.read",
] as const;

export const DEFAULT_DEPARTMENTS = [
  {
    name: "Atendimento",
    description: "Central de atendimento",
    color: "#10B981",
    icon: "headset" as const,
    favorite: true,
  },
  {
    name: "Comercial",
    description: "Equipe de vendas",
    color: "#2563EB",
    icon: "shopping-cart" as const,
    favorite: false,
  },
  {
    name: "Financeiro",
    description: "Equipe financeira",
    color: "#EF4444",
    icon: "dollar-sign" as const,
    favorite: false,
  },
] as const;

export const DEFAULT_QUICK_REPLIES = [
  {
    title: "Saudação Inicial",
    shortcut: "oi",
    content:
      "{{saudacao}}! 👋\nSeja bem-vindo ao atendimento da {{instancia}}.\nComo posso te ajudar?",
  },
  {
    title: "Horário de Atendimento",
    shortcut: "horario",
    content:
      "⏰ Nosso horário de atendimento é de segunda a sexta-feira, das 8h às 18h.\nDeixe sua mensagem e retornaremos assim que possível.",
  },
  {
    title: "Agradecimento",
    shortcut: "obrigado",
    content: "*{{nome}}*,\nObrigado pelo seu contato! 🙏\nFoi um prazer te atender.",
  },
  {
    title: "Encerramento",
    shortcut: "tchau",
    content: "Se precisar de mais alguma coisa, é só chamar. 😊",
  },
] as const;

export const DEFAULT_TAGS = [
  { name: "Novo Cliente", description: "Novo cliente", color: "#1687F8" },
  { name: "Em Atendimento", description: "Em atendimento", color: "#12B76A" },
  { name: "Aguardando Retorno", description: "Aguardando retorno", color: "#F4B400" },
  { name: "Problema Técnico", description: "Problema técnico", color: "#F04438" },
  { name: "Fechado", description: "Fechado", color: "#7A2CF3" },
] as const;

function hasOnboardingDefaults(metadata: unknown) {
  return (
    !!metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as { onboardingDefaultsVersion?: unknown }).onboardingDefaultsVersion === 1
  );
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
      <div
        className="flex min-h-dvh items-center justify-center bg-background"
        role="status"
        aria-label="Carregando"
      >
        <Spinner size={28} />
      </div>
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
  return (
    <>
      <div aria-hidden="true" inert className="pointer-events-none select-none blur-[2px]">
        {children}
      </div>
      <TenantOnboardingWizard initial={state} />
    </>
  );
}

function OnboardingFrame({ children }: { children: React.ReactNode }) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/28 p-0 text-foreground backdrop-blur-sm sm:p-3">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Configuração inicial do TRIXUS Chat"
        tabIndex={-1}
        className="h-dvh w-full overflow-hidden bg-background shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:max-h-[67.5rem] sm:max-w-[90rem] sm:rounded-2xl sm:border sm:border-slate-200"
      >
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
  const instanceStepRef = React.useRef<InstanceStepHandle>(null);
  const [state, setState] = React.useState(initial);
  const [step, setStep] = React.useState(() =>
    Math.max(1, Math.min(8, initial.progress.currentStep)),
  );
  const [saving, setSaving] = React.useState(false);
  const needsDefaultBootstrap = shouldBootstrapOnboardingDefaults(
    step,
    initial.progress.maxCompletedStep,
  );
  const [stepBlocking, setStepBlocking] = React.useState(needsDefaultBootstrap);
  const [instanceFooterState, setInstanceFooterState] = React.useState<InstanceFooterState>({
    canGenerate: false,
    busy: false,
  });

  const updateInstanceFooterState = React.useCallback((next: InstanceFooterState) => {
    setInstanceFooterState((current) =>
      current.canGenerate === next.canGenerate && current.busy === next.busy ? current : next,
    );
  }, []);

  const refreshStatus = React.useCallback(
    async (followServerStep = false) => {
      const refreshed = await queryClient.fetchQuery({
        queryKey: ONBOARDING_QUERY_KEY,
        queryFn: onboardingApi.status,
        staleTime: 0,
      });
      setState(refreshed);
      setStep((current) =>
        onboardingStepAfterRefresh(current, refreshed.progress.currentStep, followServerStep),
      );
      return refreshed;
    },
    [queryClient],
  );

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
      setStepBlocking(
        shouldBootstrapOnboardingDefaults(nextStep, updated.progress.maxCompletedStep),
      );
      setStep(nextStep);
      queryClient.setQueryData(ONBOARDING_QUERY_KEY, updated);
    } catch (error) {
      if (error instanceof TrixusApiError && error.code === "ONBOARDING_VERSION_CONFLICT") {
        await refreshStatus(true);
        toast.info("O progresso foi atualizado em outra sessão. Exibimos a versão mais recente.");
      } else {
        toast.error((error as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const goBack = () =>
    setStep((current) => {
      const previous = Math.max(1, current - 1);
      setStepBlocking(shouldBootstrapOnboardingDefaults(previous, state.progress.maxCompletedStep));
      return previous;
    });
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
        await refreshStatus(true);
        toast.info("O progresso mudou em outra sessão. Revise a situação atual.");
      } else {
        toast.error((error as Error).message);
        await refreshStatus().catch(() => undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const currentStepComplete = canAdvanceOnboardingStep(step, state);
  const instanceNeedsQr = step === 2 && !currentStepComplete;
  const instanceFooterBusy = step === 2 && instanceFooterState.busy;
  const nextDisabled =
    saving ||
    stepBlocking ||
    instanceFooterBusy ||
    (instanceNeedsQr ? !instanceFooterState.canGenerate : !currentStepComplete);

  const runFooterAction = () => {
    if (instanceNeedsQr) {
      instanceStepRef.current?.generateQr();
      return;
    }
    void persistStep(step + 1, step);
  };

  if (state.status === "completed") return null;

  return (
    <OnboardingFrame>
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[23rem_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="border-b border-sky-100 bg-gradient-to-br from-white to-sky-50/80 px-3 pb-1 pt-2 sm:pb-2 sm:pt-4 lg:border-b-0 lg:border-r lg:px-6 lg:py-6">
          <div className="mb-2 flex items-center gap-3 px-2 sm:mb-4 lg:mb-8">
            <img
              src="/trixus-logo-wordmark.png"
              alt="TRIXUS — Soluções que conectam"
              className="h-12 w-auto object-contain sm:h-14 lg:h-16"
            />
          </div>
          <ol className="relative grid grid-cols-8 gap-1 rounded-2xl bg-sky-50/75 px-2 py-1 sm:py-2 lg:grid-cols-1 lg:gap-2 lg:bg-transparent lg:p-0">
            {STEPS.map((item, index) => {
              const number = index + 1;
              const complete = number <= state.progress.maxCompletedStep;
              const active = number === step;
              return (
                <li
                  key={item.label}
                  aria-current={active ? "step" : undefined}
                  className={`relative flex min-w-0 flex-col items-center gap-1 overflow-hidden rounded-xl px-0 py-1 text-center transition sm:py-1.5 lg:flex-row lg:gap-4 lg:overflow-visible lg:px-3 lg:py-3 lg:text-left ${
                    active
                      ? "bg-sky-100/90 text-primary"
                      : complete
                        ? "text-[#05a968]"
                        : "text-[#35549a]"
                  }`}
                >
                  <span
                    className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 text-sm font-semibold sm:h-10 sm:w-10 lg:h-12 lg:w-12 lg:text-xl ${
                      active
                        ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-lg shadow-blue-200"
                        : complete
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white"
                          : "bg-slate-100 text-[#304878]"
                    }`}
                  >
                    {number}
                  </span>
                  <span className="min-h-5 w-full overflow-hidden px-0.5 text-[7px] font-medium leading-[0.65rem] [overflow-wrap:anywhere] sm:text-[10px] sm:leading-3 lg:min-h-0 lg:truncate lg:px-0 lg:text-lg lg:leading-normal">
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col overflow-y-auto px-4 pb-0 pt-2 sm:px-8 sm:pt-5 lg:px-12 lg:pt-16">
          <div className="mb-2 shrink-0 sm:mb-4 lg:mb-6">
            <p className="text-lg font-semibold text-[#3d5fa7] lg:text-2xl">Passo {step} de 8</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#070a67] sm:text-4xl lg:text-5xl">
              {STEPS[step - 1].title}
            </h1>
            {STEPS[step - 1].subtitle && (
              <p className="mt-2 max-w-5xl text-base leading-6 text-[#4564a8] sm:text-lg lg:text-2xl lg:leading-9">
                {STEPS[step - 1].subtitle}
              </p>
            )}
          </div>
          <div className="min-h-0 shrink-0 lg:flex-1">
            {step === 1 && <WelcomeStep />}
            {step === 2 && (
              <InstanceStep
                ref={instanceStepRef}
                onServerChange={refreshStatus}
                onFooterStateChange={updateInstanceFooterState}
              />
            )}
            {step === 3 && (
              <DepartmentsStep
                bootstrapDefaults={state.progress.maxCompletedStep < 3}
                onServerChange={refreshStatus}
                onBusyChange={setStepBlocking}
              />
            )}
            {step === 4 && (
              <RolesStep
                bootstrapDefaults={state.progress.maxCompletedStep < 4}
                onServerChange={refreshStatus}
                onBusyChange={setStepBlocking}
              />
            )}
            {step === 5 && <UsersStep onServerChange={refreshStatus} />}
            {step === 6 && (
              <TagsStep
                bootstrapDefaults={state.progress.maxCompletedStep < 6}
                onBusyChange={setStepBlocking}
              />
            )}
            {step === 7 && (
              <QuickRepliesStep
                bootstrapDefaults={state.progress.maxCompletedStep < 7}
                onBusyChange={setStepBlocking}
              />
            )}
            {step === 8 && <ConclusionStep checklist={state.checklist} />}
          </div>
          <div
            className={`z-20 mt-3 flex shrink-0 items-center gap-3 bg-background/95 py-3 backdrop-blur sm:mt-5 sm:py-5 lg:sticky lg:bottom-0 ${
              step === 1 || step === 8 ? "justify-end" : "justify-between"
            }`}
          >
            {step > 1 && step < 8 && (
              <Button
                className="h-12 min-w-32 border-blue-200 text-[#080b72] sm:h-14 sm:min-w-48 sm:text-lg"
                variant="outline"
                onClick={goBack}
                disabled={saving || instanceFooterBusy}
              >
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
            )}
            {step < 8 ? (
              <Button
                size="lg"
                className={`${step === 1 ? "w-full sm:w-auto" : ""} h-12 min-w-40 bg-gradient-to-r from-blue-600 to-sky-500 px-8 sm:h-14 sm:min-w-56 sm:text-lg`}
                disabled={nextDisabled}
                onClick={runFooterAction}
              >
                {(saving || instanceFooterBusy) && <Loader2 className="h-4 w-4 animate-spin" />}
                {step === 1 ? "Vamos dar início" : "Avançar"} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                className="h-14 min-w-64 bg-gradient-to-r from-blue-600 to-sky-500 px-8 text-lg"
                size="lg"
                disabled={saving || !Object.values(state.checklist).every(Boolean)}
                onClick={() => void complete()}
              >
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
    <div>
      <h2 className="text-2xl font-bold text-[#080b72] lg:text-3xl">Bem-vindo ao Trixus Chat!</h2>
      <div className="mt-2 grid items-center gap-2 sm:mt-4 sm:gap-4 md:grid-cols-[minmax(15rem,0.8fr)_minmax(20rem,1.2fr)] lg:mt-6 lg:gap-10">
        <img
          src="/wizard-assistant.png"
          alt="Assistente TRIXUS dando boas-vindas"
          className="mx-auto h-[15.6rem] w-full max-w-[24rem] object-contain sm:h-64 lg:h-80"
        />
        <p className="max-w-2xl text-base leading-6 text-[#3f5da1] sm:text-lg sm:leading-8 lg:text-2xl lg:leading-10">
          Este assistente vai te guiar na configuração inicial do seu ambiente de atendimento, de
          forma rápida e organizada. Em poucos passos, você estará pronto para atender seus
          clientes.
        </p>
      </div>
      <div className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-[#365aa3] sm:mt-4 sm:px-5 sm:py-4 lg:px-8 lg:py-6">
        <ul className="space-y-4 text-sm sm:text-base lg:text-xl">
          <li className="flex items-center gap-4">
            <Clock3 className="h-8 w-8 shrink-0 text-blue-600" /> Este processo levará apenas alguns
            minutos.
          </li>
          <li className="hidden items-center gap-4 sm:flex">
            <Info className="h-8 w-8 shrink-0 text-blue-600" /> Você poderá ajustar essas
            configurações depois, se necessário.
          </li>
        </ul>
      </div>
    </div>
  );
}

const InstanceStep = React.forwardRef<
  InstanceStepHandle,
  {
    onServerChange: () => Promise<unknown>;
    onFooterStateChange: (state: InstanceFooterState) => void;
  }
>(function InstanceStep({ onServerChange, onFooterStateChange }, ref) {
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: CONNECTIONS_QUERY_KEY, queryFn: connectionsApi.list });
  const visible = (connections.data ?? []).filter((item) => item.status !== "removed");
  const [name, setName] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [orphanedConnectionId, setOrphanedConnectionId] = React.useState<string | null>(null);
  const createRequestActive = React.useRef(false);
  const qrRequestActive = React.useRef(false);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];

  React.useEffect(() => {
    if (!selectedId && visible[0]) setSelectedId(visible[0].id);
  }, [selectedId, visible]);

  React.useEffect(() => {
    if (!shouldPollOnboardingConnection(selected) || orphanedConnectionId === selected?.id) return;
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
    mutationFn: () => createOnboardingConnectionWithQr(name.trim()),
    onSuccess: async (connection) => {
      setConnectionError(null);
      setOrphanedConnectionId(null);
      setSelectedId(connection.id);
      setQr(connection.qrCodeBase64 ?? null);
      await connections.refetch();
      await onServerChange();
    },
    onError: (error) => {
      const message = apiErrorMessageWithRequestId(error);
      setConnectionError(message);
      toast.error(message);
      void connections.refetch();
    },
    onSettled: () => {
      createRequestActive.current = false;
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
        setConnectionError(apiErrorMessageWithRequestId(error));
      }
      toast.error(apiErrorMessageWithRequestId(error));
    },
    onSettled: () => {
      qrRequestActive.current = false;
    },
  });
  const removeOrphan = useMutation({
    mutationFn: (connection: ApiMessagingConnection) => connectionsApi.remove(connection.id),
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

  const startCreate = React.useCallback(() => {
    if (createRequestActive.current || create.isPending) return;
    createRequestActive.current = true;
    create.mutate();
  }, [create]);

  const startQrRequest = React.useCallback(
    (connection: ApiMessagingConnection) => {
      if (qrRequestActive.current || requestQr.isPending) return;
      qrRequestActive.current = true;
      requestQr.mutate(connection);
    },
    [requestQr],
  );

  const qrGenerationPending = create.isPending || requestQr.isPending;
  const canGenerateQr =
    !connections.isPending &&
    !qrGenerationPending &&
    (visible.length === 0
      ? name.trim().length >= 2
      : Boolean(
          selected &&
          selected.status !== "connected" &&
          selected.id !== orphanedConnectionId &&
          !qr,
        ));

  React.useEffect(() => {
    onFooterStateChange({ canGenerate: canGenerateQr, busy: qrGenerationPending });
  }, [canGenerateQr, onFooterStateChange, qrGenerationPending]);

  React.useImperativeHandle(
    ref,
    () => ({
      generateQr: () => {
        if (!canGenerateQr) return;
        if (visible.length === 0) {
          startCreate();
          return;
        }
        if (selected) startQrRequest(selected);
      },
    }),
    [canGenerateQr, selected, startCreate, startQrRequest, visible.length],
  );

  return (
    <div className="space-y-5">
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
              onClick={() => selected && startQrRequest(selected)}
            >
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </Button>
          )}
        </div>
      )}
      {connections.isPending ? (
        <div className="flex min-h-72 items-center justify-center">
          <Spinner size={28} />
        </div>
      ) : visible.length === 0 ? (
        <Card className="max-w-3xl border-sky-100 p-5 sm:p-7">
          <h2 className="mb-6 text-2xl font-bold text-[#080b72] lg:text-3xl">Dados da instância</h2>
          <label className="block">
            <span className="mb-2 block text-base font-semibold text-[#080b72] sm:text-lg">
              Nome da instância <span className="text-destructive">*</span>
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: WhatsApp Comercial"
              className="min-h-12 px-4 text-base sm:min-h-14 sm:text-xl"
            />
            <span className="mt-2 block text-sm leading-6 text-[#4564a8] sm:text-base">
              Este será o nome que identificará esta instância no Trixus.
            </span>
          </label>
        </Card>
      ) : (
        <Card className="border-sky-100 p-5 sm:p-7">
          <h2 className="mb-6 text-2xl font-bold text-[#080b72] lg:text-3xl">Dados da instância</h2>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <div>
                <span className="mb-2 block text-base font-semibold text-[#080b72] sm:text-lg">
                  Nome da instância
                </span>
                <div className="relative">
                  <Input
                    value={selected?.name ?? ""}
                    disabled
                    className="min-h-12 px-4 pr-11 text-base font-medium sm:min-h-14 sm:text-xl"
                  />
                  <LockKeyhole className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#4765a6]" />
                </div>
                <span className="mt-2 block text-sm leading-6 text-[#4564a8] sm:text-base">
                  Este será o nome que identificará esta instância no Trixus.
                </span>
              </div>
              {selected && (
                <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-6 text-[#365aa3]">
                  <div>
                    <p className="mb-2 text-sm">Status</p>
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
                  <div>
                    <p className="mb-2 text-sm">Conectada em</p>
                    <p className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5" />{" "}
                      {formatOnboardingConnectedAt(selected.updatedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm">Tipo de conexão</p>
                    <p className="flex items-center gap-2">
                      <Wifi className="h-6 w-6 text-emerald-600" /> WhatsApp Business
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm">Número conectado</p>
                    <p className="flex items-center gap-2">
                      <Phone className="h-5 w-5" />{" "}
                      {selected.ownerPhoneMasked ||
                        selected.ownerPhone ||
                        "Aguardando identificação"}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex min-h-64 items-center justify-center border-t border-sky-100 pt-5 text-center lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              {selected?.status === "connected" ? (
                <div>
                  <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
                  <h3 className="mt-4 text-lg font-semibold text-emerald-600">QR Code conectado</h3>
                  <p className="mt-2 text-sm text-[#4564a8]">
                    Sua instância está ativa e pronta para uso.
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
            </div>
          </div>
          {selected?.status === "connected" && (
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-[#31599f]">
              <CheckCircle2 className="h-12 w-12 shrink-0 text-emerald-600" />
              <div>
                <p className="font-bold text-[#075675]">Instância conectada com sucesso!</p>
                <p>
                  Sua instância do WhatsApp foi conectada com sucesso. Agora você já pode prosseguir
                  para os próximos passos.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}
      {!connections.isPending && selected?.status !== "connected" && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-4 text-[#365aa3] sm:px-5">
          <Info className="mt-0.5 h-7 w-7 shrink-0 text-blue-600" />
          <p className="text-sm leading-6 sm:text-base">
            Após a leitura, aguarde a confirmação da conexão.
            <span className="block">Este processo pode levar alguns segundos.</span>
          </p>
        </div>
      )}
      <QrGenerationLoadingOverlay open={qrGenerationPending} />
      <Modal
        open={!!qr && selected?.status !== "connected"}
        onClose={() => setQr(null)}
        title={`QR Code - ${selected?.name ?? name.trim()}`}
        size="sm"
      >
        <div className="text-center">
          <img
            src={qr ?? undefined}
            alt={`QR Code - ${selected?.name ?? name.trim()}`}
            className="mx-auto max-h-[70dvh] max-w-full rounded-lg border border-border bg-white p-3"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            Leia o QR Code e aguarde a confirmação efetiva da conexão.
          </p>
        </div>
      </Modal>
    </div>
  );
});

function DepartmentsStep({
  bootstrapDefaults,
  onServerChange,
  onBusyChange,
}: {
  bootstrapDefaults: boolean;
  onServerChange: () => Promise<unknown>;
  onBusyChange: (busy: boolean) => void;
}) {
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
  const [bootstrapping, setBootstrapping] = React.useState(false);
  const [bootstrapError, setBootstrapError] = React.useState<string | null>(null);
  const bootstrapStarted = React.useRef(false);
  React.useEffect(
    () =>
      onBusyChange(
        departments.isPending || connections.isPending || bootstrapping || !!bootstrapError,
      ),
    [bootstrapError, bootstrapping, connections.isPending, departments.isPending, onBusyChange],
  );
  React.useEffect(() => {
    if (!connectionId && connections.data?.[0]) setConnectionId(connections.data[0].id);
  }, [connectionId, connections.data]);
  React.useEffect(() => {
    if (
      !bootstrapDefaults ||
      bootstrapStarted.current ||
      departments.isPending ||
      connections.isPending ||
      !connectionId
    )
      return;
    bootstrapStarted.current = true;
    setBootstrapping(true);
    setBootstrapError(null);
    void (async () => {
      try {
        for (const item of DEFAULT_DEPARTMENTS) {
          const existing = (departments.data ?? []).find(
            (department) => normalized(department.name) === normalized(item.name),
          );
          if (existing) {
            if (!existing.connectionIds.includes(connectionId)) {
              await organizationApi.updateDepartment(existing.id, {
                connectionIds: [...existing.connectionIds, connectionId],
              });
            }
            continue;
          }
          const { favorite: _favorite, ...department } = item;
          await organizationApi.createDepartment({ ...department, connectionIds: [connectionId] });
        }
        await departments.refetch();
        await onServerChange();
      } catch (error) {
        const refreshed = await departments.refetch();
        const ready = DEFAULT_DEPARTMENTS.every((item) =>
          (refreshed.data ?? []).some(
            (department) =>
              normalized(department.name) === normalized(item.name) &&
              department.connectionIds.includes(connectionId),
          ),
        );
        if (!ready) {
          setBootstrapError(
            `${apiErrorMessageWithRequestId(error)} Atualize a página para tentar novamente.`,
          );
        }
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [
    bootstrapDefaults,
    connectionId,
    connections.isPending,
    departments,
    departments.data,
    departments.isPending,
    onServerChange,
  ]);
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
  return (
    <CatalogStep
      title=""
      loading={departments.isPending || bootstrapping}
      notice={bootstrapError ?? "Você pode cadastrar quantos departamentos forem necessários."}
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
          action={
            <Star
              aria-label={
                DEFAULT_DEPARTMENTS.find(
                  (department) => normalized(department.name) === normalized(item.name),
                )?.favorite
                  ? "Departamento favorito"
                  : "Departamento não favorito"
              }
              className={`h-5 w-5 ${DEFAULT_DEPARTMENTS.find((department) => normalized(department.name) === normalized(item.name))?.favorite ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
            />
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

function RolesStep({
  bootstrapDefaults,
  onServerChange,
  onBusyChange,
}: {
  bootstrapDefaults: boolean;
  onServerChange: () => Promise<unknown>;
  onBusyChange: (busy: boolean) => void;
}) {
  const roles = useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: organizationApi.listRoles });
  const scopeOptions = useQuery({
    queryKey: ["trixus", "role-scope-options"],
    queryFn: organizationApi.roleScopeOptions,
  });
  const grantablePermissionIds = useSession((state) => state.user?.permissions ?? []);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiRole | null>(null);
  const [bootstrapping, setBootstrapping] = React.useState(false);
  const [bootstrapError, setBootstrapError] = React.useState<string | null>(null);
  const bootstrapStarted = React.useRef(false);
  React.useEffect(
    () =>
      onBusyChange(roles.isPending || scopeOptions.isPending || bootstrapping || !!bootstrapError),
    [bootstrapError, bootstrapping, onBusyChange, roles.isPending, scopeOptions.isPending],
  );
  React.useEffect(() => {
    if (
      !bootstrapDefaults ||
      bootstrapStarted.current ||
      roles.isPending ||
      scopeOptions.isPending ||
      !scopeOptions.data
    )
      return;
    const connectionIds = scopeOptions.data.connections.map((connection) => connection.id);
    const departmentIds = scopeOptions.data.departments.map((department) => department.id);
    if (connectionIds.length === 0 || departmentIds.length === 0) return;
    bootstrapStarted.current = true;
    setBootstrapping(true);
    setBootstrapError(null);
    const favoriteDepartmentId =
      scopeOptions.data.departments.find(
        (department) => normalized(department.name) === "atendimento",
      )?.id ??
      departmentIds[0] ??
      null;
    const metadata = {
      onboardingDefaultsVersion: 1,
      connectionIds,
      departmentIds,
      chatScopes: scopeOptions.data.connections.map((connection) => {
        const allowedDepartmentIds = connection.departments.map((department) => department.id);
        return {
          connectionId: connection.id,
          departmentIds: allowedDepartmentIds,
          favoriteDepartmentId: allowedDepartmentIds.includes(favoriteDepartmentId ?? "")
            ? favoriteDepartmentId
            : null,
        };
      }),
    };
    void (async () => {
      try {
        const currentRoles = roles.data ?? [];
        const attendant = currentRoles.find(
          (role) => role.key === "agent" || normalized(role.name) === "atendente",
        );
        if (!attendant) {
          await organizationApi.createRole({
            key: "agent",
            name: "Atendente",
            description: "Operacionais do chat",
            permissionIds: [...ATTENDANT_DEFAULT_PERMISSIONS],
            metadata,
          });
        } else if (!hasOnboardingDefaults(attendant.metadata)) {
          await organizationApi.updateRole(attendant.id, {
            name: "Atendente",
            description: attendant.description || "Operacionais do chat",
            permissionIds: [...ATTENDANT_DEFAULT_PERMISSIONS],
            metadata: {
              ...(attendant.metadata &&
              typeof attendant.metadata === "object" &&
              !Array.isArray(attendant.metadata)
                ? attendant.metadata
                : {}),
              ...metadata,
            },
          });
        }
        const supervisor = currentRoles.find(
          (role) => role.key === "supervisor" || normalized(role.name) === "supervisor",
        );
        if (!supervisor) {
          await organizationApi.createRole({
            key: "supervisor",
            name: "Supervisor",
            description: "Tudo do Módulo Chat",
            permissionIds: [...SUPERVISOR_DEFAULT_PERMISSIONS],
            metadata,
          });
        } else if (!hasOnboardingDefaults(supervisor.metadata)) {
          await organizationApi.updateRole(supervisor.id, {
            name: "Supervisor",
            description: supervisor.description || "Tudo do Módulo Chat",
            permissionIds: [...SUPERVISOR_DEFAULT_PERMISSIONS],
            metadata: {
              ...(supervisor.metadata &&
              typeof supervisor.metadata === "object" &&
              !Array.isArray(supervisor.metadata)
                ? supervisor.metadata
                : {}),
              ...metadata,
            },
          });
        }
        await roles.refetch();
        await onServerChange();
      } catch (error) {
        const refreshed = await roles.refetch();
        const refreshedRoles = refreshed.data ?? [];
        const administratorReady = refreshedRoles.some(
          (role) => role.key === "tenant_admin" || normalized(role.name) === "administrador",
        );
        const roleReady = (key: string, permissions: readonly string[]) => {
          const role = refreshedRoles.find((candidate) => candidate.key === key);
          return (
            !!role &&
            hasOnboardingDefaults(role.metadata) &&
            permissions.every((permission) => role.permissionIds.includes(permission))
          );
        };
        const ready =
          administratorReady &&
          roleReady("supervisor", SUPERVISOR_DEFAULT_PERMISSIONS) &&
          roleReady("agent", ATTENDANT_DEFAULT_PERMISSIONS);
        if (!ready) {
          setBootstrapError(
            `${apiErrorMessageWithRequestId(error)} Atualize a página para tentar novamente.`,
          );
        }
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [
    bootstrapDefaults,
    onServerChange,
    roles,
    roles.data,
    roles.isPending,
    scopeOptions.data,
    scopeOptions.isPending,
  ]);
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
  return (
    <CatalogStep
      title=""
      loading={roles.isPending || bootstrapping}
      notice={
        bootstrapError ??
        "O Perfil Administrador é protegido e conserva o catálogo completo aprovado na D-009."
      }
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
      items={[...(roles.data ?? [])]
        .sort((left, right) => {
          const order = ["administrador", "supervisor", "atendente"];
          const leftIndex = order.indexOf(normalized(left.name));
          const rightIndex = order.indexOf(normalized(right.name));
          return (
            (leftIndex < 0 ? order.length : leftIndex) -
            (rightIndex < 0 ? order.length : rightIndex)
          );
        })
        .map((item) => {
          const admin = item.key === "tenant_admin" || normalized(item.name) === "administrador";
          return (
            <CatalogRow
              key={item.id}
              title={item.name}
              subtitle={
                admin
                  ? "Acessos: Full · Departamentos: Todos"
                  : normalized(item.name) === "supervisor"
                    ? "Acessos: Tudo do Módulo Chat · Departamentos: Todos"
                    : "Acessos: Operacionais do chat · Departamentos: Atendimento, Comercial e Financeiro"
              }
              icon={<ShieldCheck className={onboardingRoleColorClass(item)} />}
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
  const [form, setForm] = React.useState<{
    name: string;
    email: string;
    password: string;
    roleId: string;
    avatarUrl?: string;
  }>({ name: "", email: "", password: "", roleId: "" });
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiUserMembership | null>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = React.useState(false);
  const photoButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const photoFileRef = React.useRef<HTMLInputElement | null>(null);
  const photoCrop = usePhotoCropper(
    (avatarUrl) => setForm((current) => ({ ...current, avatarUrl })),
    creating,
  );
  React.useEffect(() => {
    if (creating) return;
    setPhotoMenuOpen(false);
    setCameraOpen(false);
    setPhotoPreviewOpen(false);
  }, [creating]);
  React.useEffect(() => {
    if (!form.roleId && assignable[0])
      setForm((current) => ({ ...current, roleId: assignable[0].id }));
  }, [assignable, form.roleId]);
  const create = useMutation({
    mutationFn: () => organizationApi.createUser(buildOnboardingAttendantPayload(form)),
    onSuccess: async () => {
      setForm((current) => ({
        name: "",
        email: "",
        password: "",
        roleId: current.roleId,
        avatarUrl: undefined,
      }));
      setCreating(false);
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
      title=""
      loading={users.isPending}
      notice={(() => {
        const admin = (users.data ?? []).find((item) => item.role.key === "tenant_admin");
        const name =
          admin?.presentationName ||
          admin?.user.presentationName ||
          admin?.user.name ||
          "O administrador";
        return `${name} é o usuário administrador do sistema. Ele já veio cadastrado como padrão e não pode ser alterado nem excluído. Caso deseje cadastrar mais atendentes, você pode incluir quantos forem necessários.`;
      })()}
      form={
        <div className="flex justify-end">
          <Button
            className="bg-gradient-to-r from-blue-600 to-sky-500"
            onClick={() => setCreating(true)}
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
            icon={
              <span className="font-semibold text-primary">
                {(item.presentationName || item.user.presentationName || item.user.name)
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </span>
            }
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
        <>
          <Modal
            open={creating}
            onClose={() => setCreating(false)}
            title="Novo atendente"
            size="md"
            footer={
              <>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={
                    form.name.trim().length < 3 ||
                    !form.email.includes("@") ||
                    form.password.length < 6 ||
                    !form.roleId ||
                    create.isPending
                  }
                  onClick={() => create.mutate()}
                >
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
                </Button>
              </>
            }
          >
            <div className="grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <div className="relative flex items-start justify-center">
                <button
                  ref={photoButtonRef}
                  type="button"
                  className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-1 text-muted-foreground"
                  aria-label="Opções da foto do atendente"
                  onClick={() => setPhotoMenuOpen((current) => !current)}
                >
                  {form.avatarUrl ? (
                    <img
                      src={form.avatarUrl}
                      alt="Foto do atendente"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Avatar name={form.name || "?"} size={112} />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white opacity-0 transition hover:opacity-100">
                    <Camera className="h-8 w-8" />
                  </span>
                </button>
                <ProfilePhotoMenu
                  open={photoMenuOpen}
                  anchorRef={photoButtonRef}
                  onClose={() => setPhotoMenuOpen(false)}
                >
                  <ProfilePhotoMenuButton
                    icon={<Eye className="h-4 w-4" />}
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      if (form.avatarUrl) setPhotoPreviewOpen(true);
                      else toast.info("Nenhuma foto adicionada para este atendente.");
                    }}
                  >
                    Mostrar foto
                  </ProfilePhotoMenuButton>
                  <ProfilePhotoMenuButton
                    icon={<Camera className="h-4 w-4" />}
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      setCameraOpen(true);
                    }}
                  >
                    Tirar foto
                  </ProfilePhotoMenuButton>
                  <ProfilePhotoMenuButton
                    icon={<Upload className="h-4 w-4" />}
                    onClick={() => photoFileRef.current?.click()}
                  >
                    Carregar foto
                  </ProfilePhotoMenuButton>
                  <div className="my-1 border-t border-border" />
                  <ProfilePhotoMenuButton
                    className="trash-action"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => {
                      setForm((current) => ({ ...current, avatarUrl: undefined }));
                      setPhotoMenuOpen(false);
                    }}
                  >
                    Remover foto
                  </ProfilePhotoMenuButton>
                </ProfilePhotoMenu>
                <input
                  ref={photoFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    photoCrop.choose(event.target.files?.[0]);
                    setPhotoMenuOpen(false);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <div className="space-y-4">
                <Field label="Nome *">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="E-mail *">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value.toLocaleLowerCase("en-US") })
                    }
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
              </div>
            </div>
          </Modal>
          {photoCrop.dialog}
          <ProfileCameraModal
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onCapture={(avatarUrl) => {
              photoCrop.choose(avatarUrl);
              setCameraOpen(false);
            }}
          />
          <ProfilePhotoPreviewModal
            open={photoPreviewOpen}
            src={form.avatarUrl}
            onClose={() => setPhotoPreviewOpen(false)}
          />
          <CatalogEditDialog
            open={!!editing}
            title="Editar Atendente"
            initialName={
              editing?.presentationName ||
              editing?.user.presentationName ||
              editing?.user.name ||
              ""
            }
            initialDetail={editing?.user.email}
            detailLabel="E-mail"
            detailRequired
            onClose={() => setEditing(null)}
            onSave={(data) => update.mutateAsync(data).then(() => undefined)}
          />
        </>
      }
    />
  );
}

function QuickRepliesStep({
  bootstrapDefaults,
  onBusyChange,
}: {
  bootstrapDefaults: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const replies = useQuery({
    queryKey: QUICK_REPLIES_QUERY_KEY,
    queryFn: () => quickReplyApi.list({ scope: "catalog" }),
  });
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiQuickReply | null>(null);
  const [bootstrapping, setBootstrapping] = React.useState(false);
  const [bootstrapError, setBootstrapError] = React.useState<string | null>(null);
  const bootstrapStarted = React.useRef(false);
  React.useEffect(
    () => onBusyChange(replies.isPending || bootstrapping || !!bootstrapError),
    [bootstrapError, bootstrapping, onBusyChange, replies.isPending],
  );
  React.useEffect(() => {
    if (!bootstrapDefaults || bootstrapStarted.current || replies.isPending) return;
    bootstrapStarted.current = true;
    setBootstrapping(true);
    setBootstrapError(null);
    void (async () => {
      try {
        for (const item of DEFAULT_QUICK_REPLIES) {
          if ((replies.data ?? []).some((reply) => normalized(reply.shortcut) === item.shortcut))
            continue;
          await quickReplyApi.create(item);
        }
        await replies.refetch();
      } catch (error) {
        const refreshed = await replies.refetch();
        const ready = DEFAULT_QUICK_REPLIES.every((item) =>
          (refreshed.data ?? []).some((reply) => normalized(reply.shortcut) === item.shortcut),
        );
        if (!ready) {
          setBootstrapError(
            `${apiErrorMessageWithRequestId(error)} Atualize a página para tentar novamente.`,
          );
        }
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [bootstrapDefaults, replies, replies.data, replies.isPending]);
  const remove = useMutation({
    mutationFn: quickReplyApi.archive,
    onSuccess: async () => {
      await replies.refetch();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <CatalogStep
      title=""
      loading={replies.isPending || bootstrapping}
      notice={bootstrapError ?? "Você pode cadastrar quantas mensagens rápidas forem necessárias."}
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
      items={[...(replies.data ?? [])]
        .sort((left, right) => {
          const order = DEFAULT_QUICK_REPLIES.map((item) => item.shortcut);
          const leftIndex = order.indexOf(normalized(left.shortcut));
          const rightIndex = order.indexOf(normalized(right.shortcut));
          return (
            (leftIndex < 0 ? order.length : leftIndex) -
            (rightIndex < 0 ? order.length : rightIndex)
          );
        })
        .map((item) => (
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

function TagsStep({
  bootstrapDefaults,
  onBusyChange,
}: {
  bootstrapDefaults: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const tags = useQuery({ queryKey: TAGS_QUERY_KEY, queryFn: crmApi.listTags });
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiTag | null>(null);
  const [bootstrapping, setBootstrapping] = React.useState(false);
  const [bootstrapError, setBootstrapError] = React.useState<string | null>(null);
  const bootstrapStarted = React.useRef(false);
  React.useEffect(
    () => onBusyChange(tags.isPending || bootstrapping || !!bootstrapError),
    [bootstrapError, bootstrapping, onBusyChange, tags.isPending],
  );
  React.useEffect(() => {
    if (!bootstrapDefaults || bootstrapStarted.current || tags.isPending) return;
    bootstrapStarted.current = true;
    setBootstrapping(true);
    setBootstrapError(null);
    void (async () => {
      try {
        for (const item of DEFAULT_TAGS) {
          if ((tags.data ?? []).some((tag) => normalized(tag.nome) === normalized(item.name)))
            continue;
          await crmApi.createTag(item);
        }
        await tags.refetch();
      } catch (error) {
        const refreshed = await tags.refetch();
        const ready = DEFAULT_TAGS.every((item) =>
          (refreshed.data ?? []).some((tag) => normalized(tag.nome) === normalized(item.name)),
        );
        if (!ready) {
          setBootstrapError(
            `${apiErrorMessageWithRequestId(error)} Atualize a página para tentar novamente.`,
          );
        }
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [bootstrapDefaults, tags, tags.data, tags.isPending]);
  const remove = useMutation({
    mutationFn: crmApi.archiveTag,
    onSuccess: async () => {
      await tags.refetch();
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <CatalogStep
      title=""
      loading={tags.isPending || bootstrapping}
      notice={bootstrapError ?? "Você pode cadastrar quantas etiquetas forem necessárias."}
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
      items={[...(tags.data ?? [])]
        .sort((left, right) => {
          const order = DEFAULT_TAGS.map((item) => normalized(item.name));
          const leftIndex = order.indexOf(normalized(left.nome));
          const rightIndex = order.indexOf(normalized(right.nome));
          return (
            (leftIndex < 0 ? order.length : leftIndex) -
            (rightIndex < 0 ? order.length : rightIndex)
          );
        })
        .map((item) => (
          <CatalogRow
            key={item.id}
            title={item.nome}
            subtitle={item.descricao || item.cor}
            icon={<Tag className="h-5 w-5" style={{ color: item.cor }} />}
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
    ["Departamentos cadastrados", checklist.activeDepartment],
    ["Perfis e acessos definidos", checklist.administratorProfile],
    ["Atendentes cadastrados", checklist.activeAdministrator],
    ["Etiquetas configuradas", checklist.tagsReviewed],
    ["Mensagens rápidas criadas", checklist.quickRepliesReviewed],
  ] as const;
  return (
    <div className="grid items-center gap-5 md:grid-cols-[minmax(15rem,0.8fr)_minmax(20rem,1.2fr)] lg:gap-10">
      <img
        src="/wizard-rocket.png"
        alt="Foguete TRIXUS celebrando a conclusão"
        className="mx-auto h-64 w-full max-w-[27rem] object-contain lg:h-[31rem]"
      />
      <div>
        <h2 className="text-4xl font-bold text-[#080b72] lg:text-5xl">Tudo pronto!</h2>
        <p className="mt-3 text-lg leading-8 text-[#4564a8] lg:text-2xl lg:leading-10">
          Seu TRIXUS está configurado e pronto para uso.
          <br />
          Agora você já pode começar a atender seus clientes.
        </p>
        <div className="mt-6 rounded-3xl bg-emerald-50/80 px-6 py-6 lg:px-9 lg:py-7">
          <ul className="space-y-3 lg:space-y-4">
            {items.map(([label, ready]) => (
              <li
                key={label}
                className="flex items-center gap-4 text-base text-[#4564a8] lg:text-xl"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full lg:h-10 lg:w-10 ${ready ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-600"}`}
                >
                  {ready ? (
                    <Check className="h-5 w-5 lg:h-6 lg:w-6" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CatalogStep({
  title,
  loading,
  notice,
  form,
  items,
  overlay,
}: {
  title: string;
  loading: boolean;
  notice?: string;
  form?: React.ReactNode;
  items: React.ReactNode[];
  overlay?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {title && <p className="text-muted-foreground">{title}</p>}
      {form}
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
          {items.length ? (
            items
          ) : (
            <div className="p-6 text-sm text-muted-foreground">Nenhum registro cadastrado.</div>
          )}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-4 rounded-2xl bg-sky-50 px-5 py-4 text-sm leading-6 text-[#4564a8] sm:text-base">
          <Info className="mt-0.5 h-7 w-7 shrink-0 text-blue-600" />
          <span>{notice}</span>
        </div>
      )}
      {overlay}
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
    <div className="flex min-h-20 items-center gap-3 border-b border-sky-100 px-4 py-3 last:border-b-0 sm:px-6">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-[#080b72]">{title}</p>
        {subtitle && <p className="line-clamp-2 text-sm text-[#4564a8]">{subtitle}</p>}
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
    </div>
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
