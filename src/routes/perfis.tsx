import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ShieldCheck, Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Field, Input, Textarea, Select } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/perfis")({ component: Page });

type Turno = { ativo: boolean; inicio: string; fim: string };
type DiaJornada = { manha: Turno; tarde: Turno; noite: Turno };
type Jornada = Record<"seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom", DiaJornada>;

const DAYS: { key: keyof Jornada; label: string }[] = [
  { key: "seg", label: "Segunda" }, { key: "ter", label: "Terça" }, { key: "qua", label: "Quarta" },
  { key: "qui", label: "Quinta" }, { key: "sex", label: "Sexta" }, { key: "sab", label: "Sábado" }, { key: "dom", label: "Domingo" },
];

const TURNOS: { key: keyof DiaJornada; label: string }[] = [
  { key: "manha", label: "Manhã" }, { key: "tarde", label: "Tarde" }, { key: "noite", label: "Noite" },
];

const diaPadrao = (ativoSemana: boolean): DiaJornada => ({
  manha: { ativo: ativoSemana, inicio: "08:00", fim: "12:00" },
  tarde: { ativo: ativoSemana, inicio: "13:00", fim: "18:00" },
  noite: { ativo: false, inicio: "19:00", fim: "22:00" },
});

const DEFAULT_JORNADA: Jornada = {
  seg: diaPadrao(true), ter: diaPadrao(true), qua: diaPadrao(true), qui: diaPadrao(true),
  sex: diaPadrao(true), sab: diaPadrao(false), dom: diaPadrao(false),
};

function normalizeJornada(raw: any): Jornada {
  const out: any = {};
  for (const d of DAYS) {
    const v = raw?.[d.key];
    if (v && (v.manha || v.tarde || v.noite)) {
      out[d.key] = {
        manha: { ...diaPadrao(false).manha, ...(v.manha ?? {}) },
        tarde: { ...diaPadrao(false).tarde, ...(v.tarde ?? {}) },
        noite: { ...diaPadrao(false).noite, ...(v.noite ?? {}) },
      };
    } else if (v && typeof v.inicio === "string") {
      // legacy shape { ativo, inicio, fim }
      out[d.key] = {
        manha: { ativo: !!v.ativo, inicio: v.inicio ?? "08:00", fim: "12:00" },
        tarde: { ativo: !!v.ativo, inicio: "13:00", fim: v.fim ?? "18:00" },
        noite: { ativo: false, inicio: "19:00", fim: "22:00" },
      };
    } else {
      out[d.key] = DEFAULT_JORNADA[d.key];
    }
  }
  return out as Jornada;
}

type Perfil = {
  id: string;
  nome: string;
  descricao: string | null;
  pode_editar_contato: boolean;
  pode_editar_vinculo_cliente: boolean;
  pode_editar_etiquetas: boolean;
  visualiza_leads: boolean;
  visualiza_contatos: boolean;
  visualiza_numero: boolean;
  excluir_mensagem: boolean;
  editar_mensagem: boolean;
  acessa_mensagens_rapidas: boolean;
  bloquear_contatos: boolean;
  enviar_audio: boolean;
  mostrar_nome_atendente: boolean;
  jornada: Jornada;
  instancias?: string[];
  departamentos?: string[];
};

const PERM_FIELDS: { key: keyof Perfil; label: string }[] = [
  { key: "pode_editar_contato", label: "Pode editar contato" },
  { key: "pode_editar_vinculo_cliente", label: "Pode editar vínculo de cliente" },
  { key: "pode_editar_etiquetas", label: "Pode gerenciar etiquetas" },
  { key: "visualiza_leads", label: "Visualiza leads" },
  { key: "visualiza_contatos", label: "Visualiza contatos" },
  { key: "visualiza_numero", label: "Visualiza número" },
  { key: "excluir_mensagem", label: "Excluir mensagem" },
  { key: "editar_mensagem", label: "Editar mensagem" },
  { key: "acessa_mensagens_rapidas", label: "Acessa mensagens rápidas" },
  { key: "bloquear_contatos", label: "Bloquear contatos" },
  { key: "enviar_audio", label: "Enviar áudio" },
  { key: "mostrar_nome_atendente", label: "Apresentar nome do atendente na conversa" },
];

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm hover:bg-surface-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      <span>{label}</span>
    </label>
  );
}

