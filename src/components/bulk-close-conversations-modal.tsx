import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Modal } from "./modal";
import { Button } from "./ui-kit";
import { Switch } from "./ui/switch";
import { conversationApi } from "@/lib/trixus-api";

const QUEUES = [
  { id: "ativas", label: "Ativas" },
  { id: "standby", label: "Stand By" },
  { id: "fila", label: "Fila" },
  { id: "leads", label: "Lead" },
] as const;
type Queue = (typeof QUEUES)[number]["id"];

export function BulkCloseConversationsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<Queue[]>([]);
  const [busy, setBusy] = React.useState(false);
  const submitting = React.useRef(false);
  const prefix = React.useId();
  const confirm = async () => {
    if (!selected.length || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await conversationApi.bulkClose(selected);
      await qc.invalidateQueries();
      toast.success(`${result.closed} conversa(s) encerrada(s).`);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível encerrar as conversas.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!submitting.current) onClose();
      }}
      title="Fechar Conversas"
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={busy || !selected.length} onClick={confirm}>
            {busy ? "Encerrando…" : "Confirmar"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Encerra todas as conversas e grupos das filas selecionadas nas instâncias às quais você tem
        acesso, incluindo os que não aparecem nesta página. Os filtros da busca não são aplicados.
        Os registros serão enviados ao histórico, com protocolo e notas de início e encerramento.
      </p>
      <div className="space-y-4">
        <label
          htmlFor={`${prefix}-all`}
          className="flex cursor-pointer items-center gap-3 border-b border-border pb-4 text-sm font-medium"
        >
          <Switch
            id={`${prefix}-all`}
            checked={selected.length === QUEUES.length}
            disabled={busy}
            onCheckedChange={(checked) =>
              setSelected(checked ? QUEUES.map((queue) => queue.id) : [])
            }
          />
          Todos
        </label>
        {QUEUES.map((queue) => (
          <label
            key={queue.id}
            htmlFor={`${prefix}-${queue.id}`}
            className="flex cursor-pointer items-center gap-3 text-sm"
          >
            <Switch
              id={`${prefix}-${queue.id}`}
              checked={selected.includes(queue.id)}
              disabled={busy}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked ? [...current, queue.id] : current.filter((id) => id !== queue.id),
                )
              }
            />
            {queue.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}
