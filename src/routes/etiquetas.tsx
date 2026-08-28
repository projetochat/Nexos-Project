import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Button, Card, Field, Input, SectionHeader } from "@/components/ui-kit";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
import { crmApi, type ApiTag } from "@/lib/nexos-api";
import { useChatPerms } from "@/lib/perms";

export const Route = createFileRoute("/etiquetas")({ component: Page });

const tagsQueryKey = ["nexos", "tags"] as const;

function Page() {
  const qc = useQueryClient();
  const perms = useChatPerms();
  const canManageCatalog = perms.pode_editar_etiquetas;
  const nova = useDisclosure();
  const [editing, setEditing] = React.useState<ApiTag | null>(null);
  const [deleting, setDeleting] = React.useState<ApiTag | null>(null);
  const [query, setQuery] = React.useState("");
  const { data: etiquetas = [], isLoading } = useQuery({
    queryKey: tagsQueryKey,
    queryFn: crmApi.listTags,
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return etiquetas;
    return etiquetas.filter((tag) => tag.nome.toLowerCase().includes(q));
  }, [etiquetas, query]);
  const refresh = () => qc.invalidateQueries({ queryKey: tagsQueryKey });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Etiquetas"
          subtitle={`${etiquetas.length} etiquetas para classificar contatos e conversas.`}
          actions={
            canManageCatalog ? (
              <Button variant="primary" size="sm" onClick={nova.show}>
                <Plus className="h-3.5 w-3.5" /> Nova Etiqueta
              </Button>
            ) : null
          }
        />

        <Card className="mb-4 p-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent py-2 text-sm outline-none"
              placeholder="Buscar etiqueta..."
            />
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
            {filtered.map((etiqueta) => (
              <div key={etiqueta.id} className="flex items-center gap-3 p-4">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  style={{ background: etiqueta.cor }}
                >
                  <Tag className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{etiqueta.nome}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                    {etiqueta.conversationCount ?? 0} conversas · {etiqueta.customerCount ?? 0}{" "}
                    clientes
                  </p>
                </div>
                {canManageCatalog && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(etiqueta)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(etiqueta)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="col-span-full p-8 text-center text-sm text-muted-foreground">
                Carregando...
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="col-span-full p-8 text-center text-sm text-muted-foreground">
                Nenhuma etiqueta cadastrada.
              </div>
            )}
          </div>
        </Card>

        <EtiquetaForm
          open={nova.open}
          onClose={nova.hide}
          onSubmit={async (data) => {
            await crmApi.createTag(data);
            toast.success("Etiqueta criada");
            refresh();
            nova.hide();
          }}
        />
        <EtiquetaForm
          open={!!editing}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            if (!editing) return;
            await crmApi.updateTag(editing.id, data);
            toast.success("Etiqueta atualizada");
            refresh();
            setEditing(null);
          }}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Arquivar etiqueta?"
          destructive
          description={`Esta ação removerá "${deleting?.nome ?? ""}" do catálogo ativo.`}
          confirmLabel="Arquivar"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (!deleting) return;
            await crmApi.archiveTag(deleting.id);
            toast.success("Etiqueta arquivada");
            refresh();
            setDeleting(null);
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

function EtiquetaForm({
  open,
  onClose,
  onSubmit,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; color?: string }) => Promise<void>;
  initial?: ApiTag;
}) {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#6366f1");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setName(initial?.nome ?? "");
    setColor(initial?.cor ?? "#6366f1");
  }, [initial, open]);

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("Informe o nome.");
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
      title={initial ? "Editar Etiqueta" : "Nova Etiqueta"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome *">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Cor">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={completeHexColor(color)}
              onChange={(event) => setColor(normalizeHexColor(event.target.value))}
              className="h-9 w-14 cursor-pointer rounded border border-border"
            />
            <Input
              value={color}
              onChange={(event) => setColor(normalizeHexColor(event.target.value))}
            />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function normalizeHexColor(value?: string | null, _fallback = "#6366f1") {
  const digits = String(value ?? "")
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6);
  return `#${digits.toUpperCase()}`;
}

function completeHexColor(value?: string | null, fallback = "#6366f1") {
  const normalized = normalizeHexColor(value);
  return normalized.length === 7 ? normalized : normalizeHexColor(fallback);
}
