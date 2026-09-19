import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog, Modal } from "./modal";
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
  const { data: counts, isLoading: loadingCounts } = useQuery({
    queryKey: ["trixus", "conversations", "bulk-close-counts"],
    queryFn: () => conversationApi.list({ pageSize: 1 }),
    select: (page) => page.counts,
  });
  const [selected, setSelected] = React.useState<Queue[]>([]);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const submitting = React.useRef(false);
  const prefix = React.useId();
  const total = counts ? QUEUES.reduce((sum, queue) => sum + counts[queue.id], 0) : null;
  const countLabel = (count: number | null | undefined) =>
    count === null || count === undefined ? "…" : count.toLocaleString("pt-BR");
  const selectedCount = counts ? selected.reduce((sum, queue) => sum + counts[queue], 0) : null;
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
    <>
      <Modal
        open
        onClose={() => {
          if (!submitting.current && !confirming) onClose();
        }}
        title="Fechar Conversas"
        footer={
          <>
            <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || loadingCounts || !selected.length}
              onClick={() => setConfirming(true)}
            >
              {busy ? "Encerrando…" : "Confirmar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label
            htmlFor={`${prefix}-all`}
            className="flex cursor-pointer items-center gap-3 border-b border-border pb-4 text-sm font-medium"
          >
            <Switch
              id={`${prefix}-all`}
              checked={selected.length === QUEUES.length}
              disabled={busy || loadingCounts}
              onCheckedChange={(checked) =>
                setSelected(checked ? QUEUES.map((queue) => queue.id) : [])
              }
            />
            Todos ({countLabel(total)})
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
                disabled={busy || loadingCounts}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked ? [...current, queue.id] : current.filter((id) => id !== queue.id),
                  )
                }
              />
              {queue.label} ({countLabel(counts?.[queue.id])})
            </label>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming}
        title="Encerrar conversas?"
        destructive
        confirmLabel="Encerrar"
        description={
          <div className="space-y-2">
            <p>
              Deseja realmente encerrar{" "}
              <strong className="font-semibold text-foreground">
                {countLabel(selectedCount)} conversa(s)
              </strong>
              ?
            </p>
            <p className="text-xs italic text-muted-foreground">
              As conversas selecionadas serão removidas das filas de atendimento.
            </p>
          </div>
        }
        onClose={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </>
  );
}
