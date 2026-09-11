import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { currentRoleHome, signIn, useSession, type Role } from "@/lib/session";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar - Nexo" }] }),
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
    <div className="relative min-h-dvh overflow-hidden bg-[#f8fbff] text-[#071535]">
      <div
        className="pointer-events-none absolute inset-0 hidden bg-cover bg-center lg:block"
        style={{ backgroundImage: "url('/login-desktop-background.jpg')" }}
      />
      <div className="pointer-events-none absolute inset-0 hidden bg-white/10 lg:block" />
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center lg:hidden"
        style={{ backgroundImage: "url('/login-mobile-background.jpg')" }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 bg-white/20 lg:hidden" />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1320px] items-end gap-6 px-4 py-5 sm:items-center sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)] lg:px-10 lg:py-8 xl:gap-14">
        <div className="hidden lg:block" aria-hidden="true" />

        <div className="mx-auto w-full max-w-[420px] lg:max-w-[460px]">
          <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-[0_18px_52px_rgba(15,42,90,0.13)] backdrop-blur sm:p-7 lg:rounded-[1.5rem] lg:p-8">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 sm:text-sm">
              Ambiente de produção
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#071535] sm:text-4xl">
              Entrar no Nexus
            </h1>

            <form onSubmit={handleLogin} className="mt-6 space-y-4 sm:mt-7">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-base font-semibold text-slate-500">
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
                  className="h-12 w-full rounded-xl border border-slate-200 bg-[#eff6ff] px-4 text-base text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:h-14 sm:text-lg"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-base font-semibold text-slate-500"
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
                    className="h-12 w-full rounded-xl border border-slate-200 bg-[#eff6ff] px-4 pr-12 text-base text-[#071535] outline-none transition placeholder:text-slate-400 focus:border-blue-500 sm:h-14 sm:text-lg"
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
                className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0e55ef] via-[#176ef2] to-[#37b4e8] text-base font-semibold text-white shadow-[0_8px_18px_rgba(23,105,238,0.25)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 sm:h-14 sm:text-lg"
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
  if (error instanceof TypeError) {
    return "Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.";
  }
  return (
    (error as Error).message ||
    "Não foi possível concluir a autenticação. Tente novamente em alguns instantes."
  );
}
