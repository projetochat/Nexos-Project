"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  Link2Off,
  LoaderCircle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, Input } from "@/components/ui-kit";
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

export type DeletionConfirmationPolicy =
  | {
      level: "standard";
      confirmLabel: string;
    }
  | {
      level: "high";
      confirmLabel: string;
      phrase: string;
      inputLabel: string;
      instruction: string;
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

const operationPresentation: Record<
  DeletionDependencyOperation,
  { label: string; icon: typeof Trash2; className: string }
> = {
  unlink: {
    label: "Desvinculação",
    icon: Link2Off,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  reassign: {
    label: "Reassociação",
    icon: ArrowRightLeft,
    className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  delete: {
    label: "Exclusão",
    icon: Trash2,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

const defaultError = () => "Não foi possível atualizar os dados. Tente novamente.";

type DialogError = {
  kind: "load" | "verify" | "submit";
  message: string;
};

export function DeletionConfirmDialog({
  open,
  resourceKey,
  onOpenChange,
  loadImpact,
  onConfirm,
  onDeleted,
  formatError = defaultError,
}: DeletionConfirmDialogProps) {
  const [impact, setImpact] = React.useState<DeletionImpactPreview | null>(null);
  const [phase, setPhase] = React.useState<
    "idle" | "loading" | "refreshing" | "verifying" | "submitting"
  >("idle");
  const [error, setError] = React.useState<DialogError | null>(null);
  const [changedMessage, setChangedMessage] = React.useState<string | null>(null);
  const [confirmationText, setConfirmationText] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [announcement, setAnnouncement] = React.useState("");
  const requestController = React.useRef<AbortController | null>(null);
  const submitController = React.useRef<AbortController | null>(null);
  const busyRef = React.useRef(false);
  const loadImpactRef = React.useRef(loadImpact);
  const onConfirmRef = React.useRef(onConfirm);
  const resourceKeyRef = React.useRef(resourceKey);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const listIdPrefix = React.useId();

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
    setConfirmationText("");
    setExpanded(new Set());
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
      setConfirmationText("");
      setExpanded(new Set());
      setAnnouncement("");
      setPhase("idle");
      setBusy(false);
      return;
    }
    submitController.current?.abort();
    setImpact(null);
    setError(null);
    setChangedMessage(null);
    setConfirmationText("");
    setExpanded(new Set());
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
  const highImpact = impact?.confirmation.level === "high" ? impact.confirmation : null;
  const hasValidReinforcedPhrase = !highImpact || highImpact.phrase.trim().length > 0;
  const reinforcedConfirmationMatches =
    hasValidReinforcedPhrase && (!highImpact || confirmationText === highImpact.phrase);

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
    if (!impact || busyRef.current || !reinforcedConfirmationMatches) return;
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
        className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
        onEscapeKeyDown={(event) => {
          if (isCommitting) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => cancelRef.current?.focus({ preventScroll: true }));
        }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle className="text-base leading-6 sm:text-lg">
                {impact?.title ?? "Confirmar exclusão"}
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-0.5 text-xs text-muted-foreground">
                Revise o registro e os vínculos afetados antes de continuar.
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogCancel
            aria-label="Fechar"
            disabled={isCommitting}
            className="mt-0 h-11 w-11 shrink-0 rounded-lg p-0"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </AlertDialogCancel>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {statusText ?? announcement}
          </div>

          {phase === "loading" && !impact ? (
            <LoadingState />
          ) : error && !impact ? (
            <ErrorState
              title="Não foi possível carregar os dados"
              error={error.message}
              actionLabel="Tentar novamente"
              onRetry={() => void requestImpact("initial")}
            />
          ) : impact ? (
            <div className="space-y-4 text-sm text-foreground">
              <p className="text-muted-foreground">{impact.prompt}</p>

              <section
                aria-labelledby={`${listIdPrefix}-record`}
                className="rounded-xl border border-border bg-surface-1 p-3.5"
              >
                <h3 id={`${listIdPrefix}-record`} className="font-semibold text-foreground">
                  {impact.record.name}
                </h3>
                <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
                  {impact.record.identifiers.map((identifier) => (
                    <div key={`${identifier.label}:${identifier.value}`} className="min-w-0">
                      <dt className="text-muted-foreground">{identifier.label}</dt>
                      <dd className="break-words font-medium text-foreground">
                        {identifier.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              {changedMessage && (
                <StatusCard tone="warning" title="Dependências atualizadas">
                  {changedMessage}
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

              <section aria-labelledby={`${listIdPrefix}-dependencies`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 id={`${listIdPrefix}-dependencies`} className="font-semibold">
                    Vínculos afetados
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void requestImpact("refresh")}
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={cn("h-3.5 w-3.5", phase === "refreshing" && "animate-spin")}
                    />
                    Atualizar
                  </Button>
                </div>
                <ul className="space-y-2">
                  {impact.dependencies.map((dependency, index) => {
                    const rowKey = `${index}:${dependency.id}`;
                    return (
                      <DependencyRow
                        key={rowKey}
                        dependency={dependency}
                        expanded={expanded.has(rowKey)}
                        listId={`${listIdPrefix}-dependency-${index}`}
                        onToggle={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(rowKey)) next.delete(rowKey);
                            else next.add(rowKey);
                            return next;
                          })
                        }
                      />
                    );
                  })}
                </ul>
              </section>

              {impact.consequences.length > 0 && (
                <section
                  aria-labelledby={`${listIdPrefix}-consequences`}
                  className="rounded-xl border border-destructive/25 bg-destructive/10 p-3.5"
                >
                  <h3
                    id={`${listIdPrefix}-consequences`}
                    className="flex items-center gap-2 font-semibold text-foreground"
                  >
                    <AlertCircle aria-hidden="true" className="h-4 w-4 text-destructive" />
                    Consequências
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {impact.consequences.map((consequence) => (
                      <li key={consequence.id} className="flex items-start gap-2 text-sm">
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                        />
                        <span>
                          {consequence.text}
                          {consequence.irreversible && (
                            <span className="ml-2 inline-flex rounded-full border border-destructive/30 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                              Irreversível
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {highImpact && (
                <section aria-labelledby={`${listIdPrefix}-reinforced`} className="space-y-2">
                  <h3 id={`${listIdPrefix}-reinforced`} className="font-semibold">
                    Confirmação reforçada
                  </h3>
                  <p
                    id={`${listIdPrefix}-reinforced-instruction`}
                    className="text-sm text-muted-foreground"
                  >
                    {highImpact.instruction}
                  </p>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-foreground">
                      {highImpact.inputLabel}
                    </span>
                    <Input
                      autoComplete="off"
                      aria-describedby={`${listIdPrefix}-reinforced-instruction ${listIdPrefix}-reinforced-status`}
                      aria-invalid={confirmationText.length > 0 && !reinforcedConfirmationMatches}
                      spellCheck={false}
                      value={confirmationText}
                      disabled={isBusy}
                      onChange={(event) => setConfirmationText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && reinforcedConfirmationMatches && !isBusy) {
                          event.preventDefault();
                          void handleConfirm();
                        }
                      }}
                    />
                    <span
                      id={`${listIdPrefix}-reinforced-status`}
                      className="block text-xs text-muted-foreground"
                    >
                      {reinforcedConfirmationMatches
                        ? "Confirmação correspondente."
                        : !hasValidReinforcedPhrase
                          ? "A confirmação não está disponível porque o domínio não forneceu uma frase válida."
                          : "O texto deve corresponder exatamente ao valor solicitado."}
                    </span>
                  </label>
                </section>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-1 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
          <AlertDialogCancel
            ref={cancelRef}
            disabled={isCommitting}
            className="mt-0 min-h-11 w-full sm:w-auto"
          >
            Cancelar
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="min-h-11 w-full whitespace-normal sm:w-auto"
            disabled={
              !impact ||
              isBusy ||
              error?.kind === "submit" ||
              !!(error && !impact) ||
              !reinforcedConfirmationMatches
            }
            onClick={() => void handleConfirm()}
          >
            {isBusy && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {phase === "verifying"
              ? "Verificando…"
              : phase === "submitting"
                ? "Excluindo…"
                : (impact?.confirmation.confirmLabel ?? "Excluir")}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LoadingState() {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 text-center"
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
  expanded,
  listId,
  onToggle,
}: {
  dependency: DeletionDependency;
  expanded: boolean;
  listId: string;
  onToggle: () => void;
}) {
  const presentation = operationPresentation[dependency.operation];
  const Icon = presentation.icon;
  const canExpand = (dependency.items?.length ?? 0) > 0;
  const hiddenCount = Math.max(0, dependency.count - (dependency.items?.length ?? 0));

  return (
    <li className="rounded-xl border border-border bg-surface-1 p-3.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            presentation.className,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium text-foreground">{dependency.label}</p>
            <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">
              {dependency.count}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{presentation.label}:</span>{" "}
            {dependency.operationLabel}
          </p>
          {canExpand && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              onClick={onToggle}
            >
              {expanded ? "Ocultar registros" : "Ver registros"}
              <ChevronDown
                aria-hidden="true"
                className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
              />
            </button>
          )}
        </div>
      </div>
      {canExpand && expanded && (
        <div id={listId} className="mt-3 border-t border-border pt-3">
          <ul className="space-y-2">
            {dependency.items?.map((item, index) => (
              <li key={`${index}:${item.id}`} className="min-w-0 rounded-lg bg-card px-3 py-2">
                <p className="break-words text-sm font-medium text-foreground">{item.label}</p>
                {item.description && (
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {(dependency.hasMore || hiddenCount > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {hiddenCount > 0
                ? `${hiddenCount} registro(s) adicional(is) não exibido(s).`
                : "Há outros registros não exibidos."}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
