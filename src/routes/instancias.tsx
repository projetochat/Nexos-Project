import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, QrCode, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Field, Input, Textarea, Select, Badge } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { supabase } from "@/integrations/supabase/client";
import { TIPOS_INSTANCIA, TipoBadge, getTipoInfo } from "@/components/instancia-tipos";

export const Route = createFileRoute("/instancias")({ component: Page });

type Instancia = {
  id: string;
  nome: string;
  tipo: string;
  provedor: string;
  telefone: string | null;
  cor: string;
  status: string;
  notas: string | null;
  mensagem_novo_contato: string | null;
  mensagem_contato_existente: string | null;
};

const VARIAVEIS = [
  { tag: "{{nome}}", desc: "Nome do contato" },
  { tag: "{{telefone}}", desc: "Telefone" },
  { tag: "{{email}}", desc: "E-mail" },
  { tag: "{{departamento}}", desc: "Departamento" },
  { tag: "{{cliente}}", desc: "Cliente vinculado" },
  { tag: "{{instancia}}", desc: "Nome da instância" },
];

function useInstancias() {
  return useQuery({
    queryKey: ["instancias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instancias").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as Instancia[];
    },
  });
}

function Page() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useInstancias();
  const [editing, setEditing] = React.useState<Instancia | null>(null);
  const [deleting, setDeleting] = React.useState<Instancia | null>(null);
  const novo = useDisclosure();

  const create = useMutation({
    mutationFn: async (d: Partial<Instancia>) => {
      const { error } = await supabase.from("instancias").insert({
        nome: d.nome!, tipo: d.tipo ?? "whatsapp",
        provedor: d.provedor ?? "evolution", telefone: d.telefone ?? null,
        cor: d.cor ?? getTipoInfo(d.tipo).color, status: d.status ?? "ativa", notas: d.notas ?? null,
        mensagem_novo_contato: d.mensagem_novo_contato ?? null,
        mensagem_contato_existente: d.mensagem_contato_existente ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instancias"] }); toast.success("Instância criada"); novo.hide(); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar"),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Instancia> }) => {
      const { error } = await supabase.from("instancias").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instancias"] }); toast.success("Instância atualizada"); setEditing(null); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instancias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instancias"] }); toast.success("Instância removida"); setDeleting(null); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader title="Instâncias" subtitle={`${items.length} instâncias cadastradas.`}
          actions={<Button variant="primary" size="sm" onClick={novo.show}><Plus className="h-3.5 w-3.5" /> Nova instância</Button>} />

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando…</Card>
        ) : items.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">Nenhuma instância cadastrada.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((i) => (
              <Card key={i.id}>
                <div className="flex items-start justify-between">
                  <TipoBadge tipo={i.tipo} />
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <p className="mt-4 font-semibold">{i.nome}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{getTipoInfo(i.tipo).label}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{i.telefone ?? "Sem número"}</p>
                <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Provedor</span><span>{i.provedor}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    {i.status === "ativa" ? (
                      <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Ativo</Badge>
                    ) : i.status === "pausada" ? (
                      <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> Pausada</Badge>
                    ) : (
                      <Badge tone="default">Desconectada</Badge>
                    )}
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Mensagens automáticas</span><span className={i.mensagem_novo_contato || i.mensagem_contato_existente ? "text-success" : "text-muted-foreground"}>{i.mensagem_novo_contato || i.mensagem_contato_existente ? "Configuradas" : "Não configuradas"}</span></div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => toast.success(`QR de ${i.nome} gerado`)}><QrCode className="h-3.5 w-3.5" /> QR</Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(i)}>Configurar</Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <InstanciaForm open={novo.open} onClose={novo.hide} onSubmit={(d) => create.mutate(d)} />
        <InstanciaForm open={!!editing} initial={editing ?? undefined} onClose={() => setEditing(null)}
          onSubmit={(d) => editing && update.mutate({ id: editing.id, patch: d })} />
        <ConfirmDialog open={!!deleting} title="Excluir instância?" destructive
          description={`Esta ação removerá ${deleting?.nome ?? ""}.`}
          confirmLabel="Excluir" onClose={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate(deleting.id)} />
      </PageContainer>
    </AppShell>
  );
}

