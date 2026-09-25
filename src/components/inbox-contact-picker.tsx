import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ContactRound } from "lucide-react";
import { crmApi } from "@/lib/trixus-api";
import { contactCardFile } from "@/lib/contact-card";
import { Modal } from "./modal";
import { Button, Input } from "./ui-kit";

export function InboxContactPicker({
  onClose,
  onSelect,
  priorityInstances = [],
}: {
  onClose: () => void;
  onSelect: (file: File) => void;
  /** Identifiers/names of the conversation instance, ordered by preference. */
  priorityInstances?: string[];
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["trixus", "contacts", "share", search.trim(), page, priorityInstances],
    queryFn: () =>
      crmApi.listContacts({
        q: search.trim() || undefined,
        priorityInstance: priorityInstances.find(Boolean),
        page,
        pageSize: 100,
      }),
  });
  const sortedContacts = useMemo(() => {
    const priorities = new Set(priorityInstances.filter(Boolean));
    return [...(data?.items ?? [])].sort((a, b) => {
      const aPriority =
        priorities.has(a.instancia ?? "") || a.instanceIds.some((id) => priorities.has(id));
      const bPriority =
        priorities.has(b.instancia ?? "") || b.instanceIds.some((id) => priorities.has(id));
      return (
        Number(bPriority) - Number(aPriority) ||
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true })
      );
    });
  }, [data?.items, priorityInstances]);
  return (
    <Modal
      open
      onClose={onClose}
      title="Compartilhar contato"
      description="Selecione um contato para anexar seu cartão à mensagem."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <Input
        aria-label="Buscar contato"
        placeholder="Buscar nome ou telefone"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      <div className="mt-3 space-y-1">
        {isFetching ? (
          <p role="status" className="py-3 text-sm">
            Carregando contatos…
          </p>
        ) : error ? (
          <div role="alert">
            <p className="py-2 text-sm">Não foi possível carregar os contatos.</p>
            <Button variant="secondary" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : sortedContacts.length ? (
          sortedContacts.map((contact, index) => {
            const isCurrentInstance = priorityInstances.some(
              (instance) =>
                instance === contact.instancia || contact.instanceIds.includes(instance),
            );
            return (
              <button
                key={contact.id}
                type="button"
                disabled={!contact.telefone}
                onClick={() => onSelect(contactCardFile(contact))}
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-surface-2 disabled:opacity-50"
              >
                <ContactRound className="h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 truncate text-sm font-medium">
                    <span className="truncate">{contact.nome}</span>
                    {isCurrentInstance && index === 0 && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Da instância atual
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">{contact.telefone}</span>
                </span>
              </button>
            );
          })
        ) : (
          <p className="py-3 text-sm">Nenhum contato encontrado.</p>
        )}
      </div>
      {(data?.totalPages ?? 0) > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 1 || isFetching}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-xs">
            {page} / {data?.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= (data?.totalPages ?? 1) || isFetching}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </Modal>
  );
}
