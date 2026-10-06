import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import { Button, Field } from "./ui-kit";
import { ConfirmDialog, Modal } from "./modal";
import { GreetingMessageEditor } from "./greeting-message-editor";
import { schedulesApi, type QuickReplyAttachment } from "@/lib/trixus-api";
import { scheduleWritePayload, type ApiSchedule } from "@/lib/schedule-types";
import { pendingConversationSchedules, toLocalDateTimeInput } from "@/lib/schedule-message";
import {
  CONNECTION_MESSAGE_VARIABLES,
  mergeMessageVariables,
} from "@/lib/message-variable-options";
import { onRealtimeEvent } from "@/lib/realtime/client";

export function ScheduleMessageModal({
  open,
  onClose,
  conversationId,
  initialContent,
  identifier,
  customFields = [],
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  initialContent: string;
  identifier: string;
  customFields?: Array<{ label: string; variableKey: string }>;
  onSaved?: (mode: "create" | "edit") => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState(initialContent);
  const [attachment, setAttachment] = React.useState<QuickReplyAttachment | null>(null);
  const [scheduleAt, setScheduleAt] = React.useState("");
  const [editing, setEditing] = React.useState<ApiSchedule | null>(null);
  const [removing, setRemoving] = React.useState<ApiSchedule | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const schedules = useQuery({
    queryKey: ["trixus", "schedules", "conversation", conversationId],
    queryFn: () => schedulesApi.list({ conversationId }),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
    refetchOnWindowFocus: "always",
  });
  const conversationSchedules = React.useMemo(
    () => pendingConversationSchedules(schedules.data ?? [], conversationId),
    [conversationId, schedules.data],
  );

  React.useEffect(() => {
    if (!open) return;
    return onRealtimeEvent((event) => {
      if (event.event === "schedule.updated") {
        void queryClient.invalidateQueries({ queryKey: ["trixus", "schedules"] });
      }
    });
  }, [open, queryClient]);

  const variables = React.useMemo(
    () => mergeMessageVariables(CONNECTION_MESSAGE_VARIABLES, customFields),
    [customFields],
  );

  React.useEffect(() => {
    if (!open) return;
    setEditing(null);
    setRemoving(null);
    setContent(initialContent);
    setAttachment(null);
    setScheduleAt("");
    setError("");
  }, [initialContent, open]);

  const resetForm = React.useCallback(() => {
    setEditing(null);
    setContent(initialContent);
    setAttachment(null);
    setScheduleAt("");
    setError("");
  }, [initialContent]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["trixus", "schedules"] });
  };

  const save = async () => {
    const trimmedContent = content.trim();
    if ((!trimmedContent && !attachment) || !scheduleAt) {
      setError("Informe a mensagem ou um anexo, além da data e do horário.");
      return;
    }
    if (trimmedContent.length > 1000) {
      setError("A mensagem deve ter no máximo 1000 caracteres.");
      return;
    }
    const date = new Date(scheduleAt);
    if (date <= new Date()) {
      setError("Escolha um horário futuro.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const mode = editing ? "edit" : "create";
      await schedulesApi.save(
        editing
          ? scheduleWritePayload({
              ...editing,
              content: trimmedContent,
              scheduledAt: date.toISOString(),
              attachment,
              attachmentName: attachment?.fileName ?? null,
            })
          : {
              id: crypto.randomUUID(),
              identifier,
              type: "message",
              title: "Mensagem agendada",
              destination: "Conversa atual",
              scheduledAt: date.toISOString(),
              recurrence: "once",
              delivery: true,
              status: "pending",
              connectionId: "",
              departmentId: "",
              content: trimmedContent,
              recipientIds: [],
              recipients: [],
              recurrenceDays: [],
              recurrenceLimit: "",
              recurrenceUntil: "",
              assignedMembershipId: "",
              attachment,
              attachmentName: attachment?.fileName ?? null,
              conversationId,
            },
      );
      await refresh();
      await onSaved?.(mode);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o agendamento.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={close} title="Agendar Mensagem" size="xl" closeOnBackdrop={!busy}>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <form
            className="min-w-0 space-y-4 rounded-xl border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div>
              <h4 className="font-semibold">{editing ? "Editar Agendamento" : "Nova Mensagem"}</h4>
            </div>
            <Field label="Mensagem *">
              <GreetingMessageEditor
                value={content}
                attachment={attachment}
                variables={variables}
                disabled={busy}
                invalid={content.trim().length > 1000}
                placeholder="Escreva a mensagem"
                showEmoji
                attachmentLayout="segmented"
                onChange={(nextContent, nextAttachment) => {
                  setContent(nextContent);
                  setAttachment(nextAttachment);
                  setError("");
                }}
              />
            </Field>
            <Field label="Data e horário *">
              <div className="min-w-0 max-w-full overflow-hidden">
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  className="block w-full min-w-0 max-w-full rounded-lg border border-border bg-card p-2.5 text-sm"
                  required
                />
              </div>
            </Field>
            <p className="text-xs text-muted-foreground">
              A mensagem digitada será enviada na data escolhida.
            </p>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={editing ? resetForm : close}
                disabled={busy}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || (!content.trim() && !attachment) || !scheduleAt}
              >
                {busy ? "Salvando..." : editing ? "Salvar alterações" : "Agendar"}
              </Button>
            </div>
          </form>

          <section className="min-w-0 rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold">Mensagens Agendadas</h4>
              </div>
              <CalendarClock className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {schedules.isLoading && (
                <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
              )}
              {schedules.isError && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-4 text-sm text-destructive"
                >
                  Não foi possível carregar as mensagens agendadas.
                </p>
              )}
              {!schedules.isLoading && !schedules.isError && conversationSchedules.length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma mensagem agendada para esta conversa.
                </p>
              )}
              {conversationSchedules.map((item) => (
                <article key={item.id} className="rounded-lg border border-border bg-surface-1 p-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 whitespace-pre-wrap text-sm text-foreground">
                        {item.content}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(item.scheduledAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                      {item.attachmentName && (
                        <p
                          className="mt-1 truncate text-xs text-muted-foreground"
                          title={item.attachmentName}
                        >
                          Anexo: {item.attachmentName}
                        </p>
                      )}
                      {item.executionStatus === "FAILED" && (
                        <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          Falha no envio
                          {item.lastError ? `: ${item.lastError}` : "."}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Editar agendamento"
                        aria-label="Editar agendamento"
                        onClick={() => {
                          setEditing(item);
                          setContent(item.content);
                          setAttachment(item.attachment ?? null);
                          setScheduleAt(toLocalDateTimeInput(item.scheduledAt));
                          setError("");
                        }}
                        disabled={
                          busy ||
                          (item.executionStatus != null && item.executionStatus !== "PENDING")
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="trash-action"
                        title="Excluir agendamento"
                        aria-label="Excluir agendamento"
                        onClick={() => setRemoving(item)}
                        disabled={busy}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!removing}
        onClose={() => !busy && setRemoving(null)}
        title="Excluir mensagem agendada?"
        description="Deseja realmente excluir esta mensagem agendada?"
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (!removing) return;
          setBusy(true);
          setError("");
          void schedulesApi
            .remove(removing.id)
            .then(async () => {
              setRemoving(null);
              if (editing?.id === removing.id) resetForm();
              await refresh();
            })
            .catch((cause) =>
              setError(
                cause instanceof Error ? cause.message : "Não foi possível excluir o agendamento.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
