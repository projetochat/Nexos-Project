"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Headphones,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Tag,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, closeButtonClassName } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export type DeletionDependencyOperation = "unlink" | "reassign" | "delete";

export type DeletionImpactItem = {
  id: string;
  label: string;
  description?: string;
};

export type DeletionDependency = {
  id: string;
  label: string;
  count: number;
  operation: DeletionDependencyOperation;
  /** Text supplied by the domain, for example "Serão reassociados ao atendimento geral". */
  operationLabel: string;
  items?: DeletionImpactItem[];
  hasMore?: boolean;
};

export type DeletionConsequence = {
  id: string;
  text: string;
  irreversible: boolean;
};

export type DeletionConfirmationPolicy = {
  level: "standard";
  confirmLabel: string;
};

/**
 * Domain-owned deletion preflight. All record data, counts and consequences must
 * come from the backend; the shared component only presents this contract.
 */
export type DeletionImpactPreview = {
  snapshotToken: string;
  title: string;
  prompt: string;
  record: {
    name: string;
    identifiers: Array<{ label: string; value: string }>;
  };
  dependencies: DeletionDependency[];
  consequences: DeletionConsequence[];
  confirmation: DeletionConfirmationPolicy;
  blockedReason?: string;
};

export type DeletionConfirmationResult =
  | { status: "deleted" }
  | {
      status: "changed";
      impact: DeletionImpactPreview;
      message?: string;
    };

type DeletionConfirmDialogProps = {
  open: boolean;
  variant?: "default" | "compact";
  compactDescription?: React.ReactNode;
  confirmLabel?: string;
  /** Stable domain + record key. Changing it reloads an open dialog. */
  resourceKey: string;
  onOpenChange: (open: boolean) => void;
  loadImpact: (signal: AbortSignal) => Promise<DeletionImpactPreview>;
  onConfirm: (input: {
    snapshotToken: string;
    signal: AbortSignal;
  }) => Promise<DeletionConfirmationResult>;
  onDeleted?: () => void;
  formatError?: (error: unknown) => string;
};

const defaultError = () => "Não foi possível atualizar os dados. Tente novamente.";

type DialogError = {
  kind: "load" | "verify" | "submit";
  message: string;
};

