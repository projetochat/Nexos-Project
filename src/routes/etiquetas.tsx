import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, Tag, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Field, Input } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { useStore } from "@/lib/mock/store";
import type { Etiqueta } from "@/lib/mock/types";

export const Route = createFileRoute("/etiquetas")({ component: Page });

function Page() {
  const etiquetas = useStore((s) => s.etiquetas);
  const conversas = useStore((s) => s.conversas);
  const clientes = useStore((s) => s.clientes);
  const create = useStore((s) => s.createEtiqueta);
  const update = useStore((s) => s.updateEtiqueta);
  const remove = useStore((s) => s.deleteEtiqueta);
  const [editing, setEditing] = React.useState<Etiqueta | null>(null);
  const [deleting, setDeleting] = React.useState<Etiqueta | null>(null);
  const [query, setQuery] = React.useState("");
  const nova = useDisclosure();

  const filtered = etiquetas.filter((e) => !query || e.nome.toLowerCase().includes(query.toLowerCase()));

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader title="Etiquetas" subtitle={`${etiquetas.length} etiquetas para classificar contatos e conversas.`}
          actions={<Button variant="primary" size="sm" onClick={nova.show}><Plus className="h-3.5 w-3.5" /> Nova etiqueta</Button>} />

        <Card className="mb-4 p-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Buscar etiqueta…" />
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
            {filtered.map((e) => {
              const usoConv = conversas.filter((c) => c.tags.includes(e.id)).length;
              const usoCli = clientes.filter((c) => c.tags.includes(e.id)).length;
              return (
                <div key={e.id} className="flex items-center gap-3 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: e.cor }}>
                    <Tag className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.nome}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{usoConv} conversas · {usoCli} clientes</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(e)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="col-span-full p-8 text-center text-sm text-muted-foreground">Nenhum resultado.</div>}
          </div>
        </Card>

        <EtiquetaForm open={nova.open} onClose={nova.hide} onSubmit={(d) => { create(d); toast.success("Etiqueta criada"); nova.hide(); }} />
        <EtiquetaForm open={!!editing} initial={editing ?? undefined} onClose={() => setEditing(null)}
          onSubmit={(d) => { if (editing) { update(editing.id, d); toast.success("Etiqueta atualizada"); } setEditing(null); }} />
        <ConfirmDialog open={!!deleting} title="Excluir etiqueta?" destructive
          description={`Esta ação removerá "${deleting?.nome ?? ""}" de todos os itens vinculados.`}
          confirmLabel="Excluir" onClose={() => setDeleting(null)}
          onConfirm={() => { if (deleting) { remove(deleting.id); toast.success("Etiqueta removida"); } }} />
      </PageContainer>
    </AppShell>
  );
}

function EtiquetaForm({ open, onClose, onSubmit, initial }: { open: boolean; onClose: () => void; onSubmit: (d: Partial<Etiqueta>) => void; initial?: Etiqueta }) {
  const [form, setForm] = React.useState<Partial<Etiqueta>>({});
  const [error, setError] = React.useState("");
  React.useEffect(() => { setForm(initial ? { ...initial } : { cor: "#6366f1" }); setError(""); }, [initial, open]);
  const submit = () => {
    if (!form.nome || form.nome.trim().length < 2) { setError("Informe o nome."); toast.error("Nome obrigatório."); return; }
    onSubmit(form);
  };
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar etiqueta" : "Nova etiqueta"} size="sm"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={submit}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />{error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}</Field>
        <Field label="Cor">
          <div className="flex items-center gap-2">
            <input type="color" value={form.cor ?? "#6366f1"} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-border" />
            <Input value={form.cor ?? "#6366f1"} onChange={(e) => setForm({ ...form, cor: e.target.value })} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}
