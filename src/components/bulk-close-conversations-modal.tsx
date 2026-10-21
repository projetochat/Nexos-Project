import { BulkConversationActionModal } from "./bulk-conversation-action-modal";

const QUEUES = [
  { id: "ativas", label: "Ativas" },
  { id: "standby", label: "Stand By" },
  { id: "fila", label: "Fila" },
  { id: "leads", label: "Leads" },
] as const;

/** Compatibilidade para consumidores antigos do fechamento em massa. */
export function BulkCloseConversationsModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  return (
    <BulkConversationActionModal
      action="close"
      selection={{ source: "todos" }}
      queues={[...QUEUES]}
      onClose={onClose}
      onSuccess={() => {
        onSuccess?.();
        onClose();
      }}
    />
  );
}
