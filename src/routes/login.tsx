import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  Network,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { Button, Field, Input } from "@/components/ui-kit";
import {
  acceptTenantInvitation,
  completeRequiredPasswordChange,
  currentRoleHome,
  signIn,
  selectTenant,
  useSession,
  type Role,
} from "@/lib/session";
import {
  invitationPreviewWithTrixusApi,
  type ApiInvitationPreview,
  type RequiredPasswordChange,
  type TenantSelectionRequired,
} from "@/lib/trixus-api";
import { currentAppSurface } from "@/lib/app-surface";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { invite, portal } = Route.useSearch() as { invite?: string; portal?: string | number };
  const user = useSession((s) => s.user);
  const surface = currentAppSurface();
  const surfaceLabel = surface === "platform" ? "Platform" : surface === "tenant" ? "Chat" : null;

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [passwordConfirmation, setPasswordConfirmation] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requiredPasswordChange, setRequiredPasswordChange] =
    React.useState<RequiredPasswordChange | null>(null);
  const [tenantSelection, setTenantSelection] = React.useState<TenantSelectionRequired | null>(
    null,
  );
  const [selectedAccessId, setSelectedAccessId] = React.useState("");
  const [tenantSelectionError, setTenantSelectionError] = React.useState<string | null>(null);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("");
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = React.useState(false);
  const [passwordChangeError, setPasswordChangeError] = React.useState<string | null>(null);
  const [invitationPreview, setInvitationPreview] = React.useState<ApiInvitationPreview | null>(
    null,
  );
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (user) navigate({ to: currentRoleHome(user.role) as never });
  }, [user, navigate]);

  React.useEffect(() => {
    if (!invite) {
      setInvitationPreview(null);
      return;
    }
    let active = true;
    invitationPreviewWithTrixusApi(invite)
      .then((preview) => {
        if (!active) return;
        setInvitationPreview(preview);
        if (preview.contact?.name) setName(preview.contact.name);
      })
      .catch((previewError) => {
        if (!active) return;
        setError(normalizeInvitationError(previewError));
      });
    return () => {
      active = false;
    };
  }, [invite]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const authenticationChallenge = await signIn(email, password);
      if (authenticationChallenge && "passwordChangeRequired" in authenticationChallenge) {
        setRequiredPasswordChange(authenticationChallenge);
        setPassword("");
        return;
      }
      if (authenticationChallenge && "tenantSelectionRequired" in authenticationChallenge) {
        setTenantSelection(authenticationChallenge);
        setSelectedAccessId("");
        return;
      }
      const sessionUser = useSession.getState().user;
      const role: Role = sessionUser?.role ?? "operator";
      toast.success(`Bem-vindo(a), ${sessionUser?.nome ?? ""}`);
      navigate({ to: currentRoleHome(role) as never });
    } catch (err) {
      const message = normalizeLoginError(err);
      setError(message);
      toast.error(message);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setLoading(false);
    }
  }

  async function handleTenantSelection(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantSelection || !selectedAccessId || loading) return;
    setTenantSelectionError(null);
    setLoading(true);
    try {
      const pendingPasswordChange = await selectTenant({
        selectionToken: tenantSelection.tenantSelectionToken,
        ...(tenantSelection.destinations?.length
          ? { selectionId: selectedAccessId }
          : { tenantId: selectedAccessId }),
      });
      setTenantSelection(null);
      setPassword("");
      if (pendingPasswordChange) {
        setRequiredPasswordChange(pendingPasswordChange);
        return;
      }
      const sessionUser = useSession.getState().user;
      toast.success(`Bem-vindo(a), ${sessionUser?.nome ?? ""}`);
      navigate({ to: currentRoleHome(sessionUser?.role) as never });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível selecionar a Tenant.";
      setTenantSelectionError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequiredPasswordChange(event: React.FormEvent) {
    event.preventDefault();
    if (!requiredPasswordChange || loading) return;
    setPasswordChangeError(null);
    if (newPassword.length < 8) {
      setPasswordChangeError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setPasswordChangeError("A nova senha deve possuir no máximo 72 bytes.");
      return;
    }
    if (newPassword === "Trixus@2026") {
      setPasswordChangeError("A nova senha deve ser diferente da senha temporária.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError("A confirmação da nova senha não confere.");
      return;
    }
    setLoading(true);
    try {
      const nextTenantSelection = await completeRequiredPasswordChange({
        setupToken: requiredPasswordChange.passwordSetupToken,
        newPassword,
        confirmPassword: confirmNewPassword,
      });
      setRequiredPasswordChange(null);
      if (nextTenantSelection) {
        toast.success("Senha alterada. Agora selecione a organização.");
        setTenantSelection(nextTenantSelection);
        setSelectedAccessId("");
        return;
      }
      toast.success("Senha alterada. Seu acesso está liberado.");
      const sessionUser = useSession.getState().user;
      navigate({ to: currentRoleHome(sessionUser?.role) as never });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível alterar a senha.";
      setPasswordChangeError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvitation(event: React.FormEvent) {
    event.preventDefault();
    if (loading || !invite) return;
    setError(null);
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("As senhas informadas não são iguais.");
      return;
    }
    setLoading(true);
    try {
      await acceptTenantInvitation({ token: invite, password, name: name.trim() || undefined });
      const sessionUser = useSession.getState().user;
      toast.success(
        invitationPreview?.contact
          ? "Acesso ao portal ativado."
          : "Senha definida e acesso de administrador ativado.",
      );
      navigate({ to: currentRoleHome(sessionUser?.role) as never });
    } catch (err) {
      const message = normalizeInvitationError(err);
      setError(message);
      toast.error(message);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setLoading(false);
    }
  }

  const isCustomerPortalInvitation = Boolean(invitationPreview?.contact) || String(portal) === "1";

  if (invite && isCustomerPortalInvitation) {
    const contact = invitationPreview?.contact;
    const loginLabel = invitationPreview?.email.includes("@") ? "E-mail" : "Login";
    const summaryRows = contact
      ? [
          { label: "Nome", value: contact.name, icon: UserRound },
          { label: loginLabel, value: invitationPreview?.email ?? "—", icon: Mail },
          {
            label: "Perfil",
            value: invitationProfileLabel(invitationPreview?.profile ?? ""),
            icon: UsersRound,
          },
          { label: "Departamento", value: contact.department?.name ?? "—", icon: Network },
          { label: "Filial", value: contact.branch?.name ?? "—", icon: Building2 },
        ]
      : [];

    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden bg-white px-4 py-8 text-[#071535] sm:px-6">
        <section className="relative w-full max-w-[690px] rounded-2xl border border-slate-200/90 bg-white/95 px-5 py-7 shadow-[0_22px_64px_rgba(15,42,90,0.14)] backdrop-blur sm:px-9 sm:py-9">
          <div className="flex items-center justify-center gap-3" aria-label="Trixus">
            <img src="/trixus-logo.png" alt="" className="h-10 w-10 object-contain" />
            <span className="text-2xl font-bold tracking-tight text-[#071535]">Trixus</span>
          </div>

          <header className="mt-5 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-[#071535] sm:text-4xl">
              Ativar meu acesso
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">
              Você recebeu um convite para o portal da{" "}
              <strong className="font-semibold text-[#071535]">
                {contact?.customer?.name ?? invitationPreview?.tenant.name ?? "empresa"}
              </strong>
              .
            </p>
          </header>

          {summaryRows.length > 0 ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-[#f7faff] px-4 py-3 sm:px-5">
              {summaryRows.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="grid grid-cols-[1.25rem_7.25rem_minmax(0,1fr)] items-center gap-3 py-2 text-sm sm:grid-cols-[1.5rem_8rem_minmax(0,1fr)] sm:text-base"
                >
                  <Icon className="h-5 w-5 text-[#071535]" aria-hidden="true" />
                  <span className="text-slate-500">{label}</span>
                  <span className="min-w-0 break-words font-semibold text-[#071535]">{value}</span>
                </div>
              ))}
            </div>
          ) : null}

          <form onSubmit={handleInvitation} className="mt-6 space-y-4">
            <div>
              <label htmlFor="portal-password" className="mb-1.5 block text-sm font-semibold">
                Criar senha
              </label>
              <div className="relative">
                <input
                  id="portal-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="new-password"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "portal-invitation-error" : undefined}
                  className="h-13 w-full rounded-lg border border-slate-300 bg-white px-4 pr-12 text-sm text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:text-base"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 transition hover:bg-blue-50 hover:text-[#071535]"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="portal-password-confirmation"
                className="mb-1.5 block text-sm font-semibold"
              >
                Confirmar senha
              </label>
              <div className="relative">
                <input
                  id="portal-password-confirmation"
                  type={showPasswordConfirmation ? "text" : "password"}
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  placeholder="Digite sua senha novamente"
                  autoComplete="new-password"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "portal-invitation-error" : undefined}
                  className="h-13 w-full rounded-lg border border-slate-300 bg-white px-4 pr-12 text-sm text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:text-base"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirmation((value) => !value)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 transition hover:bg-blue-50 hover:text-[#071535]"
                  aria-label={
                    showPasswordConfirmation ? "Ocultar confirmação" : "Mostrar confirmação"
                  }
                >
                  {showPasswordConfirmation ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <div
                id="portal-invitation-error"
                ref={errorRef}
                tabIndex={-1}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 outline-none"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <button
              className="flex h-13 w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#0e55ef] via-[#176ef2] to-[#168ff0] text-sm font-semibold text-white shadow-[0_8px_18px_rgba(23,105,238,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Ativando...
                </>
              ) : (
                "Ativar acesso"
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            Após ativar, você poderá abrir e acompanhar seus chamados.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#f8fbff] text-[#071535]">
      <div
        className="pointer-events-none absolute inset-0 hidden bg-cover bg-center lg:block"
        style={{ backgroundImage: "url('/login-desktop-background.png')" }}
      />
      <div className="pointer-events-none absolute inset-0 hidden bg-white/10 lg:block" />
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center lg:hidden"
        style={{ backgroundImage: "url('/login-mobile-background.png')" }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 bg-white/20 lg:hidden" />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1320px] grid-rows-[minmax(13rem,32dvh)_1fr] items-center gap-6 px-4 py-5 sm:grid-rows-[minmax(15rem,34dvh)_1fr] sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)] lg:grid-rows-none lg:px-10 lg:py-8 xl:gap-14">
        <div className="hidden lg:block" aria-hidden="true" />

        <div className="row-start-2 mx-auto mt-4 w-full max-w-[420px] self-start lg:col-start-2 lg:row-auto lg:mt-0 lg:max-w-[460px] lg:self-center">
          <div className="login-bank-gothic rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-[0_18px_52px_rgba(15,42,90,0.13)] backdrop-blur sm:p-7 lg:rounded-[1.5rem] lg:p-8">
            {surfaceLabel && !invite && (
              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                {surfaceLabel}
              </span>
            )}
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#071535] sm:text-4xl">
              {invite
                ? invitationPreview?.contact
                  ? "Ativar meu acesso"
                  : "Defina sua senha"
                : "Entrar no Trixus"}
            </h1>

            {invite && (
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {invitationPreview?.contact
                  ? `Você recebeu um convite para o portal da ${invitationPreview.contact.customer?.name ?? invitationPreview.tenant.name}.`
                  : "Conclua o convite para acessar sua organização como administrador."}
              </p>
            )}

            {invite && invitationPreview?.contact && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-[#f7faff] p-4 text-sm">
                {[
                  ["Nome", invitationPreview.contact.name],
                  ["E-mail", invitationPreview.email],
                  ["Perfil", invitationProfileLabel(invitationPreview.profile)],
                  ["Departamento", invitationPreview.contact.department?.name ?? "—"],
                  ["Filial", invitationPreview.contact.branch?.name ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-[#071535]">{value}</span>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={invite ? handleInvitation : handleLogin}
              className="mt-6 space-y-4 sm:mt-7"
            >
              {invite && !invitationPreview?.contact ? (
                <div>
                  <label
                    htmlFor="name"
                    className="mb-1.5 block text-sm font-semibold text-slate-500"
                  >
                    Nome
                  </label>
                  <input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Seu nome"
                    autoComplete="name"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-[#eff6ff] px-4 text-sm text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:h-14 sm:text-base"
                  />
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-semibold text-slate-500"
                  >
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value.toLocaleLowerCase("en-US"))}
                    placeholder="email@exemplo.com"
                    autoComplete="email"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-[#eff6ff] px-4 text-sm text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:h-14 sm:text-base"
                    required
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-semibold text-slate-500"
                >
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Senha"
                    autoComplete={invite ? "new-password" : "current-password"}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-[#eff6ff] px-4 pr-12 text-sm text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:h-14 sm:text-base"
                    required
                    minLength={invite ? 8 : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-[#071535]"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {invite && (
                <div>
                  <label
                    htmlFor="password-confirmation"
                    className="mb-1.5 block text-sm font-semibold text-slate-500"
                  >
                    Confirmar senha
                  </label>
                  <input
                    id="password-confirmation"
                    type={showPassword ? "text" : "password"}
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-[#eff6ff] px-4 text-sm text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:h-14 sm:text-base"
                    required
                    minLength={8}
                  />
                </div>
              )}

              {error && (
                <div
                  id="login-error"
                  ref={errorRef}
                  tabIndex={-1}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 outline-none"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <button
                className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0e55ef] via-[#176ef2] to-[#37b4e8] text-sm font-semibold text-white shadow-[0_8px_18px_rgba(23,105,238,0.25)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 sm:h-14 sm:text-base"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Entrando...
                  </>
                ) : (
                  <>
                    {invite
                      ? invitationPreview?.contact
                        ? "Ativar acesso"
                        : "Definir senha e acessar"
                      : "Entrar"}
                  </>
                )}
              </button>
            </form>
            <p className="mt-5 border-t border-slate-200 pt-4 text-center text-[11px] font-semibold tracking-[0.16em] text-slate-400">
              V 1.0
            </p>
          </div>
        </div>
      </div>
      <Modal
        open={Boolean(requiredPasswordChange)}
        onClose={() => undefined}
        title="Defina uma nova senha"
        description="Este é seu primeiro acesso. Troque a senha temporária para continuar."
        size="sm"
        dismissible={false}
        closeOnBackdrop={false}
        initialFocus="#required-new-password"
      >
        <form onSubmit={handleRequiredPasswordChange} className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <LockKeyhole className="h-4 w-4 text-primary" /> Troca obrigatória
            </div>
            <p className="mt-1">
              Nenhuma área da organização será liberada antes da definição da nova senha.
            </p>
          </div>
          <Field label="Nova senha *">
            <div className="relative">
              <Input
                id="required-new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                className="pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((value) => !value)}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                aria-label={showNewPassword ? "Ocultar nova senha" : "Mostrar nova senha"}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Confirmar senha *">
            <div className="relative">
              <Input
                type={showConfirmNewPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                className="pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmNewPassword((value) => !value)}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                aria-label={showConfirmNewPassword ? "Ocultar confirmação" : "Mostrar confirmação"}
              >
                {showConfirmNewPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </Field>
          {passwordChangeError && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {passwordChangeError}
            </div>
          )}
          <Button type="submit" className="save-action-button w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar nova senha
          </Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(tenantSelection)}
        onClose={() => undefined}
        title="Selecione o acesso"
        description="Escolha a organização e, quando aplicável, o cliente que deseja acessar nesta sessão."
        size="md"
        dismissible={false}
        closeOnBackdrop={false}
      >
        <form onSubmit={handleTenantSelection} className="space-y-4">
          <div className="space-y-2">
            {(tenantSelection?.destinations?.length
              ? tenantSelection.destinations
              : (tenantSelection?.tenants ?? []).map((tenant) => ({
                  selectionId: tenant.id,
                  type: "tenant" as const,
                  tenant,
                  customer: undefined,
                }))
            )
              .slice()
              .sort((left, right) => {
                const leftName = left.customer?.name ?? left.tenant.name;
                const rightName = right.customer?.name ?? right.tenant.name;
                return leftName.localeCompare(rightName, "pt-BR");
              })
              .map((destination) => {
                const selected = selectedAccessId === destination.selectionId;
                const isCustomerPortal = destination.type === "customer_portal";
                return (
                  <button
                    key={destination.selectionId}
                    type="button"
                    onClick={() => setSelectedAccessId(destination.selectionId)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border bg-surface-1 hover:border-primary/40 hover:bg-surface-2"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {isCustomerPortal
                          ? (destination.customer?.name ?? "Portal do Cliente")
                          : destination.tenant.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {isCustomerPortal
                          ? `${destination.tenant.name} · Portal do Cliente`
                          : `${destination.tenant.slug} · Acesso interno`}
                      </span>
                    </span>
                    {selected && <Check className="h-5 w-5 text-primary" />}
                  </button>
                );
              })}
          </div>
          {tenantSelectionError && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {tenantSelectionError}
            </div>
          )}
          <div className="flex justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setTenantSelection(null);
                setSelectedAccessId("");
                setPassword("");
              }}
              disabled={loading}
            >
              Voltar
            </Button>
            <Button type="submit" disabled={!selectedAccessId || loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Continuar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function normalizeLoginError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (
    error instanceof TypeError ||
    /não foi possível conectar ao sistema|network error|failed to fetch/i.test(message)
  ) {
    return "Não foi possível conectar ao sistema. Verifique suas credenciais e tente novamente.";
  }
  if (/e-mail ou senha inválidos/i.test(message))
    return "E-mail ou senha incorretos. Tente novamente.";
  if (/muitas tentativas/i.test(message))
    return "Muitas tentativas de acesso. Aguarde alguns minutos antes de tentar novamente.";
  if (/organização.*inativa/i.test(message))
    return "Sua organização está inativa. Entre em contato com o administrador.";
  if (/nenhuma organização ativa/i.test(message))
    return "Seu usuário não possui acesso a uma organização ativa.";
  return (
    message || "Não foi possível concluir o acesso agora. Tente novamente em alguns instantes."
  );
}

function normalizeInvitationError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/convite inválido ou expirado/i.test(message)) {
    return "Este convite é inválido, já foi utilizado ou expirou. Solicite um novo convite.";
  }
  if (/não foi possível conectar|network error|failed to fetch/i.test(message)) {
    return "Não foi possível conectar ao sistema. Tente novamente em alguns instantes.";
  }
  return message || "Não foi possível concluir o convite agora.";
}

function invitationProfileLabel(profile: string) {
  return (
    {
      COLLABORATOR: "Colaborador",
      MANAGER: "Gerente",
      FULL_ACCESS: "Acesso full",
    }[profile] ?? profile
  );
}
