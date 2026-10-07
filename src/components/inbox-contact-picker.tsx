import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { crmApi, type ApiContact, type ApiContactInstanceOption } from "@/lib/trixus-api";
import { contactCardFile } from "@/lib/contact-card";
import { formatBrazilPhoneWithDdi, onlyDigits } from "@/lib/input-masks";
import { Modal } from "./modal";
import { Avatar, Button, Input } from "./ui-kit";

export type SharedContactSelection = {
  file: File;
  contact: Pick<ApiContact, "nome" | "telefone" | "normalizedPhone" | "avatar_url">;
};

type ShareableContact = SharedContactSelection["contact"] & { id: string };

export function InboxContactPicker({
  onClose,
  onSelect,
  priorityInstances = [],
}: {
  onClose: () => void;
  onSelect: (selections: SharedContactSelection[]) => void;
  /** Identifiers/names of the conversation instance, ordered by preference. */
  priorityInstances?: string[];
}) {
  const [search, setSearch] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<ShareableContact[]>([]);
  const contactsQuery = useInfiniteQuery({
    queryKey: ["trixus", "contacts", "share", search.trim(), priorityInstances],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      crmApi.listContacts({
        q: search.trim() || undefined,
        priorityInstance: priorityInstances.find(Boolean),
        page: pageParam,
        pageSize: 100,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });
  const optionsQuery = useQuery({
    queryKey: ["trixus", "contacts", "options", "share"],
    queryFn: crmApi.contactOptions,
  });
  const currentInstance = useMemo(
    () => resolveCurrentInstance(optionsQuery.data?.instances ?? [], priorityInstances),
    [optionsQuery.data?.instances, priorityInstances],
  );
  const instancePhone = currentInstance?.ownerPhone?.trim() ?? "";
  const instancePhoneDigits = onlyDigits(instancePhone);
  const sortedContacts = useMemo(
    () =>
      [...(contactsQuery.data?.pages.flatMap((page) => page.items) ?? [])]
        .filter(
          (contact) =>
            !instancePhoneDigits ||
            onlyDigits(contact.normalizedPhone || contact.telefone) !== instancePhoneDigits,
        )
        .sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true }),
        ),
    [contactsQuery.data?.pages, instancePhoneDigits],
  );
  const toggleContact = (contact: ShareableContact) => {
    setSelectedContacts((current) =>
      current.some((item) => item.id === contact.id)
        ? current.filter((item) => item.id !== contact.id)
        : [...current, contact],
    );
  };
  const confirmSelection = () => {
    if (!currentInstance || !instancePhone) return;
    const instanceContact: ShareableContact = {
      id: `instance:${currentInstance.id}`,
      nome: currentInstance.name,
      telefone: instancePhone,
      normalizedPhone: instancePhone,
      avatar_url: null,
    };
    onSelect(
      [instanceContact, ...selectedContacts].map((contact) => ({
        file: contactCardFile(contact),
        contact: {
          nome: contact.nome,
          telefone: contact.telefone,
          normalizedPhone: contact.normalizedPhone,
          avatar_url: contact.avatar_url,
        },
      })),
    );
  };

  const loading = contactsQuery.isLoading || optionsQuery.isLoading;
  const error = contactsQuery.error || optionsQuery.error;

  return (
    <Modal
      open
      onClose={onClose}
      title="Compartilhar Contato"
      className="h-[min(46rem,calc(100dvh-1rem))] sm:h-[min(46rem,calc(100dvh-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!currentInstance || !instancePhone}
            onClick={confirmSelection}
          >
            Encaminhar
          </Button>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <Input
          aria-label="Buscar contato"
          placeholder="Buscar nome ou telefone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <section className="mt-4 shrink-0" aria-labelledby="instance-contact-heading">
          <h3 id="instance-contact-heading" className="text-sm font-semibold text-muted-foreground">
            Número da instância
          </h3>
          {currentInstance && instancePhone ? (
            <ContactSelectionRow
              contact={{
                id: `instance:${currentInstance.id}`,
                nome: currentInstance.name,
                telefone: instancePhone,
                normalizedPhone: instancePhone,
                avatar_url: null,
              }}
              selected
              fixed
              onToggle={() => {}}
            />
          ) : !loading ? (
            <p role="alert" className="py-3 text-sm text-destructive">
              O número real da instância ainda não está disponível. Atualize a conexão antes de
              compartilhar.
            </p>
          ) : null}
        </section>

        <section
          className="mt-2 flex min-h-0 flex-1 flex-col border-t border-border pt-3"
          aria-labelledby="share-contacts-heading"
        >
          <h3
            id="share-contacts-heading"
            className="shrink-0 text-sm font-semibold text-muted-foreground"
          >
            Contatos
          </h3>
          <div
            data-share-contact-list
            className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1"
            onScroll={(event) => {
              const list = event.currentTarget;
              const reachedEnd = list.scrollHeight - list.scrollTop - list.clientHeight <= 48;
              if (reachedEnd && contactsQuery.hasNextPage && !contactsQuery.isFetchingNextPage) {
                void contactsQuery.fetchNextPage();
              }
            }}
          >
            {loading ? (
              <p role="status" className="py-3 text-sm">
                Carregando contatos…
              </p>
            ) : error ? (
              <div role="alert">
                <p className="py-2 text-sm">Não foi possível carregar os contatos.</p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void Promise.all([contactsQuery.refetch(), optionsQuery.refetch()])
                  }
                >
                  Tentar novamente
                </Button>
              </div>
            ) : sortedContacts.length ? (
              sortedContacts.map((contact) => (
                <ContactSelectionRow
                  key={contact.id}
                  contact={contact}
                  selected={selectedContacts.some((item) => item.id === contact.id)}
                  onToggle={() => toggleContact(contact)}
                />
              ))
            ) : (
              <p className="py-3 text-sm">Nenhum contato encontrado.</p>
            )}
            {contactsQuery.isFetchingNextPage && (
              <p role="status" className="py-2 text-center text-xs text-muted-foreground">
                Carregando mais contatos…
              </p>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function ContactSelectionRow({
  contact,
  selected,
  fixed = false,
  onToggle,
}: {
  contact: ShareableContact;
  selected: boolean;
  fixed?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={fixed || !contact.telefone}
      aria-pressed={selected}
      aria-label={`${selected ? "Remover" : "Selecionar"} ${contact.nome}`}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition hover:bg-surface-2 disabled:cursor-default disabled:opacity-100"
    >
      <Avatar name={contact.nome} src={contact.avatar_url ?? undefined} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{contact.nome}</span>
        <span className="block text-xs text-muted-foreground">
          {formatBrazilPhoneWithDdi(contact.normalizedPhone || contact.telefone)}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/60"
        }`}
      >
        {selected && <Check className="h-4 w-4" />}
      </span>
    </button>
  );
}

function resolveCurrentInstance(
  instances: ApiContactInstanceOption[],
  priorityInstances: string[],
) {
  return instances.find((instance) =>
    priorityInstances.some(
      (priority) =>
        priority === instance.id ||
        priority === instance.value ||
        priority === instance.externalReference ||
        priority === instance.name,
    ),
  );
}
