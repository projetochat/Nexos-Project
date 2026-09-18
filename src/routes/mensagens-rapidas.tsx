import { customFieldVariableKey } from "@/lib/message-variables";
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Braces, Copy, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { InfoTooltip } from "@/components/info-tooltip";
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
import {
  crmApi,
  quickReplyApi,
  type ApiQuickReply,
  type QuickReplyAttachment,
  type QuickReplyMessage,
} from "@/lib/trixus-api";
import { assertQuickReplySaved, quickReplyMessages } from "@/lib/quick-reply-sequence";
import { useChatPerms } from "@/lib/perms";
import { sortByOptionLabel } from "@/lib/sort-options";

export const Route = createFileRoute("/mensagens-rapidas")({
  component: QuickRepliesPage,
  head: () => ({
    meta: [
      { title: "Trixus" },
      {
        name: "description",
        content: "Atalhos de mensagens rápidas para agilizar respostas no atendimento.",
      },
    ],
  }),
});

const quickRepliesQueryKey = ["trixus", "quick-replies"] as const;
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
      ? items.filter((item) =>
          `${item.atalho} ${quickReplyMessages(item)
            .map((message) => `${message.text} ${message.attachment?.fileName ?? ""}`)
            .join(" ")}`
            .toLowerCase()
            .includes(q),
        )
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
                    {(reply.messages?.length ?? 0) > 1 && (
                      <span className="text-xs text-primary">
                        {reply.messages!.length} mensagens
                      </span>
                    )}
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
                        size="sm"
                        title="Remover"
                        aria-label="Remover"
                        className="trash-action"
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

