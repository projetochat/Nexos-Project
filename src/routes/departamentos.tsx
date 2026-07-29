import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Building2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Field, Input, Textarea, Select } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { useStore } from "@/lib/mock/store";
import { supabase } from "@/integrations/supabase/client";
import type { Departamento } from "@/lib/mock/types";

export const Route = createFileRoute("/departamentos")({ component: Page });

function Page() {
  const departamentos = useStore((s) => s.departamentos);
  const atendentes = useStore((s) => s.atendentes);
  const conversas = useStore((s) => s.conversas);
  const create = useStore((s) => s.createDepartamento);
  const update = useStore((s) => s.updateDepartamento);
  const remove = useStore((s) => s.deleteDepartamento);
  const [editing, setEditing] = React.useState<Departamento | null>(null);
  const [deleting, setDeleting] = React.useState<Departamento | null>(null);
  const [query, setQuery] = React.useState("");
  const [instFilter, setInstFilter] = React.useState("all");
  const novo = useDisclosure();

  const { data: instancias = [] } = useQuery({
    queryKey: ["instancias-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("instancias").select("id,nome").order("nome");
      return data ?? [];
    },
  });
  const { data: depInstMap = {} } = useQuery({
    queryKey: ["dep-inst-map"],
    queryFn: async () => {
      const [{ data: pd }, { data: pi }] = await Promise.all([
        supabase.from("access_profile_departments").select("profile_id,department_id"),
        supabase.from("access_profile_instancias").select("profile_id,instancia_id"),
      ]);
      const byProfile: Record<string, string[]> = {};
      (pi ?? []).forEach((x: any) => { (byProfile[x.profile_id] ??= []).push(x.instancia_id); });
      const map: Record<string, Set<string>> = {};
      (pd ?? []).forEach((x: any) => {
        (map[x.department_id] ??= new Set());
        (byProfile[x.profile_id] ?? []).forEach((iid) => map[x.department_id].add(iid));
      });
      const out: Record<string, string[]> = {};
      Object.entries(map).forEach(([k, v]) => { out[k] = Array.from(v); });
      return out;
    },
  });

  const filtered = departamentos.filter((d) => {
    if (query && !(d.nome + " " + (d.descricao ?? "")).toLowerCase().includes(query.toLowerCase())) return false;
    if (instFilter !== "all" && !(depInstMap[d.id] ?? []).includes(instFilter)) return false;
    return true;
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader title="Departamentos" subtitle={`${departamentos.length} departamentos ativos.`}
          actions={<Button variant="primary" size="sm" onClick={novo.show}><Plus className="h-3.5 w-3.5" /> Criar departamento</Button>} />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Buscar departamento…" />
            </div>
            <Select value={instFilter} onChange={(e) => setInstFilter(e.target.value)}>
              <option value="all">Todas as instâncias</option>
              {(instancias as any[]).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Select>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => {
            const membros = atendentes.filter((a) => a.departamentoId === d.id).length;
            const abertas = conversas.filter((c) => c.departamentoId === d.id && (c.status === "aguardando" || c.status === "atendendo")).length;
            return (
              <Card key={d.id}>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: d.cor }}>
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <p className="mt-4 font-semibold">{d.nome}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.descricao}</p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-mono text-xs">
                  <span className="text-muted-foreground">{membros} membros</span>
                  <span className="text-primary">{abertas} conversas abertas</span>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && <Card className="col-span-full p-8 text-center text-sm text-muted-foreground">Nenhum resultado.</Card>}
        </div>

        <DepartamentoForm open={novo.open} onClose={novo.hide} onSubmit={(d) => { create(d); toast.success("Departamento criado"); novo.hide(); }} />
        <DepartamentoForm open={!!editing} initial={editing ?? undefined} onClose={() => setEditing(null)}
          onSubmit={(d) => { if (editing) { update(editing.id, d); toast.success("Departamento atualizado"); } setEditing(null); }} />
        <ConfirmDialog open={!!deleting} title="Excluir departamento?" destructive
          description={`Esta ação removerá ${deleting?.nome ?? ""}.`}
          confirmLabel="Excluir" onClose={() => setDeleting(null)}
          onConfirm={() => { if (deleting) { remove(deleting.id); toast.success("Departamento removido"); } }} />
      </PageContainer>
    </AppShell>
  );
}

function DepartamentoForm({ open, onClose, onSubmit, initial }: { open: boolean; onClose: () => void; onSubmit: (d: Partial<Departamento>) => void; initial?: Departamento }) {
  const [form, setForm] = React.useState<Partial<Departamento>>({});
  const [error, setError] = React.useState("");
  React.useEffect(() => { setForm(initial ? { ...initial } : { cor: "#6366f1" }); setError(""); }, [initial, open]);
  const submit = () => {
    if (!form.nome || form.nome.trim().length < 2) { setError("Informe o nome."); toast.error("Nome obrigatório."); return; }
    onSubmit(form);
  };
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar departamento" : "Criar departamento"} size="md"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={submit}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />{error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}</Field>
        <Field label="Descrição"><Textarea rows={3} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
        <Field label="Cor">
          <div className="flex items-center gap-2">
            <input type="color" value={form.cor ?? "#6366f1"} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent" />
            <Input value={form.cor ?? "#6366f1"} onChange={(e) => setForm({ ...form, cor: e.target.value })} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}
