import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AtSign,
  BarChart3,
  BadgeCheck,
  Building2,
  ClipboardList,
  Eye,
  EyeOff,
  Headphones,
  Loader2,
  LockKeyhole,
  Network,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui-kit";
import {
  acceptTenantInvitation,
  CUSTOMER_PORTAL_TICKETS_PATH,
  selectCustomerPortal,
  signInCustomerPortal,
  useSession,
} from "@/lib/session";
import {
  invitationPreviewWithTrixusApi,
  type ApiInvitationPreview,
  type TenantSelectionRequired,
} from "@/lib/trixus-api";

export const Route = createFileRoute("/login_/portal-cliente")({
  head: () => ({ meta: [{ title: "Portal do Cliente | Trixus" }] }),
  component: CustomerPortalLoginPage,
});

const benefits = [
  { icon: Headphones, label: "Acompanhe seus chamados" },
  { icon: ClipboardList, label: "Consulte solicitações" },
  { icon: BarChart3, label: "Mais transparência no atendimento" },
] as const;

const CUSTOMER_PORTAL_PROFILE_LABELS: Record<string, string> = {
  FULL_ACCESS: "Acesso Full",
  MANAGER: "Gerente",
  COLLABORATOR: "Colaborador",
};

function CustomerPortalLoginPage() {
  const navigate = useNavigate();
  const { invite } = Route.useSearch() as { invite?: string };
  const user = useSession((state) => state.user);
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordConfirmation, setPasswordConfirmation] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [invitationPreview, setInvitationPreview] = React.useState<ApiInvitationPreview | null>(
    null,
  );
  const [selection, setSelection] = React.useState<TenantSelectionRequired | null>(null);
  const [selectedAccessId, setSelectedAccessId] = React.useState("");
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (user?.roleKey === "customer_portal") {
      navigate({ to: CUSTOMER_PORTAL_TICKETS_PATH, search: emptyTicketSearch() });
    }
  }, [navigate, user]);

  React.useEffect(() => {
    if (!invite) {
      setInvitationPreview(null);
      return;
    }
    let active = true;
    invitationPreviewWithTrixusApi(invite)
      .then((preview) => {
        if (active) setInvitationPreview(preview);
      })
      .catch((previewError) => {
        if (active) setError(portalErrorMessage(previewError));
      });
    return () => {
      active = false;
    };
  }, [invite]);

  const showError = (nextError: unknown) => {
    const message = portalErrorMessage(nextError);
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const challenge = await signInCustomerPortal(login.trim().toLowerCase(), password);
      if (challenge) {
        const portalDestinations = (challenge.destinations ?? []).filter(
          (destination) => destination.type === "customer_portal",
        );
        if (!portalDestinations.length) {
          throw new Error("Seu usuário não possui acesso ao Portal do Cliente.");
        }
        setSelection({ ...challenge, destinations: portalDestinations });
        setSelectedAccessId("");
        return;
      }
      toast.success("Acesso realizado com sucesso.");
      navigate({ to: CUSTOMER_PORTAL_TICKETS_PATH, search: emptyTicketSearch() });
    } catch (loginError) {
      showError(loginError);
    } finally {
      setLoading(false);
    }
  };

  const handleSelection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selection || !selectedAccessId || loading) return;
    setError(null);
    setLoading(true);
    try {
      await selectCustomerPortal({
        selectionToken: selection.tenantSelectionToken,
        selectionId: selectedAccessId,
      });
      toast.success("Acesso realizado com sucesso.");
      navigate({ to: CUSTOMER_PORTAL_TICKETS_PATH, search: emptyTicketSearch() });
    } catch (selectionError) {
      showError(selectionError);
    } finally {
      setLoading(false);
    }
  };

  const handleActivation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invite || loading) return;
    setError(null);
    if (password.length < 8) {
      showError(new Error("A senha deve possuir pelo menos 8 caracteres."));
      return;
    }
    if (password !== passwordConfirmation) {
      showError(new Error("A confirmação da senha não confere."));
      return;
    }
    setLoading(true);
    try {
      await acceptTenantInvitation({
        token: invite,
        password,
        name: invitationPreview?.contact?.name,
      });
      toast.success("Acesso ativado com sucesso.");
      navigate({ to: CUSTOMER_PORTAL_TICKETS_PATH, search: emptyTicketSearch() });
    } catch (activationError) {
      showError(activationError);
    } finally {
      setLoading(false);
    }
  };

  const internalSessionBlocked = Boolean(user && user.roleKey !== "customer_portal");
  const isActivation = Boolean(invite);

  if (isActivation) {
    return (
      <CustomerPortalActivationPage
        preview={invitationPreview}
        error={error}
        errorRef={errorRef}
        password={password}
        confirmation={passwordConfirmation}
        showPassword={showPassword}
        showConfirmation={showPasswordConfirmation}
        loading={loading}
        onPassword={setPassword}
        onConfirmation={setPasswordConfirmation}
        onTogglePassword={() => setShowPassword((value) => !value)}
        onToggleConfirmation={() => setShowPasswordConfirmation((value) => !value)}
        onSubmit={handleActivation}
      />
    );
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-white text-[#071535]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-[18rem] top-[44%] h-[42rem] w-[42rem] rounded-full bg-[#dceeff] opacity-80 blur-sm" />
        <div className="absolute -right-[16rem] -top-[18rem] h-[48rem] w-[48rem] rounded-full bg-[#e8f4ff]" />
        <div className="absolute left-[38%] top-[-16rem] h-[58rem] w-[28rem] rotate-[-28deg] rounded-[50%] bg-gradient-to-b from-[#dcebff]/80 to-[#f7fbff]/20" />
        <div className="absolute right-[4%] top-[7%] h-[42rem] w-[42rem] rounded-full border-2 border-[#8ebcff]/45" />
        <div className="absolute right-[18%] top-[34%] h-[30rem] w-[45rem] rounded-[50%] border border-white/90" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-dvh w-full max-w-[1500px] content-start items-start gap-3 px-5 pb-8 pt-20 sm:gap-8 sm:px-8 sm:py-8 lg:content-center lg:grid-cols-[minmax(0,1.1fr)_minmax(390px,510px)] lg:items-center lg:gap-16 lg:px-16 xl:px-20">
        <section className="mx-auto w-full max-w-2xl lg:mx-0" aria-labelledby="portal-welcome">
          <img
            src="/trixus-logo-wordmark.png"
            alt="Trixus — Soluções que conectam"
            className="mx-auto mb-6 h-auto w-44 object-contain sm:w-52 lg:mx-0 lg:mb-10 lg:w-64"
          />
          <div className="mb-5 h-1 w-12 rounded-full bg-gradient-to-r from-[#176ef2] to-[#37b4e8]" />
          <h1
            id="portal-welcome"
            className="text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl lg:text-5xl"
          >
            Bem-vindo ao
            <span className="block bg-gradient-to-r from-[#0e55ef] via-[#176ef2] to-[#37b4e8] bg-clip-text font-bold text-transparent">
              Portal do Cliente
            </span>
          </h1>
          <p className="mt-4 hidden max-w-xl text-base leading-relaxed text-slate-600 sm:block sm:text-lg">
            Acesse seus chamados, acompanhe solicitações e consulte informações dos seus
            atendimentos.
          </p>
          <div className="mt-7 hidden max-w-xl grid-cols-3 gap-3 sm:grid sm:gap-5 lg:mt-10">
            {benefits.map(({ icon: Icon, label }) => (
              <div key={label} className="min-w-0">
                <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eff6ff] text-[#176ef2] shadow-sm ring-1 ring-blue-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="text-xs font-medium leading-snug text-[#19345f] sm:text-sm">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-[510px] rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-[0_28px_80px_rgba(31,78,140,0.18)] backdrop-blur sm:p-8 lg:p-10">
          <div className="mb-7">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#176ef2]">
              Portal do Cliente
            </p>
            <h2 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
              {selection ? "Selecione a organização" : "Acesse sua conta"}
            </h2>
            {selection ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Escolha o cliente que deseja acessar nesta sessão.
              </p>
            ) : null}
          </div>

          {internalSessionBlocked ? (
            <PortalAlert>
              A sessão atual não possui acesso ao Portal do Cliente. Informe as credenciais de um
              usuário autorizado.
            </PortalAlert>
          ) : null}

          {error ? (
            <div ref={errorRef} tabIndex={-1} className="mb-5" role="alert">
              <PortalAlert>{error}</PortalAlert>
            </div>
          ) : null}

          {selection ? (
            <form onSubmit={handleSelection} className="space-y-4">
              <div className="space-y-2">
                {(selection.destinations ?? []).map((destination) => (
                  <label
                    key={destination.selectionId}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                      selectedAccessId === destination.selectionId
                        ? "border-[#176ef2] bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-slate-50/70 hover:border-blue-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="portal-destination"
                      className="sr-only"
                      value={destination.selectionId}
                      checked={selectedAccessId === destination.selectionId}
                      onChange={() => setSelectedAccessId(destination.selectionId)}
                    />
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#176ef2] shadow-sm">
                      <Building2 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {destination.customer?.name ?? destination.tenant.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {destination.tenant.name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <PortalSubmitButton loading={loading} disabled={!selectedAccessId}>
                Continuar
              </PortalSubmitButton>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <PortalField label="Login" htmlFor="portal-login">
                <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="portal-login"
                  type="text"
                  value={login}
                  onChange={(event) => setLogin(event.target.value.toLowerCase())}
                  placeholder="Informe seu usuário"
                  autoComplete="username"
                  className="h-13 w-full rounded-xl border border-slate-200 bg-[#f8fbff] pl-12 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#176ef2] focus:ring-4 focus:ring-blue-100"
                  required
                  autoFocus
                />
              </PortalField>
              <PortalField label="Senha" htmlFor="portal-password">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="portal-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Informe sua senha"
                  autoComplete="current-password"
                  className="h-13 w-full rounded-xl border border-slate-200 bg-[#f8fbff] pl-12 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#176ef2] focus:ring-4 focus:ring-blue-100"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-[#176ef2]"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </PortalField>
              <PortalSubmitButton loading={loading}>Entrar no Portal</PortalSubmitButton>
            </form>
          )}

          <p className="mt-7 border-t border-slate-100 pt-5 text-center text-xs text-slate-400">
            V 1.0
          </p>
        </section>
      </div>
    </main>
  );
}

function CustomerPortalActivationPage({
  preview,
  error,
  errorRef,
  password,
  confirmation,
  showPassword,
  showConfirmation,
  loading,
  onPassword,
  onConfirmation,
  onTogglePassword,
  onToggleConfirmation,
  onSubmit,
}: {
  preview: ApiInvitationPreview | null;
  error: string | null;
  errorRef: React.RefObject<HTMLDivElement | null>;
  password: string;
  confirmation: string;
  showPassword: boolean;
  showConfirmation: boolean;
  loading: boolean;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmation: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const portalName = preview?.contact?.customer?.name ?? preview?.tenant.name;
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-white px-4 py-8 text-[#071535] sm:px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -bottom-80 -left-72 h-[44rem] w-[44rem] rounded-full bg-[#e8f4ff]" />
        <div className="absolute -right-72 -top-80 h-[46rem] w-[46rem] rounded-full bg-[#eef7ff]" />
        <div className="absolute -right-52 top-[10%] h-[38rem] w-[38rem] rounded-full border-2 border-[#a9ccff]/35" />
      </div>

      <section className="relative z-10 w-full max-w-[466px] rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_rgba(31,78,140,0.14)] sm:p-8">
        <div className="mb-6 flex items-center justify-center gap-3" aria-label="Trixus">
          <img src="/trixus-logo.png" alt="" className="h-9 w-12 object-contain" />
          <span className="text-2xl font-bold tracking-[-0.03em]">Trixus</span>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Ativar meu acesso</h1>
          <p className="mt-2 text-sm text-slate-500 sm:text-base">
            Você recebeu um convite para o portal da
            {portalName ? (
              <>
                {" "}
                <strong className="text-[#071535]">{portalName}</strong>
              </>
            ) : (
              " sua empresa"
            )}
            .
          </p>
        </div>

        {error ? (
          <div ref={errorRef} tabIndex={-1} className="mt-5" role="alert">
            <PortalAlert>{error}</PortalAlert>
          </div>
        ) : null}

        <div className="mt-6">
          <ActivationForm
            preview={preview}
            password={password}
            confirmation={confirmation}
            showPassword={showPassword}
            showConfirmation={showConfirmation}
            loading={loading}
            onPassword={onPassword}
            onConfirmation={onConfirmation}
            onTogglePassword={onTogglePassword}
            onToggleConfirmation={onToggleConfirmation}
            onSubmit={onSubmit}
          />
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">
          Após ativar, você poderá abrir e acompanhar seus chamados.
        </p>
      </section>
    </main>
  );
}

function ActivationForm({
  preview,
  password,
  confirmation,
  showPassword,
  showConfirmation,
  loading,
  onPassword,
  onConfirmation,
  onTogglePassword,
  onToggleConfirmation,
  onSubmit,
}: {
  preview: ApiInvitationPreview | null;
  password: string;
  confirmation: string;
  showPassword: boolean;
  showConfirmation: boolean;
  loading: boolean;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmation: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {preview?.contact ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-[#f8fbff] p-4 text-sm sm:p-5">
          <ActivationInfoRow icon={UserRound} label="Nome" value={preview.contact.name} />
          <ActivationInfoRow icon={AtSign} label="Login" value={activationLogin(preview)} />
          <ActivationInfoRow
            icon={BadgeCheck}
            label="Perfil"
            value={activationProfileLabel(preview.profile)}
          />
          <ActivationInfoRow
            icon={Network}
            label="Departamento"
            value={preview.contact.department?.name ?? "—"}
          />
          <ActivationInfoRow
            icon={Building2}
            label="Filial"
            value={preview.contact.branch?.name ?? "—"}
          />
        </div>
      ) : null}
      <PasswordField
        id="portal-activation-password"
        label="Criar senha"
        value={password}
        show={showPassword}
        placeholder="Digite sua senha"
        onChange={onPassword}
        onToggle={onTogglePassword}
      />
      <PasswordField
        id="portal-activation-confirmation"
        label="Confirmar senha"
        value={confirmation}
        show={showConfirmation}
        placeholder="Digite sua senha novamente"
        onChange={onConfirmation}
        onToggle={onToggleConfirmation}
      />
      <PortalSubmitButton loading={loading}>Ativar acesso</PortalSubmitButton>
    </form>
  );
}

function ActivationInfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_minmax(7rem,0.7fr)_minmax(0,1fr)] items-center gap-3">
      <Icon className="h-5 w-5 text-[#19345f]" aria-hidden={true} />
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words font-semibold text-[#071535]">{value}</span>
    </div>
  );
}

function activationLogin(preview: ApiInvitationPreview) {
  return preview.login?.trim() || preview.email?.trim() || "—";
}

function activationProfileLabel(profile: string) {
  return CUSTOMER_PORTAL_PROFILE_LABELS[profile] ?? profile;
}

function PasswordField({
  id,
  label,
  value,
  show,
  placeholder,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  show: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <PortalField label={label} htmlFor={id}>
      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className="h-13 w-full rounded-xl border border-slate-200 bg-[#f8fbff] pl-12 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#176ef2] focus:ring-4 focus:ring-blue-100"
        required
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-[#176ef2]"
        aria-label={show ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </PortalField>
  );
}

function PortalField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-[#19345f]">
        {label}
      </label>
      <div className="relative">{children}</div>
    </div>
  );
}

function PortalSubmitButton({
  loading,
  disabled = false,
  children,
}: {
  loading: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      disabled={loading || disabled}
      className="!h-13 w-full !rounded-xl bg-gradient-to-r from-[#0e55ef] via-[#176ef2] to-[#37b4e8] font-semibold text-white shadow-[0_12px_28px_rgba(23,110,242,0.24)] hover:brightness-105"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" /> : children}
    </Button>
  );
}

function PortalAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
      {children}
    </div>
  );
}

function portalErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Não foi possível acessar o Portal do Cliente. Verifique suas credenciais.";
}

function emptyTicketSearch() {
  return { conversationId: undefined, ticketId: undefined, aiExecutionId: undefined };
}
