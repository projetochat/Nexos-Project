import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Button, Card, Field, Input, SectionHeader, SearchInput } from "@/components/ui-kit";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
import { num } from "@/lib/format";
import { crmApi, type ApiTag } from "@/lib/nexos-api";
import { useChatPerms } from "@/lib/perms";

export const Route = createFileRoute("/etiquetas")({ component: Page });

const tagsQueryKey = ["nexos", "tags"] as const;

function tagWithLogFallback(tag: ApiTag, previous?: ApiTag | null) {
  const now = new Date().toISOString();
  return {
    ...tag,
    createdAt: tag.createdAt ?? previous?.createdAt ?? now,
    updatedAt: tag.updatedAt ?? now,
  };
}

function Page() {
  const qc = useQueryClient();
  const perms = useChatPerms();
  const canManageCatalog = perms.pode_editar_etiquetas;
  const nova = useDisclosure();
  const [editing, setEditing] = React.useState<ApiTag | null>(null);
  const [duplicating, setDuplicating] = React.useState<ApiTag | null>(null);
  const [deleting, setDeleting] = React.useState<ApiTag | null>(null);
  const [query, setQuery] = React.useState("");
  const { data: etiquetas = [], isLoading } = useQuery({
    queryKey: tagsQueryKey,
    queryFn: crmApi.listTags,
  });

  const filtered = React.useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return etiquetas;
    return etiquetas.filter((tag) => normalizeSearch(tag.nome).includes(q));
  }, [etiquetas, query]);
  const refresh = () => qc.invalidateQueries({ queryKey: tagsQueryKey });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Etiquetas"
          subtitle={`${num(etiquetas.length)} etiquetas cadastradas.`}
          actions={
            canManageCatalog ? (
              <Button variant="primary" size="sm" onClick={nova.show}>
                <Plus className="h-3.5 w-3.5" /> Nova Etiqueta
              </Button>
            ) : null
          }
        />

        <Card className="mb-4 p-4">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar etiqueta..." />
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((etiqueta) => (
            <Card
              key={etiqueta.id}
              className="flex min-h-[86px] min-w-0 items-center gap-3 p-4 transition hover:border-primary/35 hover:bg-surface-1"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                style={{ background: etiqueta.cor }}
              >
                <Tag className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" title={etiqueta.nome}>
                  {etiqueta.nome}
                </p>
              </div>
              {canManageCatalog && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Duplicar"
                    aria-label={`Duplicar ${etiqueta.nome}`}
                    onClick={() => setDuplicating(etiqueta)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Editar"
                    aria-label={`Editar ${etiqueta.nome}`}
                    onClick={() => setEditing(etiqueta)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Excluir"
                    aria-label={`Excluir ${etiqueta.nome}`}
                    onClick={() => setDeleting(etiqueta)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
          {isLoading && (
            <div className="col-span-full rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="col-span-full rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma etiqueta cadastrada.
            </div>
          )}
        </div>

        <EtiquetaForm
          open={nova.open}
          tags={etiquetas}
          onClose={nova.hide}
          onSubmit={async (data) => {
            const created = await crmApi.createTag(data);
            qc.setQueryData<ApiTag[]>(tagsQueryKey, (current = []) => [
              tagWithLogFallback(created),
              ...current,
            ]);
            toast.success("Etiqueta criada");
            setQuery("");
            await refresh();
            nova.hide();
          }}
        />
        <EtiquetaForm
          open={!!duplicating}
          tags={etiquetas}
          initial={duplicating ?? undefined}
          clone
          onClose={() => setDuplicating(null)}
          onSubmit={async (data) => {
            const created = await crmApi.createTag(data);
            qc.setQueryData<ApiTag[]>(tagsQueryKey, (current = []) => [
              tagWithLogFallback(created),
              ...current,
            ]);
            toast.success("Etiqueta criada");
            setQuery("");
            await refresh();
            setDuplicating(null);
          }}
        />
        <EtiquetaForm
          open={!!editing}
          tags={etiquetas}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            if (!editing) return;
            const updated = await crmApi.updateTag(editing.id, data);
            qc.setQueryData<ApiTag[]>(tagsQueryKey, (current = []) =>
              current.map((tag) =>
                tag.id === updated.id ? tagWithLogFallback(updated, tag) : tag,
              ),
            );
            toast.success("Etiqueta atualizada");
            setQuery("");
            await refresh();
            setEditing(null);
          }}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Excluir Etiqueta?"
          destructive
          description={<DeleteLinkedContactCatalogMessage name={deleting?.nome} />}
          confirmLabel="Excluir"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (!deleting) return;
            await crmApi.archiveTag(deleting.id);
            toast.success("Etiqueta excluída");
            refresh();
            setDeleting(null);
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function DeleteLinkedContactCatalogMessage({ name }: { name?: string | null }) {
  const selectedName = name ?? "Sem etiqueta";

  return (
    <div className="space-y-2">
      <p>
        Deseja realmente excluir o cadastro <strong>"{selectedName}"</strong>?
      </p>
      <p className="text-xs italic text-muted-foreground">
        Os Contatos vinculados serão desvinculados.
      </p>
    </div>
  );
}

function EtiquetaForm({
  open,
  onClose,
  onSubmit,
  initial,
  clone = false,
  tags,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; color?: string }) => Promise<void>;
  initial?: ApiTag;
  clone?: boolean;
  tags: ApiTag[];
}) {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#3B82F6");
  const [busy, setBusy] = React.useState(false);
  const [nameError, setNameError] = React.useState("");
  const duplicateNameError = (value: string) => {
    const normalizedName = normalizeSearch(value);
    if (!normalizedName) return "";
    return tags.some(
      (tag) =>
        tag.id !== (initial && !clone ? initial.id : undefined) &&
        normalizeSearch(tag.nome) === normalizedName,
    )
      ? "Já existe uma etiqueta com este nome."
      : "";
  };

  React.useEffect(() => {
    setName(initial ? (clone ? `${initial.nome} - Cópia` : initial.nome) : "");
    setColor(initial?.cor ?? "#3B82F6");
    setNameError("");
  }, [clone, initial, open]);

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("Informe o nome.");
    const duplicateError = duplicateNameError(name);
    if (duplicateError) {
      setNameError(duplicateError);
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), color: completeHexColor(color) });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial && !clone ? "Editar Etiqueta" : clone ? "Duplicar Etiqueta" : "Nova Etiqueta"}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <EntityFormLog
            show={!!initial && !clone}
            createdAt={initial?.createdAt}
            updatedAt={initial?.updatedAt}
          />
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(7rem,1fr)_10.5rem] gap-3">
        <Field label="Nome *" error={nameError || undefined}>
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(duplicateNameError(event.target.value));
            }}
            aria-invalid={!!nameError}
          />
        </Field>
        <Field label="Cor">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2 py-1.5 transition focus-within:border-primary">
            <input
              type="color"
              value={completeHexColor(color)}
              onChange={(event) => setColor(normalizeHexColor(event.target.value))}
              className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
            />
            <input
              type="text"
              value={color}
              onChange={(event) => setColor(normalizeHexColor(event.target.value))}
              placeholder={completeHexColor("#3B82F6")}
              maxLength={7}
              className="min-w-0 flex-1 border-0 bg-transparent font-mono text-xs uppercase outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
            />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function EntityFormLog({
  show,
  createdAt,
  updatedAt,
}: {
  show: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  if (!show) return <span aria-hidden="true" />;
  return (
    <div className="min-w-0 text-left text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
      <div className="truncate">
        <span className="font-semibold text-foreground">Criado:</span> {formatDateTime(createdAt)}
      </div>
      <div className="truncate">
        <span className="font-semibold text-foreground">Editado:</span> {formatDateTime(updatedAt)}
      </div>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }).replace(",", "");
}

function normalizeHexColor(value?: string | null, _fallback = "#3B82F6") {
  const digits = String(value ?? "")
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6);
  return `#${digits.toUpperCase()}`;
}

function completeHexColor(value?: string | null, fallback = "#3B82F6") {
  const normalized = normalizeHexColor(value);
  return normalized.length === 7 ? normalized : normalizeHexColor(fallback);
}