function Page() {
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["access_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("access_profiles").select("*").order("nome");
      if (error) throw error;
      const profiles = (data ?? []) as any[];
      const [{ data: pi }, { data: pd }] = await Promise.all([
        supabase.from("access_profile_instancias").select("profile_id,instancia_id"),
        supabase.from("access_profile_departments").select("profile_id,department_id"),
      ]);
      return profiles.map((p) => ({
        ...p,
        jornada: normalizeJornada(p.jornada),
        instancias: (pi ?? []).filter((x) => x.profile_id === p.id).map((x) => x.instancia_id),
        departamentos: (pd ?? []).filter((x) => x.profile_id === p.id).map((x) => x.department_id),
      })) as Perfil[];
    },
  });

  const [editing, setEditing] = React.useState<Perfil | null>(null);
  const [deleting, setDeleting] = React.useState<Perfil | null>(null);
  const [query, setQuery] = React.useState("");
  const [instFilter, setInstFilter] = React.useState("all");
  const novo = useDisclosure();

  const { data: instanciasLite = [] } = useQuery({
    queryKey: ["instancias-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("instancias").select("id,nome").order("nome");
      return data ?? [];
    },
  });

  const filtered = items.filter((p) => {
    if (query && !(p.nome + " " + (p.descricao ?? "")).toLowerCase().includes(query.toLowerCase())) return false;
    if (instFilter !== "all" && !(p.instancias ?? []).includes(instFilter)) return false;
    return true;
  });

  const save = useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Perfil }) => {
      const { instancias, departamentos, id: _ignore, ...payload } = data as any;
      let pid = id;
      if (pid) {
        const { error } = await supabase.from("access_profiles").update(payload).eq("id", pid);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from("access_profiles").insert(payload).select("id").single();
        if (error) throw error;
        pid = ins!.id;
      }
      await supabase.from("access_profile_instancias").delete().eq("profile_id", pid);
      await supabase.from("access_profile_departments").delete().eq("profile_id", pid);
      if (instancias?.length) {
        await supabase.from("access_profile_instancias").insert(instancias.map((iid: string) => ({ profile_id: pid, instancia_id: iid })));
      }
      if (departamentos?.length) {
        await supabase.from("access_profile_departments").insert(departamentos.map((did: string) => ({ profile_id: pid, department_id: did })));
      }
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["access_profiles"] });
      toast.success(vars.id ? "Perfil atualizado" : "Perfil criado");
      novo.hide(); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("access_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["access_profiles"] }); toast.success("Perfil removido"); setDeleting(null); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const duplicate = useMutation({
    mutationFn: async (p: Perfil) => {
      const existentes = new Set(items.map((x) => x.nome));
      let nome = `Cópia de ${p.nome}`;
      let n = 2;
      while (existentes.has(nome)) nome = `Cópia (${n++}) de ${p.nome}`;
      const { id: _id, instancias, departamentos, ...rest } = p as any;
      const { data: ins, error } = await supabase
        .from("access_profiles")
        .insert({ ...rest, nome })
        .select("id")
        .single();
      if (error) throw error;
      const pid = ins!.id;
      if (instancias?.length) {
        await supabase.from("access_profile_instancias").insert(instancias.map((iid: string) => ({ profile_id: pid, instancia_id: iid })));
      }
      if (departamentos?.length) {
        await supabase.from("access_profile_departments").insert(departamentos.map((did: string) => ({ profile_id: pid, department_id: did })));
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["access_profiles"] }); toast.success("Perfil duplicado"); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao duplicar"),
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader title="Perfis de acesso" subtitle={`${items.length} perfis cadastrados.`}
          actions={<Button variant="primary" size="sm" onClick={novo.show}><Plus className="h-3.5 w-3.5" /> Novo perfil</Button>} />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Buscar perfil…" />
            </div>
            <Select value={instFilter} onChange={(e) => setInstFilter(e.target.value)}>
              <option value="all">Todas as instâncias</option>
              {(instanciasLite as any[]).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Select>
          </div>
        </Card>

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">{items.length === 0 ? "Nenhum perfil cadastrado." : "Nenhum resultado."}</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const enabled = PERM_FIELDS.filter((f) => (p as any)[f.key]).length;
              return (
                <Card key={p.id}>
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => duplicate.mutate(p)} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(p)} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <p className="mt-4 font-semibold">{p.nome}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.descricao || "Sem descrição"}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-mono text-xs text-muted-foreground">
                    <span>{enabled}/{PERM_FIELDS.length} permissões</span>
                    <span>{p.instancias?.length ?? 0} inst. · {p.departamentos?.length ?? 0} dept.</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <PerfilForm open={novo.open} onClose={novo.hide} onSubmit={(d) => save.mutate({ data: d })} />
        <PerfilForm open={!!editing} initial={editing ?? undefined} onClose={() => setEditing(null)}
          onSubmit={(d) => editing && save.mutate({ id: editing.id, data: d })} />
        <ConfirmDialog open={!!deleting} title="Excluir perfil?" destructive
          description={`Esta ação removerá ${deleting?.nome ?? ""}.`}
          confirmLabel="Excluir" onClose={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate(deleting.id)} />
      </PageContainer>
    </AppShell>
  );
}

