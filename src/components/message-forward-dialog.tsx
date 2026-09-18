import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  conversationApi,
  crmApi,
  type ApiContact,
  type ApiContactInstanceOption,
  type ApiMessage,
} from "@/lib/trixus-api";
import { sendMessageCopy } from "@/lib/copy-message";
import { invalidateConversationQueries } from "@/lib/realtime/invalidate-conversation";
import { resolveConnectedContactInstances } from "@/lib/contact-instance-selection";
import { Modal } from "./modal";
import { Avatar, Button, SearchInput } from "./ui-kit";

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
  const [selected, setSelected] = useState<{
    contact: ApiContact;
    connectionId: string;
  } | null>(null);
  const [connectionChoice, setConnectionChoice] = useState<{
    contact: ApiContact;
    instances: ApiContactInstanceOption[];
  } | null>(null);
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
    queryKey: ["trixus", "contacts", "forward", search, page],
    queryFn: () => crmApi.listContacts({ q: search.trim() || undefined, page, pageSize: 10 }),
  });
  const { data: contactOptions, error: optionsError } = useQuery({
    queryKey: ["trixus", "contacts", "forward-options"],
    queryFn: crmApi.contactOptions,
  });
  const chooseContact = (contact: ApiContact) => {
    const instances = resolveConnectedContactInstances(contact, contactOptions?.instances ?? []);
    setError("");
    if (instances.length === 0) {
      setSelected(null);
      setError("Este contato não possui uma instância conectada.");
      return;
    }
    if (instances.length === 1) {
      setSelected({ contact, connectionId: instances[0].id });
      return;
    }
    setSelected(null);
    setConnectionChoice({ contact, instances });
  };
  const send = async () => {
    if (!selected || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const active = await conversationApi.list({
        contactId: selected.contact.id,
        instance: selected.connectionId,
        tab: "ativas",
        page: 1,
        pageSize: 1,
        sort: "lastMessageAt",
        direction: "desc",
      });
      const conversation =
        active.items[0] ??
        (await conversationApi.create({
          contactId: selected.contact.id,
          connectionId: selected.connectionId,
          assignToSelf: true,
        }));
      if (!ids.current.has(conversation.id)) ids.current.set(conversation.id, crypto.randomUUID());
      await sendMessageCopy(message, conversation.id, ids.current.get(conversation.id)!);
      void invalidateConversationQueries(qc, conversation.id);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível encaminhar a mensagem.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <Modal
        open
        onClose={() => {
          if (!busy) onClose();
        }}
        title="Encaminhar mensagem"
        description="Selecione um contato para enviar uma cópia."
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
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
            setSelected(null);
          }}
          placeholder="Buscar contato"
        />
        <div className="mt-3 space-y-1">
          {isFetching ? (
            <p role="status">Carregando…</p>
          ) : loadError || optionsError ? (
            <div role="alert">
              Não foi possível carregar os contatos.{" "}
              <Button onClick={() => void refetch()}>Tentar novamente</Button>
            </div>
          ) : data?.items.length ? (
            data.items.map((contact) => (
              <button
                type="button"
                key={contact.id}
                disabled={busy || !contactOptions}
                aria-pressed={selected?.contact.id === contact.id}
                onClick={() => chooseContact(contact)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${selected?.contact.id === contact.id ? "border-primary bg-primary/10" : "border-transparent hover:bg-surface-2"}`}
              >
                <Avatar name={contact.nome} src={contact.avatar_url} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{contact.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {contact.telefone}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p>Nenhum contato encontrado.</p>
          )}
        </div>
        {(data?.totalPages ?? 0) > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <Button
              disabled={busy || isFetching || page === 1}
              onClick={() => {
                setPage(page - 1);
                setSelected(null);
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
                setSelected(null);
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
      <Modal
        open={!!connectionChoice}
        onClose={() => setConnectionChoice(null)}
        title="Escolher Instância"
        description={
          connectionChoice
            ? `Selecione a instância para encaminhar a mensagem para ${connectionChoice.contact.nome}.`
            : undefined
        }
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setConnectionChoice(null)}>
            Cancelar
          </Button>
        }
      >
        <div className="space-y-2">
          {connectionChoice?.instances.map((instance) => (
            <Button
              key={instance.id}
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                setSelected({ contact: connectionChoice.contact, connectionId: instance.id });
                setConnectionChoice(null);
              }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: instance.color ?? "#22c55e" }}
              />
              {instance.name}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}
