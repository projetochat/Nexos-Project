import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, Input, SectionHeader, EmptyState } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { QUICK_REPLIES, type QuickReply } from "@/lib/mvp";

export const Route = createFileRoute("/mensagens-rapidas")({
  component: QuickRepliesPage,
  head: () => ({
    meta: [
      { title: "Mensagens rápidas · Nexo" },
      { name: "description", content: "Atalhos de mensagens rápidas para agilizar respostas no atendimento." },
    ],
  }),
});

function QuickRepliesPage() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({ queryKey: ["quick_replies", "mine"], queryFn: QUICK_REPLIES.mine });
  const editor = useDisclosure();
  const [editing, setEditing] = React.useState<QuickReply | null>(null);
  const [confirming, setConfirming] = React.useState<QuickReply | null>(null);
  const [query, setQuery] = React.useState("");

  const openNew = () => { setEditing(null); editor.show(); };
  const openEdit = (qr: QuickReply) => { setEditing(qr); editor.show(); };

  const filtered = items.filter((qr) => !query || (qr.atalho + " " + qr.texto).toLowerCase().includes(query.toLowerCase()));

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <SectionHeader
          title="Mensagens rápidas"
          subtitle="Atalhos que aparecem digitando / no chat."
          actions={<Button variant="primary" size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Nova</Button>}
        />

        {isLoading ? (
          <Card>Carregando…</Card>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma mensagem rápida"
            description="Crie atalhos para respostas frequentes (ex: /bd → Bom dia!)."
            action={<Button variant="primary" size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Criar primeira</Button>}
          />
        ) : (
          <>
            <Card className="mb-4 p-4">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Buscar atalho ou texto…" />
              </div>
            </Card>
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((qr) => (
                <Card key={qr.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-primary">/{qr.atalho.replace(/^\//, "")}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{qr.texto}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {qr.agent_id === null && <p className="text-[10px] uppercase tracking-widest text-muted-foreground">compartilhada</p>}
                      {qr.close_on_send && (
                        <span className="inline-flex items-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-destructive">
                          encerra ao enviar
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(qr)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => setConfirming(qr)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </Card>
              ))}
              {filtered.length === 0 && <Card className="md:col-span-2 p-8 text-center text-sm text-muted-foreground">Nenhum resultado.</Card>}
            </div>
          </>
        )}

        <QuickReplyEditor
          open={editor.open}
          onClose={editor.hide}
          initial={editing}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["quick_replies", "mine"] });
            editor.hide();
          }}
        />

        <ConfirmDialog
          open={!!confirming}
          title="Remover atalho?"
          description={confirming ? `/${confirming.atalho.replace(/^\//, "")} será excluído.` : ""}
          confirmLabel="Remover"
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            if (!confirming) return;
            try {
              await QUICK_REPLIES.remove(confirming.id);
              toast.success("Removido");
              qc.invalidateQueries({ queryKey: ["quick_replies", "mine"] });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </div>
    </AppShell>
  );
}

function QuickReplyEditor({
  open, onClose, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: QuickReply | null;
  onSaved: () => void;
}) {
  const [atalho, setAtalho] = React.useState("");
  const [texto, setTexto] = React.useState("");
  const [closeOnSend, setCloseOnSend] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAtalho(initial?.atalho.replace(/^\//, "") ?? "");
      setTexto(initial?.texto ?? "");
      setCloseOnSend(initial?.close_on_send ?? false);
    }
  }, [open, initial]);

  const save = async () => {
    const a = atalho.trim().replace(/^\//, "").toLowerCase();
    if (!a) return toast.error("Informe o atalho.");
    if (!texto.trim()) return toast.error("Informe o texto.");
    setBusy(true);
    try {
      const existing = await QUICK_REPLIES.mine();
      const dup = existing.find(
        (q) => q.atalho.replace(/^\//, "").toLowerCase() === a && q.id !== initial?.id,
      );
      if (dup) {
        setBusy(false);
        return toast.error(`Já existe um atalho "/${a}".`);
      }
      if (initial) {
        await QUICK_REPLIES.update(initial.id, { atalho: a, texto: texto.trim(), close_on_send: closeOnSend });
      } else {
        await QUICK_REPLIES.create({ atalho: a, texto: texto.trim(), close_on_send: closeOnSend });
      }
      toast.success("Salvo");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar atalho" : "Novo atalho"}
      description="Atalhos curtos aceleram respostas: ex. bd → Bom dia!"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Atalho" hint="Sem barra. Ex.: bd, bt, obg">
          <Input value={atalho} onChange={(e) => setAtalho(e.target.value)} placeholder="bd" />
        </Field>
        <Field label="Texto completo">
          <textarea
            rows={4}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            placeholder="Bom dia! Como posso ajudar?"
          />
        </Field>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface-1 p-3 transition hover:bg-surface-2">
          <input
            type="checkbox"
            checked={closeOnSend}
            onChange={(e) => setCloseOnSend(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">Encerrar conversa</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Após enviar este atalho no chat, a conversa será encerrada automaticamente.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