function InstanciaForm({ open, onClose, onSubmit, initial }: { open: boolean; onClose: () => void; onSubmit: (d: Partial<Instancia>) => void; initial?: Instancia }) {
  const [form, setForm] = React.useState<Partial<Instancia>>({});
  const [error, setError] = React.useState("");
  const [focused, setFocused] = React.useState<"mensagem_novo_contato" | "mensagem_contato_existente" | null>("mensagem_novo_contato");
  React.useEffect(() => {
    setForm(initial ? { ...initial } : { tipo: "whatsapp", cor: getTipoInfo("whatsapp").color, provedor: "evolution", status: "ativa" });
    setError("");
  }, [initial, open]);
  const submit = () => {
    if (!form.nome || form.nome.trim().length < 2) { setError("Informe o nome."); return; }
    onSubmit(form);
  };
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar instância" : "Nova instância"} size="lg"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={submit}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Tipo de instância *">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIPOS_INSTANCIA.map((t) => {
              const active = (form.tipo ?? "whatsapp") === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tipo: t.value, cor: initial ? f.cor : t.color }))}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/50"}`}
                >
                  <TipoBadge tipo={t.value} size={28} />
                  <span className="font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Nome *">
          <Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value.toUpperCase() })} placeholder="FLOWID" />
          {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Provedor">
            <Select value={form.provedor ?? "evolution"} onChange={(e) => setForm({ ...form, provedor: e.target.value })}>
              <option value="evolution">Evolution API</option>
              <option value="meta">Meta Cloud API</option>
              <option value="baileys">Baileys</option>
              <option value="outro">Outro</option>
            </Select>
          </Field>
          <Field label="Telefone">
            <Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="+55 11 9…" />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Status">
            <Select value={form.status ?? "ativa"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="ativa">Ativa</option>
              <option value="pausada">Pausada</option>
              <option value="desconectada">Desconectada</option>
            </Select>
          </Field>
          <Field label="Cor">
            <div className="flex items-center gap-2">
              <input type="color" value={form.cor ?? "#6366f1"} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent" />
              <Input value={form.cor ?? "#6366f1"} onChange={(e) => setForm({ ...form, cor: e.target.value })} />
            </div>
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Variáveis disponíveis</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Clique para inserir no campo em foco.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {VARIAVEIS.map((v) => (
              <button
                key={v.tag}
                type="button"
                title={v.desc}
                onClick={() => {
                  const target = focused;
                  if (!target) return;
                  const current = form[target] ?? "";
                  setForm({ ...form, [target]: `${current}${v.tag}` });
                }}
                className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground hover:border-primary hover:text-primary transition"
              >
                {v.tag}
              </button>
            ))}
          </div>
        </div>

        <Field label="Mensagem para novo contato" hint="Enviada quando o número ainda não está cadastrado.">
          <Textarea
            rows={3}
            value={form.mensagem_novo_contato ?? ""}
            onFocus={() => setFocused("mensagem_novo_contato")}
            onChange={(e) => setForm({ ...form, mensagem_novo_contato: e.target.value })}
            placeholder="Olá! Seja bem-vindo(a). Poderia informar seu nome para iniciarmos o atendimento?"
          />
        </Field>

        <Field label="Mensagem para contato existente" hint="Enviada quando o contato já está cadastrado no sistema.">
          <Textarea
            rows={3}
            value={form.mensagem_contato_existente ?? ""}
            onFocus={() => setFocused("mensagem_contato_existente")}
            onChange={(e) => setForm({ ...form, mensagem_contato_existente: e.target.value })}
            placeholder="Olá {{nome}}, que bom te ver de novo! Como podemos ajudar hoje?"
          />
        </Field>

        <Field label="Notas">
          <Textarea rows={2} value={form.notas ?? ""} onFocus={() => setFocused(null)} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