function PerfilForm({ open, onClose, onSubmit, initial }: { open: boolean; onClose: () => void; onSubmit: (d: Perfil) => void; initial?: Perfil }) {
  const [form, setForm] = React.useState<Perfil>({} as Perfil);
  const [error, setError] = React.useState("");
  const [semJornada, setSemJornada] = React.useState(false);
  const [tab, setTab] = React.useState<"chat" | "glpi">("chat");
  const [glpi, setGlpi] = React.useState({ incluir: false, editar: false, excluir: false });

  const { data: instancias = [] } = useQuery({
    queryKey: ["instancias-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("instancias").select("id,nome").order("nome");
      return data ?? [];
    },
    enabled: open,
  });
  const { data: departamentos = [] } = useQuery({
    queryKey: ["departamentos-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id,nome").order("nome");
      return data ?? [];
    },
    enabled: open,
  });

  React.useEffect(() => {
    if (!open) return;
    setError("");
    setForm(initial ? { ...initial, jornada: normalizeJornada(initial.jornada) } : {
      id: "", nome: "", descricao: "",
      pode_editar_contato: false, pode_editar_vinculo_cliente: false, pode_editar_etiquetas: false,
      visualiza_leads: true, visualiza_contatos: true, visualiza_numero: false,
      excluir_mensagem: false, editar_mensagem: false, acessa_mensagens_rapidas: true,
      bloquear_contatos: false, enviar_audio: true, mostrar_nome_atendente: true,
      jornada: DEFAULT_JORNADA, instancias: [], departamentos: [],
    });
  }, [initial, open]);

  const submit = () => {
    if (!form.nome || form.nome.trim().length < 2) { setError("Informe o nome."); return; }
    onSubmit(form);
  };

  const toggleList = (list: "instancias" | "departamentos", id: string) => {
    setForm((f) => {
      const cur = new Set(f[list] ?? []);
      cur.has(id) ? cur.delete(id) : cur.add(id);
      return { ...f, [list]: Array.from(cur) };
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? "Editar perfil" : "Novo perfil"} size="xl"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={submit}>Salvar</Button></>}>
      <div className="space-y-6">
        <Field label="Nome *">
          <Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Atendente Sênior" />
          {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
        </Field>

        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: "chat", label: "Chat" },
            { key: "glpi", label: "GLPI" },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "glpi" && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Permissões GLPI</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <CheckField label="Incluir" checked={glpi.incluir} onChange={(v) => setGlpi({ ...glpi, incluir: v })} />
              <CheckField label="Editar" checked={glpi.editar} onChange={(v) => setGlpi({ ...glpi, editar: v })} />
              <CheckField label="Excluir" checked={glpi.excluir} onChange={(v) => setGlpi({ ...glpi, excluir: v })} />
            </div>
          </section>
        )}

        {tab === "chat" && (<>


        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Instâncias</h3>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {instancias.map((i: any) => (
              <CheckField key={i.id} label={i.nome}
                checked={form.instancias?.includes(i.id) ?? false}
                onChange={() => toggleList("instancias", i.id)} />
            ))}
            {instancias.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma instância cadastrada.</p>}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Departamentos</h3>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {departamentos.map((d: any) => (
              <CheckField key={d.id} label={d.nome}
                checked={form.departamentos?.includes(d.id) ?? false}
                onChange={() => toggleList("departamentos", d.id)} />
            ))}
            {departamentos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum departamento cadastrado.</p>}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Permissões</h3>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {PERM_FIELDS.map((f) => (
              <CheckField key={f.key as string} label={f.label}
                checked={Boolean((form as any)[f.key])}
                onChange={(v) => setForm({ ...form, [f.key]: v } as any)} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Jornada de trabalho</h3>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={semJornada}
                onChange={(e) => setSemJornada(e.target.checked)}
              />
              Sem jornada
            </label>
          </div>
          {!semJornada && (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: "10%" }} />
                <col style={{ width: "6%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "6%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "6%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
              </colgroup>
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Dia</th>
                  {TURNOS.map((t) => (
                    <th key={t.key} colSpan={3} className="px-2 py-2 font-medium border-l border-border text-center">
                      Turno {t.label}
                    </th>
                  ))}
                </tr>
                <tr className="text-[10px]">
                  <th className="px-2 py-1" />
                  {TURNOS.map((t) => (
                    <React.Fragment key={t.key}>
                      <th className="px-1 py-1 font-medium border-l border-border text-center">Ativo</th>
                      <th className="px-1 py-1 font-medium text-center">Início</th>
                      <th className="px-1 py-1 font-medium text-center">Fim</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {DAYS.map((d) => {
                  const dia = form.jornada?.[d.key] ?? DEFAULT_JORNADA[d.key];
                  const setTurno = (tk: keyof DiaJornada, patch: Partial<Turno>) =>
                    setForm({
                      ...form,
                      jornada: {
                        ...form.jornada,
                        [d.key]: { ...dia, [tk]: { ...dia[tk], ...patch } },
                      },
                    });
                  return (
                    <tr key={d.key}>
                      <td className="px-2 py-2 font-medium whitespace-nowrap">{d.label}</td>
                      {TURNOS.map((t) => {
                        const tv = dia[t.key];
                        return (
                          <React.Fragment key={t.key}>
                            <td className="px-1 py-2 border-l border-border text-center">
                              <input type="checkbox" className="h-4 w-4 accent-primary" checked={tv.ativo}
                                onChange={(e) => setTurno(t.key, { ativo: e.target.checked })} />
                            </td>
                            <td className="px-1 py-2">
                              <Input type="time" className="w-full min-w-0 px-1 text-xs" value={tv.inicio} disabled={!tv.ativo}
                                onChange={(e) => setTurno(t.key, { inicio: e.target.value })} />
                            </td>
                            <td className="px-1 py-2">
                              <Input type="time" className="w-full min-w-0 px-1 text-xs" value={tv.fim} disabled={!tv.ativo}
                                onChange={(e) => setTurno(t.key, { fim: e.target.value })} />
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </section>
        </>)}
      </div>
    </Modal>
  );
}
