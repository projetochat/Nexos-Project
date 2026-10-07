import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import {
  conversationApi,
  crmApi,
  organizationApi,
  type ApiContact,
  type ApiContactInstanceOption,
  type ApiMessage,
} from "@/lib/trixus-api";
import { sendMessageCopy } from "@/lib/copy-message";
import { invalidateConversationQueries } from "@/lib/realtime/invalidate-conversation";
import { resolveConnectedContactInstances } from "@/lib/contact-instance-selection";
import { useConnectedMessagingConnections } from "@/lib/use-connected-messaging-connections";
import { Modal } from "./modal";
import { Avatar, Button, SearchInput } from "./ui-kit";

export function MessageForwardDialog({
  message,
  onClose,
  layerClassName,
}: {
  message: ApiMessage;
  onClose: () => void;
  layerClassName?: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{
    contact: ApiContact;
    connectionId: string;
    departmentId: string;
  } | null>(null);
  const [connectionChoice, setConnectionChoice] = useState<{
    contact: ApiContact;
    instances: ApiContactInstanceOption[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { allConnections } = useConnectedMessagingConnections();
  const { data: chatDepartments = [] } = useQuery({
    queryKey: ["trixus", "chat-departments"],
    queryFn: organizationApi.listChatDepartments,
  });
  const sending = useRef(false);
  const ids = useRef(new Map<string, string>());
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error: loadError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["trixus", "contacts", "forward", search.trim()],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      crmApi.listContacts({ q: search.trim() || undefined, page: pageParam, pageSize: 20 }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });
  const contacts = data?.pages.flatMap((page) => page.items) ?? [];
  const { data: contactOptions, error: optionsError } = useQuery({
    queryKey: ["trixus", "contacts", "forward-options"],
    queryFn: crmApi.contactOptions,
  });
  const chooseContact = (contact: ApiContact) => {
    const allowedIds = new Set(allConnections.map((connection) => connection.id));
    const instances = resolveConnectedContactInstances(
      contact,
      (contactOptions?.instances ?? []).filter((instance) => allowedIds.has(instance.id)),
    );
    setError("");
    if (instances.length === 0) {
      setSelected(null);
      setError("Este contato não possui uma instância conectada.");
      return;
    }
    if (instances.length === 1) {
      const connectionId = instances[0].id;
      const favorite = chatDepartments.find(
        (department) =>
          department.connectionIds.includes(connectionId) &&
          department.favoriteConnectionIds?.includes(connectionId),
      );
      setSelected({ contact, connectionId, departmentId: favorite?.id ?? "" });
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
          departmentId: selected.departmentId,
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
        layerClassName={layerClassName}
        onClose={() => {
          if (!busy) onClose();
        }}
        title="Encaminhar mensagem"
        description="Selecione um contato para enviar uma cópia."
        className="h-[min(44rem,calc(100dvh-1rem))] sm:h-[min(44rem,calc(100dvh-2rem))]"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={busy || !selected?.departmentId}
              onClick={() => void send()}
            >
              {busy ? "Enviando…" : "Encaminhar"}
            </Button>
          </>
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setSelected(null);
            }}
            placeholder="Buscar contato"
          />
          <div
            role="radiogroup"
            aria-label="Contato de destino"
            className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
            onScroll={(event) => {
              const list = event.currentTarget;
              const nearEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
              if (nearEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
          >
            {isLoading ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                Carregando…
              </p>
            ) : loadError || optionsError ? (
              <div role="alert" className="py-8 text-center text-sm text-muted-foreground">
                Não foi possível carregar os contatos.{" "}
                <Button onClick={() => void refetch()}>Tentar novamente</Button>
              </div>
            ) : contacts.length ? (
              contacts.map((contact) => {
                const active = selected?.contact.id === contact.id;
                return (
                  <button
                    type="button"
                    role="radio"
                    key={contact.id}
                    disabled={busy || !contactOptions}
                    aria-checked={active}
                    onClick={() => chooseContact(contact)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${active ? "border-primary bg-primary/10" : "border-transparent hover:bg-surface-2"}`}
                  >
                    <Avatar name={contact.nome} src={contact.avatar_url} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{contact.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {contact.telefone}
                      </span>
                    </span>
                    <span
                      data-forward-selection-indicator
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60 bg-transparent"}`}
                    >
                      {active && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })
            ) : (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                Nenhum contato encontrado.
              </p>
            )}
            {isFetchingNextPage && (
              <p role="status" className="py-3 text-center text-xs text-muted-foreground">
                Carregando mais contatos…
              </p>
            )}
          </div>
          {selected && (
            <div className="mt-3 max-h-36 shrink-0 space-y-2 overflow-y-auto border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Departamento</p>
              {chatDepartments
                .filter((department) => department.connectionIds.includes(selected.connectionId))
                .map((department) => (
                  <button
                    type="button"
                    key={department.id}
                    onClick={() => setSelected({ ...selected, departmentId: department.id })}
                    className={`flex min-h-11 w-full items-center rounded-lg border px-3 text-left text-sm ${selected.departmentId === department.id ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    {department.name}
                  </button>
                ))}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 shrink-0 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </Modal>
      <Modal
        open={!!connectionChoice}
        layerClassName="z-[280]"
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
                setSelected({
                  contact: connectionChoice.contact,
                  connectionId: instance.id,
                  departmentId:
                    chatDepartments.find(
                      (department) =>
                        department.connectionIds.includes(instance.id) &&
                        department.favoriteConnectionIds?.includes(instance.id),
                    )?.id ?? "",
                });
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
