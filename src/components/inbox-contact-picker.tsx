import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ContactRound } from "lucide-react";
import { crmApi } from "@/lib/trixus-api";
import { contactCardFile } from "@/lib/contact-card";
import { Modal } from "./modal";
import { Button, Input } from "./ui-kit";

export function InboxContactPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (file: File) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["trixus", "contacts", "share", search.trim(), page],
    queryFn: () => crmApi.listContacts({ q: search.trim() || undefined, page, pageSize: 10 }),
  });
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
        ) : data?.items.length ? (
          data.items.map((contact) => (
            <button
              key={contact.id}
              type="button"
              disabled={!contact.telefone}
              onClick={() => onSelect(contactCardFile(contact))}
              className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-surface-2 disabled:opacity-50"
            >
              <ContactRound className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{contact.nome}</span>
                <span className="block text-xs text-muted-foreground">{contact.telefone}</span>
              </span>
            </button>
          ))
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
