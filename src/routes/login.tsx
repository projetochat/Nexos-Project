import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { LogoMark, Button, Field, Input } from "@/components/ui-kit";
import { healthCheck, type NexosHealth } from "@/lib/nexos-api";
import { currentRoleHome, signIn, useSession, type Role } from "@/lib/session";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar - Nexo" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const { resolved, toggle } = useTheme();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [health, setHealth] = React.useState<NexosHealth | null>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (user) navigate({ to: currentRoleHome(user.role) as never });
  }, [user, navigate]);

  React.useEffect(() => {
    let cancelled = false;
    healthCheck().then((result) => {
      if (!cancelled) setHealth(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-20 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />

      <button
        onClick={toggle}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        aria-label="Alternar tema"
      >
        {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative mx-auto grid min-h-dvh max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="hidden flex-col justify-center lg:flex">
          <div className="mb-6 flex items-center gap-2.5">
            <LogoMark size={36} />
            <div>
              <div className="text-lg font-semibold tracking-tight">Nexo</div>
              <div className="text-xs text-muted-foreground">Atendimento com clareza</div>
            </div>
          </div>

          <h2 className="text-3xl font-semibold tracking-tight">Acesse o ambiente Nexos.</h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            A autenticacao usa a API e o banco configurados para homologacao. A sessao e validada
            antes de liberar as rotas protegidas.
          </p>

          <div className="mt-8 max-w-md rounded-lg border border-border bg-surface-1 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              {health?.database === "up" ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertCircle className="h-4 w-4 text-warning" />
              )}
              Ambiente de homologacao
            </div>
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
              <span>API: {health ? "online" : "indisponivel"}</span>
              <span>Database: {health?.database ?? "desconhecido"}</span>
              <span>Redis: {health?.redis ?? "desconhecido"}</span>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <LogoMark size={30} />
            <span className="text-lg font-semibold tracking-tight">Nexo</span>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-elevated">
            <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Ambiente de homologacao
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Entrar no Nexos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use uma conta ativa vinculada a uma organizacao de homologacao.
            </p>

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <Field label="E-mail">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@exemplo.com"
                  autoComplete="email"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "login-error" : undefined}
                  required
                />
              </Field>

              <Field label="Senha">
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Senha"
                    autoComplete="current-password"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              {error && (
                <div
                  id="login-error"
                  ref={errorRef}
                  tabIndex={-1}
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive outline-none"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <Button variant="primary" className="w-full" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Entrando...
                  </>
                ) : (
                  <>Entrar</>
                )}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Nexo - acesso real ao ambiente configurado
          </p>
        </div>
      </div>
    </div>
  );
}

function normalizeLoginError(error: unknown) {
  if (error instanceof TypeError) {
    return "Nao foi possivel conectar a API Nexos. Verifique se o backend esta em execucao.";
  }
  return (error as Error).message || "Ocorreu um erro interno ao autenticar.";
}
