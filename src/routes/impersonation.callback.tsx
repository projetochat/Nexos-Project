import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Alert, Card, LogoMark } from "@/components/ui-kit";
import { exchangeImpersonationHandoff } from "@/lib/trixus-api";
import { tenantHomeForPermissions, useSession } from "@/lib/session";

export const Route = createFileRoute("/impersonation/callback")({
  head: () => ({ meta: [{ title: "Acesso seguro | Trixus" }] }),
  component: ImpersonationCallbackPage,
});

function ImpersonationCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const verifier = new URLSearchParams(url.hash.slice(1)).get("verifier");
    window.history.replaceState(null, "", "/impersonation/callback");
    if (!code || !verifier) {
      setError("Este acesso é inválido ou já expirou. Inicie novamente pelo Platform.");
      return;
    }
    exchangeImpersonationHandoff(code, verifier)
      .then(({ user, impersonation }) => {
        useSession.setState({
          user,
          impersonating: {
            sessionId: impersonation.id,
            empresaId: impersonation.tenant.id,
            empresaNome: impersonation.tenant.name,
            membershipId: impersonation.membershipId,
            expiresAt: impersonation.expiresAt,
            actorName: impersonation.actorUser.name,
            actorEmail: impersonation.actorUser.email,
          },
          hydrated: true,
          error: null,
        });
        navigate({ to: tenantHomeForPermissions(user.permissions) as never, replace: true });
      })
      .catch(() => {
        setError("Não foi possível concluir o acesso. Inicie novamente pelo Platform.");
      });
  }, [navigate]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <LogoMark size={40} />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Acesso seguro ao tenant</h1>
        {error ? (
          <div className="mt-4 text-left">
            <Alert tone="destructive" title="Acesso não concluído">
              {error}
            </Alert>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Validando sua autorização…</p>
        )}
      </Card>
    </main>
  );
}
