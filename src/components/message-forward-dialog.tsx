import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { conversationApi, type ApiMessage } from "@/lib/trixus-api";
import { sendMessageCopy } from "@/lib/copy-message";
import { invalidateConversationQueries } from "@/lib/realtime/invalidate-conversation";
import { Modal } from "./modal";
import { Button, Input } from "./ui-kit";

export function MessageForwardDialog({
  message,
  onClose,
}: {
  message: ApiMessage;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const ids = useRef(new Map<string, string>());
  const {
    data,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: ["trixus", "conversations", "forward", search, page],
    queryFn: () =>
      conversationApi.list({ q: search.trim() || undefined, page, pageSize: 10, tab: "ativas" }),
  });
  const send = async () => {
    if (!selected || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      if (!ids.current.has(selected)) ids.current.set(selected, crypto.randomUUID());
      await sendMessageCopy(message, selected, ids.current.get(selected)!);
      void invalidateConversationQueries(qc, selected);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível encaminhar a mensagem.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Encaminhar mensagem"
      description="Selecione uma conversa ativa para enviar uma cópia."
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={busy || !selected} onClick={() => void send()}>
            {busy ? "Enviando…" : "Encaminhar"}
          </Button>
        </>
      }
    >
      <Input
        aria-label="Buscar conversa"
        placeholder="Buscar conversa"
        disabled={busy}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
          setSelected("");
        }}
      />
      <div className="mt-3 space-y-1">
        {isFetching ? (
          <p role="status">Carregando…</p>
        ) : loadError ? (
          <div role="alert">
            Não foi possível carregar as conversas.{" "}
            <Button onClick={() => void refetch()}>Tentar novamente</Button>
          </div>
        ) : data?.items.length ? (
          data.items.map((conversation) => (
            <button
              type="button"
              key={conversation.id}
              disabled={busy}
              aria-pressed={selected === conversation.id}
              onClick={() => setSelected(conversation.id)}
              className={`block w-full rounded-lg border p-3 text-left ${selected === conversation.id ? "border-primary bg-primary/10" : "border-transparent hover:bg-surface-2"}`}
            >
              <span className="block text-sm font-medium">
                {conversation.contact?.nome ?? "Conversa"}
                {conversation.is_group ? " · Grupo" : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {conversation.contact?.telefone} · {conversation.connection?.name}
              </span>
            </button>
          ))
        ) : (
          <p>Nenhuma conversa ativa encontrada.</p>
        )}
      </div>
      {(data?.totalPages ?? 0) > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <Button
            disabled={busy || isFetching || page === 1}
            onClick={() => {
              setPage(page - 1);
              setSelected("");
            }}
          >
            Anterior
          </Button>
          <span>
            {page} / {data?.totalPages}
          </span>
          <Button
            disabled={busy || isFetching || page >= (data?.totalPages ?? 1)}
            onClick={() => {
              setPage(page + 1);
              setSelected("");
            }}
          >
            Próxima
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Modal>
  );
}
