import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog, Modal } from "./modal";
import { Button, Field, Select } from "./ui-kit";
import { Switch } from "./ui/switch";
import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields";
import {
  conversationApi,
  type BulkConversationSelection,
  type ConversationCounts,
} from "@/lib/trixus-api";

export type BulkConversationAction = "start" | "transfer" | "close";

type QueueOption = {
  id: keyof ConversationCounts;
  label: string;
};

const ACTION_COPY: Record<
  BulkConversationAction,
  { title: string; confirmationTitle: string; verb: string; past: string }
> = {
  start: {
    title: "Iniciar em Massa",
    confirmationTitle: "Iniciar conversas?",
    verb: "iniciar",
    past: "iniciada(s)",
  },
  transfer: {
    title: "Transferência em Massa",
    confirmationTitle: "Transferir conversas?",
    verb: "transferir",
    past: "transferida(s)",
  },
  close: {
    title: "Fechar Conversas em Massa",
    confirmationTitle: "Encerrar conversas?",
    verb: "encerrar",
    past: "encerrada(s)",
  },
};

export function BulkConversationActionModal({
  action,
  selection,
  queues,
  onClose,
  onSuccess,
}: {
  action: BulkConversationAction;
  selection: Omit<BulkConversationSelection, "tab" | "tabs">;
  queues: QueueOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [selectedTabs, setSelectedTabs] = React.useState<Array<keyof ConversationCounts>>([]);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [departmentId, setDepartmentId] = React.useState("");
  const [mode, setMode] = React.useState<"department" | "agent" | "status">("department");
  const [targetId, setTargetId] = React.useState("");
  const [targetRequired, setTargetRequired] = React.useState(false);
  const [status, setStatus] = React.useState<"fila" | "standby">("fila");
  const copy = ACTION_COPY[action];
  const scopedSelection = React.useMemo<BulkConversationSelection>(
    () => ({ ...selection, action, tabs: selectedTabs.length ? selectedTabs : undefined }),
    [action, selectedTabs, selection],
  );
  const { data: options, isLoading } = useQuery({
    queryKey: ["trixus", "conversations", "bulk-options", scopedSelection],
    queryFn: () => conversationApi.bulkOptions(scopedSelection),
  });
  const counts = options?.counts;
  const departments = options?.departments ?? [];
  const agents = options?.agents ?? [];
  const totalCount = counts
    ? queues.reduce((total, queue) => total + counts[queue.id], 0)
    : undefined;
  const selectedCount = counts
    ? selectedTabs.reduce((total, tab) => total + counts[tab], 0)
    : undefined;
  const selectedQueueLabels = queues
    .filter((queue) => selectedTabs.includes(queue.id))
    .map((queue) => queue.label);
  const allSelected = queues.length > 0 && selectedTabs.length === queues.length;
  const prefix = React.useId();

  React.useEffect(() => {
    setSelectedTabs([]);
    setConfirming(false);
    setDepartmentId("");
    setMode("department");
    setTargetId("");
    setTargetRequired(false);
    setStatus("fila");
  }, [action, selection]);

  const validate = () => {
    if (!selectedTabs.length || !selectedCount) {
      toast.error("Selecione ao menos uma aba com conversas para processar.");
      return false;
    }
    if (action === "transfer" && mode !== "status" && !targetId) {
      setTargetRequired(true);
      showRequiredFieldsToast([
        mode === "department" ? "Departamento de destino" : "Atendente de destino",
      ]);
      return false;
    }
    return true;
  };

  const requestConfirmation = () => {
    if (validate()) setConfirming(true);
  };

  const submit = async () => {
    if (!validate()) throw new Error("A seleção da ação em massa está incompleta.");
    setBusy(true);
    try {
      if (action === "close") {
        const result = await conversationApi.bulkClose(scopedSelection);
        await qc.invalidateQueries({ queryKey: ["trixus", "conversations"] });
        toast.success(`${result.closed} conversa(s) ${copy.past}.`);
        if (result.failed.length) {
          toast.warning(`${result.failed.length} conversa(s) não foram encerradas.`, {
            description: result.failed[0]?.message,
          });
        }
      } else {
        const result =
          action === "start"
            ? await conversationApi.bulkStart(scopedSelection, departmentId || undefined)
            : await conversationApi.bulkTransfer(
                scopedSelection,
                mode === "status" ? { mode, status } : { mode, targetId },
              );
        await qc.invalidateQueries({ queryKey: ["trixus", "conversations"] });
        if (result.succeeded.length) {
          toast.success(`${result.succeeded.length} conversa(s) ${copy.past}.`);
        }
        if (result.failed.length) {
          toast.warning(`${result.failed.length} conversa(s) não puderam ser processadas.`, {
            description: result.failed[0]?.message,
          });
        }
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível executar a ação.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={() => !busy && !confirming && onClose()}
        title={copy.title}
        description="Selecione uma ou mais abas para aplicar a ação às conversas dos filtros atuais."
        footer={
          <>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant={action === "close" ? "destructive" : "primary"}
              size="sm"
              disabled={busy || isLoading || !selectedTabs.length || !selectedCount}
              onClick={requestConfirmation}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <fieldset className="space-y-4">
            <legend className="mb-2 text-sm font-medium">Aba de conversas</legend>
            <label
              htmlFor={`${prefix}-all`}
              className="flex cursor-pointer items-center gap-3 border-b border-border pb-4 text-sm font-medium"
            >
              <Switch
                id={`${prefix}-all`}
                checked={allSelected}
                disabled={busy || isLoading}
                onCheckedChange={(checked) =>
                  setSelectedTabs(checked ? queues.map((queue) => queue.id) : [])
                }
              />
              Todos ({totalCount === undefined ? "…" : totalCount.toLocaleString("pt-BR")})
            </label>
            <div className="space-y-3" aria-label="Abas de conversas">
              {queues.map((queue) => {
                const count = counts?.[queue.id];
                const selected = selectedTabs.includes(queue.id);
                return (
                  <label
                    key={queue.id}
                    htmlFor={`${prefix}-${queue.id}`}
                    className="flex cursor-pointer items-center gap-3 text-sm"
                  >
                    <Switch
                      id={`${prefix}-${queue.id}`}
                      checked={selected}
                      disabled={busy || isLoading}
                      onCheckedChange={(checked) =>
                        setSelectedTabs((current) =>
                          checked
                            ? [...current, queue.id]
                            : current.filter((tab) => tab !== queue.id),
                        )
                      }
                    />
                    {queue.label} ({count === undefined ? "…" : count.toLocaleString("pt-BR")})
                  </label>
                );
              })}
            </div>
          </fieldset>

          {selectedTabs.length > 0 && selectedCount === 0 && (
            <p className="text-sm text-muted-foreground">
              Não há conversas nas abas selecionadas com os filtros atuais.
            </p>
          )}

          {selectedTabs.length > 0 && action === "close" && (
            <p className="text-sm text-muted-foreground">
              As conversas elegíveis das abas selecionadas serão encerradas e o histórico será
              preservado.
            </p>
          )}

          {selectedTabs.length > 0 && action === "start" && (
            <Field label="Departamento">
              <Select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">Usar o departamento atual de cada conversa</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {selectedTabs.length > 0 && action === "transfer" && (
            <div className="space-y-4">
              <div className="inline-flex rounded-lg border border-border bg-surface-1 p-1">
                {(["department", "agent", "status"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setMode(item);
                      setTargetId("");
                      setTargetRequired(false);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      mode === item
                        ? "bg-surface-2 text-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item === "department"
                      ? "Departamento"
                      : item === "agent"
                        ? "Atendente"
                        : "Status"}
                  </button>
                ))}
              </div>
              {mode === "department" && (
                <Field label="Departamento de destino">
                  <Select
                    value={targetId}
                    aria-invalid={targetRequired}
                    className={requiredFieldClassName(targetRequired)}
                    onChange={(event) => {
                      setTargetId(event.target.value);
                      if (event.target.value) setTargetRequired(false);
                    }}
                  >
                    <option value="">Selecione</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {mode === "agent" && (
                <Field label="Atendente de destino">
                  <Select
                    value={targetId}
                    aria-invalid={targetRequired}
                    className={requiredFieldClassName(targetRequired)}
                    onChange={(event) => {
                      setTargetId(event.target.value);
                      if (event.target.value) setTargetRequired(false);
                    }}
                  >
                    <option value="">Selecione</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {mode === "status" && (
                <Field label="Status de destino">
                  <Select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as "fila" | "standby")}
                  >
                    <option value="fila">Fila</option>
                    <option value="standby">Stand By</option>
                  </Select>
                </Field>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        title={copy.confirmationTitle}
        destructive={action === "close"}
        confirmLabel={action === "close" ? "Encerrar" : "Confirmar"}
        pendingLabel="Processando…"
        description={
          <div className="space-y-2">
            <p>
              Deseja realmente {copy.verb}{" "}
              <strong className="font-semibold text-foreground">
                {(selectedCount ?? 0).toLocaleString("pt-BR")} conversa(s)
              </strong>{" "}
              {selectedQueueLabels.length === 1 ? "da aba" : "das abas"}{" "}
              <strong className="font-semibold text-foreground">
                {selectedQueueLabels.join(", ")}
              </strong>
              ?
            </p>
            <p className="text-xs italic text-muted-foreground">
              A quantidade considera os filtros aplicados e as conversas que você pode acessar.
            </p>
          </div>
        }
        onClose={() => setConfirming(false)}
        onConfirm={submit}
      />
    </>
  );
}
