import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Headphones, Sun, Moon, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LogoMark, Button, Input, Field } from "@/components/ui-kit";
import {
  DEMO_ACCOUNTS,
  useSession,
  signIn,
  ROLE_META,
  currentRoleHome,
  type Role,
} from "@/lib/session";
import { loginWithNexosApi } from "@/lib/nexos-api";
import { useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar · Nexo" }] }),
  component: LoginPage,
});

type DemoRole = "admin" | "operator";

const ROLE_ICONS: Record<DemoRole, React.ComponentType<{ className?: string }>> = {
  admin: ShieldCheck,
  operator: Headphones,
};

const ROLE_DESCRIPTIONS: Record<DemoRole, string> = {
  admin: "Administra a operação da empresa: usuários, filas, relatórios e canais.",
  operator: "Atende clientes na Central de Atendimento em tempo real.",
};

function LoginPage() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const { resolved, toggle } = useTheme();

  const [selectedRole, setSelectedRole] = React.useState<DemoRole>("admin");
  const [email, setEmail] = React.useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = React.useState(DEMO_ACCOUNTS[0].password);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (user) navigate({ to: currentRoleHome(user.role) as never });
  }, [user, navigate]);

  React.useEffect(() => {
    const acc = DEMO_ACCOUNTS.find(
      (a) => (a.role === "admin" ? "admin" : "operator") === selectedRole,
    );
    if (acc) {
      setEmail(acc.email);
      setPassword(acc.password);
    }
  }, [selectedRole]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let u = null;
      try {
        u = await loginWithNexosApi(email, password);
        useSession.getState().loginAs(u);
      } catch (apiError) {
        console.warn("nexos api login fallback", apiError);
        await signIn(email, password);
        u = useSession.getState().user;
      }
      const role: Role = u?.role ?? "operator";
      toast.success(`Bem-vindo(a), ${u?.nome ?? ""}`);
      navigate({ to: currentRoleHome(role) as never });
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível entrar.");
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

          <h2 className="text-3xl font-semibold tracking-tight">
            Uma plataforma. <span className="text-gradient-brand">Duas experiências.</span>
          </h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Escolha um perfil de demonstração — cada um enxerga o sistema pelo ângulo do seu papel.
          </p>

          <div className="mt-8 grid gap-2">
            {(["admin", "operator"] as DemoRole[]).map((r) => {
              const Icon = ROLE_ICONS[r];
              const active = selectedRole === r;
              const label = r === "admin" ? "Administrador" : "Atendente";
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRole(r)}
                  className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-primary/60 bg-surface-1 shadow-glow"
                      : "border-border bg-surface-1/50 hover:border-border hover:bg-surface-1"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {ROLE_DESCRIPTIONS[r]}
                    </div>
                  </div>
                  <ArrowRight
                    className={`h-4 w-4 shrink-0 transition ${
                      active
                        ? "text-primary"
                        : "text-muted-foreground opacity-0 group-hover:opacity-100"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <LogoMark size={30} />
            <span className="text-lg font-semibold tracking-tight">Nexo</span>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-elevated">
            <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {selectedRole === "admin" ? ROLE_META.admin.scope : ROLE_META.operator.scope}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Entrar como {selectedRole === "admin" ? "Administrador" : "Atendente"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Credenciais demo preenchidas para o ambiente local preparado pela sprint.
            </p>

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <Field label="E-mail">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  required
                />
              </Field>
              <Field label="Senha">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </Field>

              <Button variant="primary" className="w-full" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Entrando…
                  </>
                ) : (
                  <>Entrar</>
                )}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              modo demonstração
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-2 lg:hidden">
              {(["admin", "operator"] as DemoRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRole(r)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    selectedRole === r
                      ? "border-primary/60 bg-surface-1 text-foreground"
                      : "border-border bg-surface-1/50 text-muted-foreground hover:bg-surface-1"
                  }`}
                >
                  {r === "admin" ? "Administrador" : "Atendente"}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Nexo · MVP de atendimento empresarial via WhatsApp (simulado)
          </p>
        </div>
      </div>
    </div>
  );
}