export function QuickReplyEditor({
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
  const [messages, setMessages] = React.useState<QuickReplyMessage[]>([{ text: "" }]);
  const [intervalSeconds, setIntervalSeconds] = React.useState(0);
  const [closeOnSend, setCloseOnSend] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [shortcutError, setShortcutError] = React.useState("");
  const [variablesOpen, setVariablesOpen] = React.useState(false);
  const [customVariables, setCustomVariables] = React.useState<string[]>([]);
  const activeMessage = React.useRef(0);
  const textareas = React.useRef<Array<HTMLTextAreaElement | null>>([]);
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setVariablesOpen(false);
    activeMessage.current = 0;
    void crmApi
      .listContactCustomFields()
      .then((fields) => {
        if (active)
          setCustomVariables(
            fields.map((field) => customFieldVariableKey(field.label)).filter(Boolean),
          );
      })
      .catch(() => {
        if (active) setCustomVariables([]);
      });
    return () => {
      active = false;
    };
  }, [open]);
  const insertVariable = (name: string) => {
    const index = Math.min(activeMessage.current, messages.length - 1);
    const input = textareas.current[index];
    const text = messages[index].text;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? start;
    const token = "{{" + name + "}}";
    if (text.length - (end - start) + token.length > 2000)
      return toast.error("A mensagem deve ter no máximo 2000 caracteres.");
    setMessages((items) =>
      items.map((item, position) =>
        position === index
          ? { ...item, text: text.slice(0, start) + token + text.slice(end) }
          : item,
      ),
    );
    setVariablesOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

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
    setMessages(initial ? quickReplyMessages(initial) : [{ text: "" }]);
    setIntervalSeconds(initial?.intervalSeconds ?? 0);
    setCloseOnSend(initial?.close_on_send ?? false);
    setShortcutError("");
  }, [clone, open, initial]);

  const save = async () => {
    if (messages.length > 10) return toast.error("Número máximo de mensagens (10).");
    const shortcut = sanitizeQuickReplyShortcut(atalho);
    const content = messages
      .map((message) => message.text.trim() || message.attachment?.fileName || "")
      .join("\n")
      .slice(0, 2000);
    const attachment = messages[0]?.attachment;
    if (!shortcut) return toast.error("Informe o atalho.");
    if (messages.some((message) => !message.text.trim() && !message.attachment))
      return toast.error("Preencha o texto ou anexe um arquivo em cada mensagem.");
    if (
      messages.reduce((total, message) => total + (message.attachment?.dataUrl.length ?? 0), 0) >
      40 * 1024 * 1024
    )
      return toast.error("Os anexos da sequência excedem o limite de 30 MB.");
    const duplicateError = duplicateShortcutError(shortcut);
    if (duplicateError) {
      setShortcutError(duplicateError);
      return;
    }
    setBusy(true);
    try {
      let saved: ApiQuickReply;
      if (initial && !clone) {
        saved = await quickReplyApi.update(initial.id, {
          title: shortcut,
          shortcut,
          content,
          messages,
          intervalSeconds,
          departmentId: initial.departmentId,
          closeOnSend,
          attachmentFileName: attachment?.fileName ?? null,
          attachmentMimeType: attachment?.mimeType ?? null,
          attachmentSize: attachment?.size ?? null,
          attachmentDataUrl: attachment?.dataUrl ?? null,
        });
      } else {
        saved = await quickReplyApi.create({
          title: shortcut,
          shortcut,
          content,
          messages,
          intervalSeconds,
          departmentId: null,
          closeOnSend,
          attachmentFileName: attachment?.fileName ?? null,
          attachmentMimeType: attachment?.mimeType ?? null,
          attachmentSize: attachment?.size ?? null,
          attachmentDataUrl: attachment?.dataUrl ?? null,
        });
      }
      assertQuickReplySaved(saved, messages, intervalSeconds);
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
      title={
        clone
          ? "Duplicar Mensagem Rápida"
          : initial
            ? "Editar Mensagem Rápida"
            : "Nova Mensagem Rápida"
      }
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Mensagem <span className="text-destructive">*</span>
            </p>
            <div className="relative flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Inserir variável"
                aria-expanded={variablesOpen}
                disabled={busy}
                onClick={() => setVariablesOpen((value) => !value)}
              >
                <Braces className="h-4 w-4" />
              </Button>
              {variablesOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 max-h-64 w-60 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg"
                  role="menu"
                  aria-label="Variáveis disponíveis"
                >
                  {[
                    ...new Set([
                      "contato",
                      "cumprimento",
                      "nome",
                      "telefone",
                      "email",
                      "instancia",
                      "cliente",
                      "departamento",
                      ...customVariables,
                    ]),
                  ].map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="menuitem"
                      className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-surface-2"
                      onClick={() => insertVariable(name)}
                    >
                      {"{{" + name + "}}"}
                    </button>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={busy || messages.length >= 10}
                onClick={() =>
                  setMessages((items) => (items.length >= 10 ? items : [...items, { text: "" }]))
                }
              >
                <Plus className="h-4 w-4" /> Adicionar mensagem
              </Button>
            </div>
          </div>
          {messages.length >= 10 && (
            <p className="text-xs text-destructive" role="status">
              Número máximo de mensagens (10).
            </p>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-xl border border-border bg-card focus-within:border-primary/50"
            >
              <textarea
                rows={3}
                maxLength={2000}
                value={message.text}
                disabled={busy}
                ref={(element) => {
                  textareas.current[index] = element;
                }}
                onFocus={() => {
                  activeMessage.current = index;
                }}
                aria-label={`Texto da mensagem ${index + 1}`}
                aria-required={!message.attachment}
                onChange={(event) =>
                  setMessages((items) =>
                    items.map((item, position) =>
                      position === index ? { ...item, text: event.target.value } : item,
                    ),
                  )
                }
                className="block min-h-24 w-full resize-y border-0 bg-transparent px-3 py-3 text-sm outline-none"
                placeholder="Texto da mensagem ou legenda do arquivo"
              />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-1 px-2 py-1.5">
                {message.attachment && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Remover arquivo"
                    disabled={busy}
                    onClick={() =>
                      setMessages((items) =>
                        items.map((item, position) =>
                          position === index ? { ...item, attachment: null } : item,
                        ),
                      )
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-primary">
                  <Paperclip className="h-3.5 w-3.5" /> Anexar mídia
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,video/webm,audio/ogg,audio/mpeg,audio/mp4,audio/webm,.pdf,.txt,.doc,.docx,.xls,.xlsx"
                    className="sr-only"
                    disabled={busy}
                    aria-label={`Anexar arquivo à mensagem ${index + 1}`}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024)
                        return toast.error("O arquivo deve ter no máximo 10 MB.");
                      if (file.type.startsWith("image/") && file.size > 8 * 1024 * 1024)
                        return toast.error("A imagem deve ter no máximo 8 MB.");
                      setBusy(true);
                      try {
                        const attachment = await readAttachment(file);
                        setMessages((items) =>
                          items.map((item) => (item === message ? { ...item, attachment } : item)),
                        );
                      } catch (error) {
                        toast.error((error as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
                <span
                  className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
                  title={message.attachment?.fileName}
                >
                  {message.attachment ? (
                    `${message.attachment.fileName} (${formatFileSize(message.attachment.size)})`
                  ) : (
                    <i>Imagens até 8 MB; demais arquivos até 10 MB.</i>
                  )}
                </span>
                <div className="ml-auto flex gap-1">
                  {" "}
                  {([-1, 1] as const).map((direction) => (
                    <Button
                      key={direction}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={direction < 0 ? "Mover para cima" : "Mover para baixo"}
                      disabled={
                        busy || index + direction < 0 || index + direction >= messages.length
                      }
                      onClick={() =>
                        setMessages((items) => {
                          const next = [...items];
                          [next[index], next[index + direction]] = [
                            next[index + direction],
                            next[index],
                          ];
                          return next;
                        })
                      }
                    >
                      {direction < 0 ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Remover mensagem"
                    disabled={busy || messages.length === 1}
                    onClick={() =>
                      setMessages((items) => items.filter((_, position) => position !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {messages.length > 1 && (
            <Field
              label="Intervalo entre mensagens (segundos)"
              hint="De 0 a 60 segundos, após a confirmação de envio do item anterior."
            >
              <Input
                type="number"
                min={0}
                max={60}
                step={1}
                value={intervalSeconds}
                disabled={busy}
                onChange={(event) =>
                  setIntervalSeconds(
                    Math.min(60, Math.max(0, Math.floor(Number(event.target.value) || 0))),
                  )
                }
              />
            </Field>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-1 p-3 text-sm transition hover:bg-surface-2">
            <input
              type="checkbox"
              checked={closeOnSend}
              onChange={(event) => setCloseOnSend(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <span className="flex items-center gap-1 font-medium">
                <InfoTooltip label="encerrar conversa">
                  Ao enviar este atalho no chat, a conversa será encerrada automaticamente.
                </InfoTooltip>
                Encerrar conversa
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
