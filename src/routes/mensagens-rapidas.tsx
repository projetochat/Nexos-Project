import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Info, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SearchInput,
  SectionHeader,
} from "@/components/ui-kit";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
import { quickReplyApi, type ApiQuickReply } from "@/lib/nexos-api";
import { useChatPerms } from "@/lib/perms";

export const Route = createFileRoute("/mensagens-rapidas")({
  component: QuickRepliesPage,
  head: () => ({
    meta: [
      { title: "Mensagens Rápidas · Nexo" },
      {
        name: "description",
        content: "Atalhos de mensagens rápidas para agilizar respostas no atendimento.",
      },
    ],
  }),
});

const quickRepliesQueryKey = ["nexos", "quick-replies"] as const;
type QuickReplyAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

function QuickRepliesPage() {
  const qc = useQueryClient();
  const perms = useChatPerms();
  const canManageCatalog = perms.pode_gerenciar_respostas_rapidas;
  const editor = useDisclosure();
  const [editing, setEditing] = React.useState<ApiQuickReply | null>(null);
  const [duplicating, setDuplicating] = React.useState<ApiQuickReply | null>(null);
  const [confirming, setConfirming] = React.useState<ApiQuickReply | null>(null);
  const [query, setQuery] = React.useState("");
  const { data: items = [], isLoading } = useQuery({
    queryKey: quickRepliesQueryKey,
    queryFn: () => quickReplyApi.list({ scope: "catalog" }),
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.atalho} ${item.texto}`.toLowerCase().includes(q));
  }, [items, query]);

  const refresh = () => qc.invalidateQueries({ queryKey: quickRepliesQueryKey });
  const openNew = () => {
    setEditing(null);
    setDuplicating(null);
    editor.show();
  };
  const openEdit = (reply: ApiQuickReply) => {
    setEditing(reply);
    setDuplicating(null);
    editor.show();
  };
  const openDuplicate = (reply: ApiQuickReply) => {
    setDuplicating(reply);
    setEditing(null);
    editor.show();
  };
  const closeEditor = () => {
    editor.hide();
    setEditing(null);
    setDuplicating(null);
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <SectionHeader
          title="Mensagens Rápidas"
          subtitle="Atalhos que aparecem digitando / no chat."
          actions={
            canManageCatalog ? (
              <Button variant="primary" size="sm" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" /> Nova
              </Button>
            ) : null
          }
        />

        {isLoading ? (
          <Card>Carregando...</Card>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma mensagem rápida"
            description={
              canManageCatalog
                ? "Crie atalhos para respostas frequentes."
                : "Nenhum atalho cadastrado para seu atendimento."
            }
            action={
              canManageCatalog ? (
                <Button variant="primary" size="sm" onClick={openNew}>
                  <Plus className="h-3.5 w-3.5" /> Criar primeira
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Card className="mb-4 p-4">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar atalho ou texto..."
              />
            </Card>
            <div className="grid auto-rows-[9.5rem] gap-3 md:grid-cols-2">
              {filtered.map((reply) => (
                <Card
                  key={reply.id}
                  className="flex h-full items-stretch justify-between gap-3 overflow-hidden transition hover:border-primary/35 hover:bg-surface-1"
                >
                  <div className="min-h-0 min-w-0 flex-1 overflow-hidden pr-1">
                    <p className="font-mono text-sm text-primary">
                      /{reply.atalho.replace(/^\//, "")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">
                      {previewQuickReplyText(reply.texto)}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {reply.department?.nome ?? "compartilhada"}
                      {reply.close_on_send ? " · encerra conversa" : ""}
                    </p>
                  </div>
                  {canManageCatalog && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Duplicar"
                        aria-label="Duplicar"
                        onClick={() => openDuplicate(reply)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => openEdit(reply)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remover"
                        aria-label="Remover"
                        onClick={() => setConfirming(reply)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
              {filtered.length === 0 && (
                <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2">
                  Nenhum resultado.
                </Card>
              )}
            </div>
          </>
        )}

        <QuickReplyEditor
          open={editor.open}
          onClose={closeEditor}
          initial={editing ?? duplicating}
          clone={!!duplicating}
          onSaved={() => {
            refresh();
            qc.invalidateQueries({ queryKey: ["nexos", "quick-replies", "composer"] });
            closeEditor();
          }}
        />

        <ConfirmDialog
          open={!!confirming}
          title="Remover atalho?"
          description={confirming ? `/${confirming.atalho.replace(/^\//, "")} será arquivado.` : ""}
          confirmLabel="Remover"
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            if (!confirming) return;
            try {
              await quickReplyApi.archive(confirming.id);
              toast.success("Removido");
              refresh();
              qc.invalidateQueries({ queryKey: ["nexos", "quick-replies", "composer"] });
              setConfirming(null);
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        />
      </div>
    </AppShell>
  );
}

function QuickReplyEditor({
  open,
  onClose,
  initial,
  clone = false,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: ApiQuickReply | null;
  clone?: boolean;
  onSaved: () => void;
}) {
  const [atalho, setAtalho] = React.useState("");
  const [texto, setTexto] = React.useState("");
  const [attachment, setAttachment] = React.useState<QuickReplyAttachment | null>(null);
  const [closeOnSend, setCloseOnSend] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setAtalho(initial ? duplicateShortcut(initial.atalho, clone) : "");
    setTexto(initial?.texto ?? "");
    setAttachment(
      initial?.attachmentDataUrl
        ? {
            fileName: initial.attachmentFileName ?? "anexo",
            mimeType: initial.attachmentMimeType ?? "application/octet-stream",
            size: initial.attachmentSize ?? 0,
            dataUrl: initial.attachmentDataUrl,
          }
        : null,
    );
    setCloseOnSend(initial?.close_on_send ?? false);
  }, [clone, open, initial]);

  const save = async () => {
    const shortcut = atalho.trim().replace(/^\//, "").toLowerCase();
    const content = texto.trim();
    if (!shortcut) return toast.error("Informe o atalho.");
    if (!content) return toast.error("Informe o texto.");
    setBusy(true);
    try {
      if (initial && !clone) {
        await quickReplyApi.update(initial.id, {
          title: shortcut,
          shortcut,
          content,
          departmentId: initial.departmentId,
          closeOnSend,
          attachmentFileName: attachment?.fileName ?? null,
          attachmentMimeType: attachment?.mimeType ?? null,
          attachmentSize: attachment?.size ?? null,
          attachmentDataUrl: attachment?.dataUrl ?? null,
        });
      } else {
        await quickReplyApi.create({
          title: shortcut,
          shortcut,
          content,
          departmentId: null,
          closeOnSend,
          attachmentFileName: attachment?.fileName ?? null,
          attachmentMimeType: attachment?.mimeType ?? null,
          attachmentSize: attachment?.size ?? null,
          attachmentDataUrl: attachment?.dataUrl ?? null,
        });
      }
      toast.success("Salvo");
      onSaved();
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
      title={initial && !clone ? "Editar atalho" : "Novo atalho"}
      description="Atalhos curtos aceleram respostas."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Atalho *" hint="Sem barra. Ex.: bd, bt, obg">
          <Input
            value={atalho}
            onChange={(event) => setAtalho(event.target.value)}
            placeholder="bd"
          />
        </Field>
        <Field label="Mensagem *">
          <textarea
            rows={8}
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            className="min-h-48 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            placeholder="Bom dia! Como posso ajudar?"
          />
        </Field>
        <div className="rounded-lg border border-border bg-surface-1 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Arquivo</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {attachment
                  ? `${attachment.fileName} (${formatFileSize(attachment.size)})`
                  : "Nenhum arquivo anexado."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {attachment && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remover arquivo"
                  aria-label="Remover arquivo"
                  onClick={() => setAttachment(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                title="Anexar arquivo"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" /> Anexar
              </Button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                setAttachment(await readAttachment(file));
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-1 p-3 text-sm transition hover:bg-surface-2">
          <input
            type="checkbox"
            checked={closeOnSend}
            onChange={(event) => setCloseOnSend(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1 font-medium">
              <Info className="h-4 w-4 text-primary" /> Encerrar conversa
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Ao enviar este atalho no chat, a conversa será encerrada automaticamente.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

function duplicateShortcut(value: string, clone: boolean) {
  const shortcut = value.replace(/^\//, "");
  return clone ? `${shortcut}-copia` : shortcut;
}

function previewQuickReplyText(value: string) {
  const maxLength = 170;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function readAttachment(file: File): Promise<QuickReplyAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Nao foi possivel carregar o arquivo."));
        return;
      }
      resolve({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => reject(new Error("Nao foi possivel carregar o arquivo."));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
