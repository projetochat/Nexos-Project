import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Modal } from "./modal";
import { Button, Field, Select } from "./ui-kit";
import { conversationApi } from "@/lib/trixus-api";

export type BulkConversationAction = "start" | "transfer" | "close";

export function BulkConversationActionModal({
  action,
  conversationIds,
  onClose,
  onSuccess,
}: {
  action: BulkConversationAction;
  conversationIds: string[];
  onClose: () => void;
  onSuccess: (succeededIds: string[]) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [departmentId, setDepartmentId] = React.useState("");
  const [mode, setMode] = React.useState<"department" | "agent" | "status">("department");
  const [targetId, setTargetId] = React.useState("");
  const [status, setStatus] = React.useState<"fila" | "standby">("fila");
  const { data: options } = useQuery({
    queryKey: ["trixus", "conversations", "bulk-options", conversationIds],
    queryFn: () => conversationApi.bulkOptions(conversationIds),
    enabled: action !== "close",
  });
  const departments = options?.departments ?? [];
  const agents = options?.agents ?? [];

  React.useEffect(() => {
    setDepartmentId("");
    setMode("department");
    setTargetId("");
    setStatus("fila");
  }, [action]);

  const submit = async () => {
    if (action === "transfer" && mode !== "status" && !targetId) {
      return toast.error("Selecione o destino da transferência.");
    }
    setBusy(true);
    try {
      if (action === "close") {
        const result = await conversationApi.bulkClose(conversationIds);
        await qc.invalidateQueries({ queryKey: ["trixus", "conversations"] });
        toast.success(`${result.closed} conversa(s) encerrada(s).`);
        if (result.failed.length) {
          toast.warning(`${result.failed.length} conversa(s) não foram encerradas.`, {
            description: result.failed[0]?.message,
          });
        }
        onSuccess(result.succeeded);
        return;
      }
      const result =
        action === "start"
          ? await conversationApi.bulkStart(conversationIds, departmentId || undefined)
          : await conversationApi.bulkTransfer(
              conversationIds,
              mode === "status" ? { mode, status } : { mode, targetId },
            );
      await qc.invalidateQueries({ queryKey: ["trixus", "conversations"] });
      if (result.succeeded.length) {
        toast.success(`${result.succeeded.length} conversa(s) processada(s).`);
      }
      if (result.failed.length) {
        toast.warning(`${result.failed.length} conversa(s) não puderam ser processadas.`, {
          description: result.failed[0]?.message,
        });
      }
      onSuccess(result.succeeded);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível executar a ação.");
    } finally {
      setBusy(false);
    }
  };

  const title =
    action === "start"
      ? "Iniciar em Massa"
      : action === "transfer"
        ? "Transferência em Massa"
        : "Fechar Conversas em Massa";

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={title}
      description={`${conversationIds.length} conversa(s) selecionada(s).`}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={action === "close" ? "destructive" : "primary"}
            size="sm"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Processando…" : "Confirmar"}
          </Button>
        </>
      }
    >
      {action === "close" ? (
        <p className="text-sm text-muted-foreground">
          Somente as conversas marcadas serão encerradas. Esta ação preserva o histórico.
        </p>
      ) : action === "start" ? (
        <Field label="Departamento">
          <Select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">Usar o departamento atual de cada conversa</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="space-y-4">
          <div className="inline-flex rounded-lg border border-border bg-surface-1 p-1">
            {(["department", "agent", "status"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setTargetId("");
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === item ? "bg-surface-2 text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {item === "department" ? "Departamento" : item === "agent" ? "Atendente" : "Status"}
              </button>
            ))}
          </div>
          {mode === "department" && (
            <Field label="Departamento de destino">
              <Select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
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
              <Select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
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
    </Modal>
  );
}
