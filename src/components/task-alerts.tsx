import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui-kit";
import { taskManagementApi } from "@/lib/task-management";
import { useSession } from "@/lib/session";
import { displayDateTime } from "@/lib/format";

/** Task popups reuse the existing authenticated shell and never navigate without a click. */
export function TaskAlerts() {
  const user = useSession((state) => state.user);
  const allowed = Boolean(user?.empresaId && user.permissions?.includes("schedules.read"));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scope = [user?.empresaId, user?.id];
  const capabilities = useQuery({
    queryKey: ["trixus", "task-management", "capabilities", user?.empresaId],
    queryFn: taskManagementApi.capabilities,
    enabled: allowed,
    staleTime: 60_000,
    retry: false,
  });
  const key = ["trixus", "task-management", "popups", ...scope];
  const popups = useQuery({
    queryKey: key,
    queryFn: taskManagementApi.popups,
    enabled: allowed && capabilities.data?.enabled === true,
    refetchInterval: 15_000,
    retry: false,
  });
  const dismiss = useMutation({
    mutationFn: taskManagementApi.dismissPopup,
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (error) =>
      toast.error((error as Error).message || "Não foi possível dispensar o aviso."),
  });
  const complete = useMutation({
    mutationFn: taskManagementApi.complete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trixus", "task-management"] }),
    onError: (error) =>
      toast.error((error as Error).message || "Não foi possível concluir a tarefa."),
  });
  const item = allowed && capabilities.data?.enabled ? popups.data?.items[0] : null;
  if (!item) return null;
  const tone =
    item.priority === "high"
      ? "border-l-red-500"
      : item.priority === "medium"
        ? "border-l-amber-500"
        : "border-l-emerald-500";
  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Lembrete de tarefa"
      className={`fixed bottom-4 right-4 z-[200] w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-border border-l-4 bg-card p-4 text-foreground shadow-elevated ${tone}`}
    >
      <div className="flex items-start gap-2">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold">{item.title}</p>
          <p className="mt-1 line-clamp-4 break-words text-xs text-muted-foreground">
            {item.description}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{displayDateTime(item.dueAt)}</p>
          {item.assignedName && (
            <p className="mt-1 text-xs text-muted-foreground">Responsável: {item.assignedName}</p>
          )}
          {!!item.recipientNames?.length && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              Vínculos: {item.recipientNames.join(", ")}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Dispensar lembrete"
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate(item.deliveryId)}
          className="rounded p-1 hover:bg-surface-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate({ to: "/agendamentos", search: { taskId: item.taskId } })}
        >
          Ver detalhes
        </Button>
        {user?.permissions?.includes("schedules.update") && (
          <Button
            size="sm"
            disabled={complete.isPending}
            onClick={() => complete.mutate(item.occurrenceId)}
          >
            Concluir
          </Button>
        )}
      </div>
    </aside>
  );
}
