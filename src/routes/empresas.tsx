import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Building2, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Badge, Field, Input, Select } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { useStore } from "@/lib/mock/store";
import type { Empresa } from "@/lib/mock/types";

export const Route = createFileRoute("/empresas")({ component: EmpresasPage });

const TONE: Record<Empresa["plano"], "brand" | "info" | "warning" | "default"> = {
  Enterprise: "brand", Pro: "info", Trial: "warning", Free: "default",
};

function EmpresasPage() {
  const empresas = useStore((s) => s.empresas);
  const clientes = useStore((s) => s.clientes);
  const create = useStore((s) => s.createEmpresa);
  const update = useStore((s) => s.updateEmpresa);
  const remove = useStore((s) => s.deleteEmpresa);

  const [query, setQuery] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [editing, setEditing] = React.useState<Empresa | null>(null);
  const [deleting, setDeleting] = React.useState<Empresa | null>(null);
  const nova = useDisclosure();

  const filtered = empresas.filter((e) => {
    if (planFilter !== "all" && e.plano !== planFilter) return false;
    if (query) return (e.nome + e.segmento).toLowerCase().includes(query.toLowerCase());
    return true;
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Empresas"
          subtitle={`${empresas.length} organizações cadastradas.`}
          actions={<Button variant="primary" size="sm" onClick={nova.show}><Plus className="h-3.5 w-3.5" /> Nova empresa</Button>}
        />
        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Buscar empresa…" />
            </div>
            <Select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
              <option value="all">Todos os planos</option><option>Enterprise</option><option>Pro</option><option>Trial</option><option>Free</option>
            </Select>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const count = clientes.filter((cl) => cl.empresaId === c.id).length;
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary"><Building2 className="h-5 w-5" /></div>
                  <Badge tone={TONE[c.plano]}>{c.plano}</Badge>
                </div>
                <p className="mt-4 truncate text-base font-semibold">{c.nome}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.segmento} · {count} contatos</p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                  <span className="font-mono text-muted-foreground">{c.cnpj.slice(0, 8)}…</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</div>
          )}
        </div>

        <EmpresaForm open={nova.open} onClose={nova.hide} onSubmit={(d) => { create(d); toast.success("Empresa criada"); nova.hide(); }} />
        <EmpresaForm open={!!editing} initial={editing ?? undefined} onClose={() => setEditing(null)}
          onSubmit={(d) => { if (editing) { update(editing.id, d); toast.success("Empresa atualizada"); } setEditing(null); }} />
        <ConfirmDialog open={!!deleting} title="Excluir empresa?" destructive
          description={`Esta ação removerá ${deleting?.nome ?? ""}. Os clientes ficarão sem empresa vinculada.`}
          confirmLabel="Excluir" onClose={() => setDeleting(null)}
          onConfirm={() => { if (deleting) { remove(deleting.id); toast.success("Empresa excluída"); } }} />
      </PageContainer>
    </AppShell>
  );
}

function EmpresaForm({ open, onClose, onSubmit, initial }: { open: boolean; onClose: () => void; onSubmit: (d: Partial<Empresa>) => void; initial?: Empresa }) {
  const [form, setForm] = React.useState<Partial<Empresa>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => { setForm(initial ? { ...initial } : { plano: "Trial", segmento: "Serviços" }); setErrors({}); }, [initial, open]);
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.nome || form.nome.trim().length < 2) errs.nome = "Informe o nome.";
    if (!form.cnpj || form.cnpj.replace(/\D/g, "").length < 8) errs.cnpj = "CNPJ inválido.";
    if (Object.keys(errs).length) { setErrors(errs); toast.error("Verifique os campos."); return; }
    onSubmit(form);
  };
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar empresa" : "Nova empresa"} size="lg"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={submit}>Salvar</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />{errors.nome && <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>}</Field>
        <Field label="CNPJ *"><Input value={form.cnpj ?? ""} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />{errors.cnpj && <span className="mt-1 block text-[11px] text-destructive">{errors.cnpj}</span>}</Field>
        <Field label="Segmento"><Input value={form.segmento ?? ""} onChange={(e) => setForm({ ...form, segmento: e.target.value })} /></Field>
        <Field label="Plano"><Select value={form.plano ?? "Trial"} onChange={(e) => setForm({ ...form, plano: e.target.value as Empresa["plano"] })}><option>Free</option><option>Trial</option><option>Pro</option><option>Enterprise</option></Select></Field>
      </div>
    </Modal>
  );
}
