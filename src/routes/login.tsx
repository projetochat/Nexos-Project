import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { currentRoleHome, signIn, useSession, type Role } from "@/lib/session";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (user) navigate({ to: currentRoleHome(user.role) as never });
  }, [user, navigate]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
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
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#071535] sm:text-4xl">
              Entrar no Trixus
            </h1>

            <form onSubmit={handleLogin} className="mt-6 space-y-4 sm:mt-7">
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
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@exemplo.com"
                  autoComplete="email"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "login-error" : undefined}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-[#eff6ff] px-4 text-sm text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:h-14 sm:text-base"
                  required
                />
              </div>

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
                    autoComplete="current-password"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-[#eff6ff] px-4 pr-12 text-sm text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:h-14 sm:text-base"
                    required
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
                  <>Entrar</>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
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
