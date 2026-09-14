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
import { quickReplyApi, type ApiQuickReply } from "@/lib/trixus-api";
import { useChatPerms } from "@/lib/perms";
import { sortByOptionLabel } from "@/lib/sort-options";

export const Route = createFileRoute("/mensagens-rapidas")({
  component: QuickRepliesPage,
  head: () => ({
    meta: [
      { title: "Mensagens Rápidas · Trixus" },
      {
        name: "description",
        content: "Atalhos de mensagens rápidas para agilizar respostas no atendimento.",
      },
    ],
  }),
});

const quickRepliesQueryKey = ["trixus", "quick-replies"] as const;
type QuickReplyAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};
const MESSAGE_VARIABLES = [
  ["{{cumprimento}}", "Bom dia, Boa tarde e Boa noite. Será apresentado conforme a hora do dia."],
  ["{{nome}}", "Nome do Contato."],
  ["{{telefone}}", "Telefone do Contato."],
  ["{{email}}", "E-mail do Contato."],
  ["{{instancia}}", "Instância da conversa."],
  ["{{cliente}}", "Cliente do Contato."],
  ["{{departamento}}", "Departamento do Contato."],
] as const;

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
    const matchingItems = q
      ? items.filter((item) => `${item.atalho} ${item.texto}`.toLowerCase().includes(q))
      : items;
    return sortByOptionLabel(matchingItems, (item) => item.atalho);
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
      <div className="mx-auto w-full max-w-[96rem] px-3 py-6 sm:px-4 md:px-6 md:py-8 lg:px-8 xl:px-10 2xl:px-12">
        <SectionHeader
          title="Mensagens Rápidas"
          subtitle="Atalhos que aparecem digitando / no chat."
          subtitleClassName="hidden sm:block"
          actions={
            canManageCatalog ? (
              <Button variant="primary" size="sm" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" /> Nova Mensagem Rápida
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
              <Field label="Busca">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar atalho ou texto..."
                />
              </Field>
            </Card>
            <div className="grid auto-rows-[9.5rem] gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((reply) => (
                <Card
                  key={reply.id}
                  className="relative h-full overflow-hidden transition hover:border-primary/35 hover:bg-surface-1"
                >
                  <div
                    className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${canManageCatalog ? "pr-32" : ""}`}
                  >
                    <p className="font-mono text-sm text-primary">
                      /{reply.atalho.replace(/^\//, "")}
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground/90">
                      {previewQuickReplyText(reply.texto)}
                    </p>
                    {reply.close_on_send && (
                      <p className="mt-auto truncate pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Encerra conversa
                      </p>
                    )}
                  </div>
                  {canManageCatalog && (
                    <div className="absolute right-4 top-4 flex gap-1 sm:right-6 sm:top-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Duplicar"
                        aria-label="Duplicar"
                        onClick={() => openDuplicate(reply)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
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
                        className="trash-action"
                        onClick={() => setConfirming(reply)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
          existingReplies={items}
          onSaved={() => {
            refresh();
            qc.invalidateQueries({ queryKey: ["trixus", "quick-replies", "composer"] });
            closeEditor();
          }}
        />

        <ConfirmDialog
          open={!!confirming}
          title="Excluir Mensagem Rápida?"
          description={
            confirming ? (
              <p>
                Deseja realmente excluir o atalho{" "}
                <strong className="font-semibold text-foreground">
                  "/{confirming.atalho.replace(/^\//, "")}"
                </strong>
                ?
              </p>
            ) : (
              ""
            )
          }
          confirmLabel="Excluir"
          destructive
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            if (!confirming) return;
            try {
              await quickReplyApi.archive(confirming.id);
              toast.success("Removido");
              refresh();
              qc.invalidateQueries({ queryKey: ["trixus", "quick-replies", "composer"] });
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
  existingReplies,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: ApiQuickReply | null;
  clone?: boolean;
  existingReplies: ApiQuickReply[];
  onSaved: () => void;
}) {
  const [atalho, setAtalho] = React.useState("");
  const [texto, setTexto] = React.useState("");
  const [attachment, setAttachment] = React.useState<QuickReplyAttachment | null>(null);
  const [closeOnSend, setCloseOnSend] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [shortcutError, setShortcutError] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const duplicateShortcutError = (value: string) => {
    const shortcut = sanitizeQuickReplyShortcut(value);
    if (!shortcut) return "";
    return existingReplies.some(
      (reply) =>
        reply.id !== (initial && !clone ? initial.id : undefined) &&
        sanitizeQuickReplyShortcut(reply.atalho) === shortcut,
    )
      ? "Já existe uma mensagem rápida com este atalho."
      : "";
  };

  React.useEffect(() => {
    if (!open) return;
    setAtalho(initial ? duplicateShortcut(initial.atalho, clone) : "");
    setTexto(initial?.texto ?? "");
    setAttachment(
      initial?.attachmentDataUrl
        ? {
            fileName: initial.attachmentFileName ?? "atrixus",
            mimeType: initial.attachmentMimeType ?? "application/octet-stream",
            size: initial.attachmentSize ?? 0,
            dataUrl: initial.attachmentDataUrl,
          }
        : null,
    );
    setCloseOnSend(initial?.close_on_send ?? false);
    setShortcutError("");
  }, [clone, open, initial]);

  const save = async () => {
    const shortcut = sanitizeQuickReplyShortcut(atalho);
    const content = texto.trim();
    if (!shortcut) return toast.error("Informe o atalho.");
    if (!content) return toast.error("Informe o texto.");
    const duplicateError = duplicateShortcutError(shortcut);
    if (duplicateError) {
      setShortcutError(duplicateError);
      return;
    }
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
      title={clone ? "Duplicar Mensagem Rápida" : initial ? "Editar Mensagem Rápida" : "Nova Mensagem Rápida"}
      description="Atalhos curtos aceleram respostas."
      size="lg"
      footer={
        <>
          <div className="mr-auto">
            <QuickReplyFormLog
              createdAt={initial && !clone ? initial.createdAt : undefined}
              updatedAt={initial && !clone ? initial.updatedAt : undefined}
            />
          </div>
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
        <Field
          label="Atalho *"
          hint="Somente letras e hífen, sem barra. Ex.: bom-dia, bt, obg"
          error={shortcutError || undefined}
        >
          <Input
            value={atalho}
            onChange={(event) => {
              const value = sanitizeQuickReplyShortcut(event.target.value);
              setAtalho(value);
              setShortcutError(duplicateShortcutError(value));
            }}
            onBlur={() => {
              setAtalho((value) => sanitizeQuickReplyShortcut(value));
              setShortcutError(duplicateShortcutError(atalho));
            }}
            placeholder="bd"
            maxLength={40}
            aria-invalid={!!shortcutError}
          />
        </Field>
        <div className="space-y-3">
            <Field label="Mensagem *">
              <textarea
                rows={8}
                value={texto}
                onChange={(event) => setTexto(event.target.value)}
                className="min-h-48 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary"
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
      </div>
    </Modal>
  );
}

function duplicateShortcut(value: string, clone: boolean) {
  const shortcut = sanitizeQuickReplyShortcut(value);
  if (!clone) return shortcut;
  const base = shortcut.replace(/-+$/, "");
  return base ? `${base}-copia` : "copia";
}

function sanitizeQuickReplyShortcut(value: string) {
  return value.replace(/[^\p{L}-]/gu, "").toLocaleLowerCase("pt-BR");
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
        reject(new Error("Não foi possível carregar o arquivo."));
        return;
      }
      resolve({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => reject(new Error("Não foi possível carregar o arquivo."));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function QuickReplyFormLog({
  createdAt,
  updatedAt,
}: {
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  if (!createdAt && !updatedAt) return <span aria-hidden="true" />;
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
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(new Date(value))
    .replace(",", "");
}
