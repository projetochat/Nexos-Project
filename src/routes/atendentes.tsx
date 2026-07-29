import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, UserCog, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Avatar, Badge, KPI, Field, Input, Select } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { useStore } from "@/lib/mock/store";
import type { Atendente } from "@/lib/mock/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/atendentes")({ component: AtendentesPage });

const TONE = { online: "success", ausente: "warning", offline: "default" } as const;

function usePerfis() {
  return useQuery({
    queryKey: ["access_profiles-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("access_profiles").select("id,nome").order("nome");
      return data ?? [];
    },
  });
}

function AtendentesPage() {
  const atendentes = useStore((s) => s.atendentes);
  const departamentos = useStore((s) => s.departamentos);
  const create = useStore((s) => s.createAtendente);
  const update = useStore((s) => s.updateAtendente);
  const remove = useStore((s) => s.deleteAtendente);
  const { data: perfis = [] } = usePerfis();

  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [depFilter, setDepFilter] = React.useState("all");
  const [editing, setEditing] = React.useState<Atendente | null>(null);
  const [deleting, setDeleting] = React.useState<Atendente | null>(null);
  const novo = useDisclosure();

  const filtered = atendentes.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (depFilter !== "all" && a.departamentoId !== depFilter) return false;
    if (query) return (a.nome + a.email + a.cargo).toLowerCase().includes(query.toLowerCase());
    return true;
  });

  const online = atendentes.filter((a) => a.status === "online").length;
  const csat = (atendentes.reduce((s, a) => s + a.csat, 0) / atendentes.length).toFixed(1);
  const idle = atendentes.filter((a) => a.emAtendimento === 0 && a.status === "online").length;

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader title="Atendentes" subtitle={`${atendentes.length} atendentes cadastrados.`}
          actions={<Button variant="primary" size="sm" onClick={novo.show}><Plus className="h-3.5 w-3.5" /> Cadastrar</Button>} />

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <KPI label="Total" value={String(atendentes.length)} tone="info" />
          <KPI label="Online agora" value={String(online)} delta={`+${Math.floor(online / 6)}`} tone="success" />
          <KPI label="CSAT médio" value={csat} delta="+0.1" tone="success" />
          <KPI label="Ociosos" value={String(idle)} tone="warning" />
        </div>

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Buscar atendente…" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos os status</option><option>online</option><option>ausente</option><option>offline</option>
            </Select>
            <Select value={depFilter} onChange={(e) => setDepFilter(e.target.value)}>
              <option value="all">Todos os departamentos</option>
              {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </Select>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Atendente</th>
                <th className="px-4 py-3 font-medium">Departamento</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Em atendimento</th>
                <th className="px-4 py-3 font-medium">CSAT</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((a) => {
                const dep = departamentos.find((d) => d.id === a.departamentoId);
                const perfil = perfis.find((p: any) => p.id === a.perfilId);
                return (
                  <tr key={a.id} className="transition hover:bg-surface-1">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.nome} size={30} />
                        <div><p className="font-medium">{a.nome}</p><p className="text-xs text-muted-foreground">{a.cargo}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{dep?.nome ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(perfil as any)?.nome ?? "—"}</td>
                    <td className="px-4 py-3"><Badge tone={TONE[a.status]}>{a.status}</Badge></td>
                    <td className="px-4 py-3 font-mono">{a.emAtendimento}</td>
                    <td className="px-4 py-3 font-mono">{a.csat}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(a)}><UserCog className="h-3.5 w-3.5" /> Editar</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Nenhum resultado.</td></tr>}
            </tbody>
          </table>
        </Card>

        <AtendenteForm open={novo.open} perfis={perfis as any[]} onClose={novo.hide} onSubmit={(d) => { create(d); toast.success("Atendente cadastrado"); novo.hide(); }} />
        <AtendenteForm open={!!editing} perfis={perfis as any[]} initial={editing ?? undefined} onClose={() => setEditing(null)}
          onSubmit={(d) => { if (editing) { update(editing.id, d); toast.success("Atendente atualizado"); } setEditing(null); }} />
        <ConfirmDialog open={!!deleting} title="Excluir atendente?" destructive
          description={`Esta ação removerá ${deleting?.nome ?? ""} da equipe.`}
          confirmLabel="Excluir" onClose={() => setDeleting(null)}
          onConfirm={() => { if (deleting) { remove(deleting.id); toast.success("Atendente removido"); } }} />
      </PageContainer>
    </AppShell>
  );
}

function AtendenteForm({ open, onClose, onSubmit, initial, perfis }: { open: boolean; onClose: () => void; onSubmit: (d: Partial<Atendente>) => void; initial?: Atendente; perfis: { id: string; nome: string }[] }) {
  const departamentos = useStore((s) => s.departamentos);
  const [form, setForm] = React.useState<Partial<Atendente>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    setForm(initial ? { ...initial } : { cargo: "Atendente", departamentoId: departamentos[0]?.id, status: "online", ativo: true });
    setErrors({});
  }, [initial, open, departamentos]);

  const onPickFile = (file?: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem maior que 2MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, avatarUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.nome || form.nome.trim().length < 3) errs.nome = "Informe o nome.";
    if (!form.perfilId) errs.perfilId = "Selecione um perfil.";
    if (!form.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = "E-mail inválido.";
    if (!initial && (!form.senha || form.senha.length < 6)) errs.senha = "Senha mínima de 6 caracteres.";
    if (form.senha && form.senha.length > 0 && form.senha.length < 6) errs.senha = "Senha mínima de 6 caracteres.";
    if (Object.keys(errs).length) { setErrors(errs); toast.error("Verifique os campos."); return; }
    onSubmit(form);
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar atendente" : "Cadastrar atendente"} size="lg"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={submit}>Salvar</Button></>}>
      <div className="grid gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-border" checked={form.ativo ?? true} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
          <span>Ativo</span>
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome *">
            <Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            {errors.nome && <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>}
          </Field>
          <Field label="Perfil de acesso *">
            <Select value={form.perfilId ?? ""} onChange={(e) => setForm({ ...form, perfilId: e.target.value || undefined })}>
              <option value="">Selecione…</option>
              {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
            {errors.perfilId && <span className="mt-1 block text-[11px] text-destructive">{errors.perfilId}</span>}
          </Field>
          <Field label="E-mail (login) *">
            <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>}
          </Field>
          <Field label={initial ? "Senha (deixe em branco para manter)" : "Senha *"}>
            <Input type="password" autoComplete="new-password" value={form.senha ?? ""} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
            {errors.senha && <span className="mt-1 block text-[11px] text-destructive">{errors.senha}</span>}
          </Field>
        </div>
        <Field label="Foto">
          <div className="flex items-center gap-3">
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <Avatar name={form.nome ?? "?"} size={56} />
            )}
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0])} />
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>Fazer upload</Button>
              {form.avatarUrl && <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, avatarUrl: undefined })}>Remover</Button>}
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