export function DeletionConfirmDialog({
  open,
  variant = "default",
  compactDescription,
  confirmLabel,
  resourceKey,
  onOpenChange,
  loadImpact,
  onConfirm,
  onDeleted,
  formatError = defaultError,
}: DeletionConfirmDialogProps) {
  const compact = variant === "compact";
  const [impact, setImpact] = React.useState<DeletionImpactPreview | null>(null);
  const [phase, setPhase] = React.useState<
    "idle" | "loading" | "refreshing" | "verifying" | "submitting"
  >("idle");
  const [error, setError] = React.useState<DialogError | null>(null);
  const [changedMessage, setChangedMessage] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const requestController = React.useRef<AbortController | null>(null);
  const submitController = React.useRef<AbortController | null>(null);
  const busyRef = React.useRef(false);
  const loadImpactRef = React.useRef(loadImpact);
  const onConfirmRef = React.useRef(onConfirm);
  const resourceKeyRef = React.useRef(resourceKey);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    loadImpactRef.current = loadImpact;
  }, [loadImpact]);

  React.useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  resourceKeyRef.current = resourceKey;

  const setBusy = React.useCallback((busy: boolean) => {
    busyRef.current = busy;
  }, []);

  const replaceImpact = React.useCallback((next: DeletionImpactPreview) => {
    setImpact(next);
  }, []);

  const requestImpact = React.useCallback(
    async (mode: "initial" | "refresh") => {
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setError(null);
      setChangedMessage(null);
      setPhase(mode === "initial" ? "loading" : "refreshing");
      setBusy(true);
      try {
        const next = await loadImpactRef.current(controller.signal);
        if (controller.signal.aborted) return;
        replaceImpact(next);
        setAnnouncement(
          mode === "initial" ? "Dependências carregadas." : "Dependências atualizadas.",
        );
        setPhase("idle");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError({ kind: "load", message: formatError(loadError) });
        setPhase("idle");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [formatError, replaceImpact, setBusy],
  );

  React.useEffect(() => {
    if (!open) {
      requestController.current?.abort();
      submitController.current?.abort();
      setImpact(null);
      setError(null);
      setChangedMessage(null);
      setAnnouncement("");
      setPhase("idle");
      setBusy(false);
      return;
    }
    submitController.current?.abort();
    setImpact(null);
    setError(null);
    setChangedMessage(null);
    void requestImpact("initial");
    return () => requestController.current?.abort();
  }, [open, requestImpact, resourceKey, setBusy]);

  React.useEffect(
    () => () => {
      requestController.current?.abort();
      submitController.current?.abort();
    },
    [],
  );

  const isBusy = phase !== "idle";
  const isCommitting = phase === "submitting";
  const showChangedImpact = React.useCallback(
    (next: DeletionImpactPreview, message?: string) => {
      replaceImpact(next);
      setChangedMessage(
        message ??
          "Os vínculos mudaram desde que este diálogo foi aberto. Revise os dados atualizados antes de confirmar novamente.",
      );
      setAnnouncement("Os vínculos foram atualizados. Revise os novos dados.");
      setError(null);
      window.requestAnimationFrame(() => cancelRef.current?.focus({ preventScroll: true }));
    },
    [replaceImpact],
  );

  const handleConfirm = async () => {
    if (!impact || impact.blockedReason || busyRef.current) return;
    const controller = new AbortController();
    const operationResourceKey = resourceKeyRef.current;
    const confirmForResource = onConfirmRef.current;
    let reachedCommit = false;
    submitController.current = controller;
    setBusy(true);
    setError(null);
    setChangedMessage(null);
    setPhase("verifying");
    try {
      const latest = await loadImpactRef.current(controller.signal);
      if (controller.signal.aborted || operationResourceKey !== resourceKeyRef.current) return;
      if (latest.snapshotToken !== impact.snapshotToken) {
        showChangedImpact(latest);
        return;
      }

      reachedCommit = true;
      setPhase("submitting");
      const result = await confirmForResource({
        snapshotToken: latest.snapshotToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted || operationResourceKey !== resourceKeyRef.current) return;
      if (result.status === "changed") {
        showChangedImpact(result.impact, result.message);
        return;
      }

      onOpenChange(false);
      onDeleted?.();
    } catch (submitError) {
      if (!controller.signal.aborted) {
        setError({
          kind: reachedCommit ? "submit" : "verify",
          message: formatError(submitError),
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setPhase("idle");
        setBusy(false);
      }
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isCommitting) return;
    onOpenChange(nextOpen);
  };

  const statusText =
    phase === "loading"
      ? "Carregando dependências…"
      : phase === "refreshing"
        ? "Atualizando dependências…"
        : phase === "verifying"
          ? "Verificando se os vínculos mudaram…"
          : phase === "submitting"
            ? "Excluindo…"
            : null;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        aria-busy={isBusy}
        overlayClassName="z-[290]"
        className={cn(
          "z-[300] flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl",
          compact ? "max-w-sm" : "max-w-md",
        )}
        onEscapeKeyDown={(event) => {
          if (isCommitting) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => cancelRef.current?.focus({ preventScroll: true }));
        }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <AlertDialogTitle className="min-w-0 flex-1 text-base leading-6">
            {impact?.title ?? "Confirmar exclusão"}
          </AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Confirme os dados e os vínculos afetados antes de excluir.
          </AlertDialogDescription>
          <AlertDialogCancel
            aria-label="Fechar"
            disabled={isCommitting}
            className={cn(closeButtonClassName, "mt-0 min-h-0")}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </AlertDialogCancel>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {statusText ?? announcement}
          </div>

          {phase === "loading" && !impact ? (
            <LoadingState compact={compact} />
          ) : error && !impact ? (
            <ErrorState
              title="Não foi possível carregar os dados"
              error={error.message}
              actionLabel="Tentar novamente"
              onRetry={() => void requestImpact("initial")}
            />
          ) : impact ? (
            <div className="space-y-3 text-sm text-foreground">
              <section className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive",
                    "h-9 w-9 rounded-lg",
                  )}
                >
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0 pt-1">
                  <p className="text-muted-foreground">
                    {compact ? (compactDescription ?? impact.prompt) : impact.prompt}
                  </p>
                  {!compact && (
                    <>
                      {!impact.prompt.includes(impact.record.name) && (
                        <p className="mt-1 font-semibold">Nome: &quot;{impact.record.name}&quot;</p>
                      )}
                      {impact.record.identifiers.map((identifier) => (
                        <p
                          key={`${identifier.label}:${identifier.value}`}
                          className="mt-0.5 break-words font-semibold"
                        >
                          {identifier.label}: {identifier.value}
                        </p>
                      ))}
                    </>
                  )}
                </div>
              </section>

              {changedMessage && (
                <StatusCard tone="warning" title="Dependências atualizadas">
                  {changedMessage}
                </StatusCard>
              )}

              {impact.blockedReason && (
                <StatusCard tone="warning" title="Exclusão bloqueada">
                  {impact.blockedReason}
                </StatusCard>
              )}

              {error && (
                <ErrorState
                  title={
                    error.kind === "submit"
                      ? "Não foi possível confirmar o resultado da exclusão"
                      : "Não foi possível verificar os vínculos"
                  }
                  error={error.message}
                  actionLabel="Atualizar dados"
                  onRetry={() => void requestImpact("refresh")}
                  compact
                />
              )}

              {!compact && impact.dependencies.length > 0 && (
                <section className="overflow-hidden rounded-xl border border-border bg-surface-1 px-4">
                  <ul className="divide-y divide-border">
                    {impact.dependencies.map((dependency) => (
                      <DependencyRow
                        key={dependency.id}
                        dependency={dependency}
                        contextTitle={impact.title}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {!compact && impact.consequences.length > 0 && (
                <section
                  aria-label="Consequências da exclusão"
                  className="rounded-xl border border-destructive/25 bg-destructive/10 p-3.5"
                >
                  <ul className="space-y-2">
                    {impact.consequences.map((consequence) => (
                      <li key={consequence.id} className="flex items-start gap-3 text-sm">
                        <AlertCircle
                          aria-hidden="true"
                          className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                        />
                        <span>{consequence.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-1 px-4 py-3 sm:flex-row sm:justify-end">
          <AlertDialogCancel
            ref={cancelRef}
            disabled={isCommitting}
            className="mt-0 h-8 w-full rounded-lg sm:w-auto sm:min-w-20"
          >
            Cancelar
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8 w-full rounded-lg whitespace-normal sm:w-auto sm:min-w-20"
            disabled={
              !impact ||
              isBusy ||
              error?.kind === "submit" ||
              !!(error && !impact) ||
              !!impact.blockedReason
            }
            onClick={() => void handleConfirm()}
          >
            {isBusy && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {phase === "verifying"
              ? "Verificando…"
              : phase === "submitting"
                ? "Excluindo…"
                : impact?.blockedReason
                  ? "Exclusão bloqueada"
                  : (confirmLabel ?? impact?.confirmation.confirmLabel ?? "Excluir")}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LoadingState({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact ? "min-h-24" : "min-h-48",
      )}
      role="status"
    >
      <LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
      <div>
        <p className="font-medium text-foreground">Carregando dependências</p>
        <p className="mt-1 text-sm text-muted-foreground">
          A exclusão ficará disponível após a verificação.
        </p>
      </div>
    </div>
  );
}

function ErrorState({
  title,
  error,
  actionLabel,
  onRetry,
  compact = false,
}: {
  title: string;
  error: string;
  actionLabel: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-destructive/30 bg-destructive/10 p-3.5",
        !compact && "my-8 text-center",
      )}
    >
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={onRetry}>
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        {actionLabel}
      </Button>
    </div>
  );
}

function StatusCard({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone: "warning";
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border p-3.5",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10",
      )}
    >
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function DependencyRow({
  dependency,
  contextTitle,
}: {
  dependency: DeletionDependency;
  contextTitle: string;
}) {
  const Icon = dependencyIcon(dependency.id, dependency.label, contextTitle);
  return (
    <li className="flex min-h-12 items-center gap-3 py-3">
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 font-medium">{dependency.label}</span>
      <span className="font-semibold tabular-nums">{dependency.count}</span>
    </li>
  );
}

function dependencyIcon(id: string, label: string, contextTitle: string) {
  const value = `${id} ${label}`.toLowerCase();
  if (contextTitle.toLowerCase().includes("etiqueta")) return Tag;
  if (value.includes("perfil")) return ShieldCheck;
  if (value.includes("atendente"))
    return contextTitle.toLowerCase().includes("perfil") ? UsersRound : Headphones;
  if (value.includes("empresa")) return Building2;
  if (value.includes("etiqueta")) return Tag;
  if (value.includes("contato")) return UserRound;
  if (value.includes("conversa") || value.includes("histórico")) return MessageCircle;
  return UsersRound;
}
