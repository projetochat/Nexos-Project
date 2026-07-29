import * as React from "react";
import { AlertTriangle, WifiOff, RefreshCcw, Sparkles, Loader2 } from "lucide-react";
import { Card, Button } from "./ui-kit";

/* ============================================================
   Nexo · Feedback primitives
   Loading, Skeletons, Errors, Empty & first-run states.
   ============================================================ */

/* Spinner */
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <Loader2
      className={`animate-spin-slow text-muted-foreground ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

/* Skeleton with shimmer */
export function Skeleton({
  className = "",
  h = "h-4",
  w = "w-full",
  rounded = "rounded-md",
}: {
  className?: string;
  h?: string;
  w?: string;
  rounded?: string;
}) {
  return <div className={`skeleton-shimmer ${h} ${w} ${rounded} ${className}`} aria-hidden />;
}

/* Full-block loader used while streaming data */
export function BlockLoader({ label = "Carregando…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground animate-fade-in-soft"
    >
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}

/* Indeterminate top progress bar */
export function TopProgress({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden">
      <div
        className="h-full w-1/3 bg-gradient-brand"
        style={{ animation: "nexo-progress-indeterminate 1.1s cubic-bezier(.4,0,.2,1) infinite" }}
      />
    </div>
  );
}

/* Determinate progress */
export function Progress({
  value,
  tone = "brand",
  className = "",
}: {
  value: number;
  tone?: "brand" | "success" | "warning" | "info";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const bg =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "info"
          ? "bg-info"
          : "bg-gradient-brand";
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${bg} transition-[width] duration-500 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* Error state */
export function ErrorState({
  title = "Não foi possível carregar",
  description = "Tivemos um problema ao buscar estes dados. Tente novamente em instantes.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="flex flex-col items-center justify-center py-14 text-center animate-fade-in">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCcw className="h-3.5 w-3.5" /> Tentar novamente
          </Button>
        </div>
      )}
    </Card>
  );
}

/* Offline banner */
export function OfflineBanner() {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs font-medium text-warning animate-fade-in-soft">
      <WifiOff className="h-3.5 w-3.5" />
      Você está sem conexão. Alterações serão sincronizadas quando voltar a ficar online.
    </div>
  );
}

/* Connection status pill (mocked realtime) */
export function ConnectionPill({ status }: { status: "live" | "reconnecting" | "offline" }) {
  const map = {
    live: { c: "bg-success", t: "text-success", label: "Tempo real" },
    reconnecting: { c: "bg-warning", t: "text-warning", label: "Reconectando…" },
    offline: { c: "bg-destructive", t: "text-destructive", label: "Offline" },
  } as const;
  const it = map[status];
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium ${it.t} md:inline-flex`}
      title="Status da conexão realtime"
    >
      <span className={`relative flex h-1.5 w-1.5 items-center justify-center`}>
        <span className={`absolute inline-flex h-full w-full rounded-full ${it.c} ${status === "live" ? "animate-pulse-ring" : ""}`} />
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${it.c}`} />
      </span>
      {it.label}
    </span>
  );
}

/* First-run onboarding card, dismissible + persistent */
export function OnboardingCard({
  storageKey,
  title,
  description,
  steps,
}: {
  storageKey: string;
  title: string;
  description: string;
  steps: string[];
}) {
  const [dismissed, setDismissed] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(storageKey) === "1");
  }, [storageKey]);
  if (dismissed) return null;
  return (
    <Card className="relative overflow-hidden border-primary/25 bg-gradient-to-br from-primary/8 via-transparent to-accent/8 animate-fade-in">
      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl" aria-hidden />
      <div className="relative flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          <ul className="mt-3 grid gap-1.5 text-sm md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s} className="flex items-start gap-2 text-muted-foreground">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => {
            window.localStorage.setItem(storageKey, "1");
            setDismissed(true);
          }}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        >
          Ocultar
        </button>
      </div>
    </Card>
  );
}

/* Table row skeleton — reusable */
export function TableRowsSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid items-center gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} h="h-3.5" w={j === 0 ? "w-3/4" : "w-1/2"} />
          ))}
        </div>
      ))}
    </div>
  );
}
