import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
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

function QuickRepliesPage() {
  const qc = useQueryClient();
  const perms = useChatPerms();
  const canManageCatalog = perms.pode_gerenciar_respostas_rapidas;
  const editor = useDisclosure();
  const [editing, setEditing] = React.useState<ApiQuickReply | null>(null);
  const [confirming, setConfirming] = React.useState<ApiQuickReply | null>(null);
  const [query, setQuery] = React.useState("");
  const { data: items = [], isLoading } = useQuery({
    queryKey: quickRepliesQueryKey,
    queryFn: () => quickReplyApi.list(),
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.atalho} ${item.texto}`.toLowerCase().includes(q));
  }, [items, query]);

  const refresh = () => qc.invalidateQueries({ queryKey: quickRepliesQueryKey });
  const openNew = () => {
    setEditing(null);
    editor.show();
  };
  const openEdit = (reply: ApiQuickReply) => {
    setEditing(reply);
    editor.show();
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
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((reply) => (
                <Card key={reply.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-primary">
                      /{reply.atalho.replace(/^\//, "")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                      {reply.texto}
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
                        aria-label="Editar"
                        onClick={() => openEdit(reply)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
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
          onClose={editor.hide}
          initial={editing}
          onSaved={() => {
            refresh();
            qc.invalidateQueries({ queryKey: ["nexos", "quick-replies", "composer"] });
            editor.hide();
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
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: ApiQuickReply | null;
  onSaved: () => void;
}) {
  const [atalho, setAtalho] = React.useState("");
  const [texto, setTexto] = React.useState("");
  const [closeOnSend, setCloseOnSend] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAtalho(initial?.atalho.replace(/^\//, "") ?? "");
    setTexto(initial?.texto ?? "");
    setCloseOnSend(initial?.close_on_send ?? false);
  }, [open, initial]);

  const save = async () => {
    const shortcut = atalho.trim().replace(/^\//, "").toLowerCase();
    const content = texto.trim();
    if (!shortcut) return toast.error("Informe o atalho.");
    if (!content) return toast.error("Informe o texto.");
    setBusy(true);
    try {
      if (initial) {
        await quickReplyApi.update(initial.id, {
          title: shortcut,
          shortcut,
          content,
          departmentId: initial.departmentId,
          closeOnSend,
        });
      } else {
        await quickReplyApi.create({
          title: shortcut,
          shortcut,
          content,
          departmentId: null,
          closeOnSend,
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
      title={initial ? "Editar atalho" : "Novo atalho"}
      description="Atalhos curtos aceleram respostas."
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
        <Field label="Atalho" hint="Sem barra. Ex.: bd, bt, obg">
          <Input
            value={atalho}
            onChange={(event) => setAtalho(event.target.value)}
            placeholder="bd"
          />
        </Field>
        <Field label="Texto completo">
          <textarea
            rows={4}
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            placeholder="Bom dia! Como posso ajudar?"
          />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-1 p-3 text-sm transition hover:bg-surface-2">
          <input
            type="checkbox"
            checked={closeOnSend}
            onChange={(event) => setCloseOnSend(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Encerrar conversa
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
