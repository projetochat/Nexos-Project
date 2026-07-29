import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Megaphone, Pencil, Trash2, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Badge, Field, Input, Select } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { useStore } from "@/lib/mock/store";
import type { Campanha } from "@/lib/mock/types";
import { num, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/campanhas")({ component: Page });

const TONE: Record<Campanha["status"], "brand" | "info" | "success" | "warning" | "default"> = {
  rascunho: "default", agendada: "info", enviando: "brand", concluida: "success", pausada: "warning",
};

function Page() {
  const campanhas = useStore((s) => s.campanhas);
  const create = useStore((s) => s.createCampanha);
  const update = useStore((s) => s.updateCampanha);
  const remove = useStore((s) => s.deleteCampanha);

  const [statusFilter, setStatusFilter] = React.useState("all");
  const [editing, setEditing] = React.useState<Campanha | null>(null);
  const [deleting, setDeleting] = React.useState<Campanha | null>(null);
  const nova = useDisclosure();

  const filtered = campanhas.filter((c) => statusFilter === "all" || c.status === statusFilter);

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader title="Campanhas" subtitle={`${campanhas.length} campanhas cadastradas.`}
          actions={<Button variant="primary" size="sm" onClick={nova.show}><Plus className="h-3.5 w-3.5" /> Nova campanha</Button>} />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[200px_1fr]">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos os status</option>
              <option>rascunho</option><option>agendada</option><option>enviando</option><option>concluida</option><option>pausada</option>
            </Select>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((c) => {
            const taxaEntrega = c.enviadas ? Math.round((c.entregues / c.enviadas) * 100) : 0;
            const taxaLeitura = c.entregues ? Math.round((c.lidas / c.entregues) * 100) : 0;
            const taxaResposta = c.lidas ? Math.round((c.respondidas / c.lidas) * 100) : 0;
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary"><Megaphone className="h-5 w-5" /></div>
                  <Badge tone={TONE[c.status]}>{c.status}</Badge>
                </div>
                <p className="mt-4 font-semibold">{c.nome}</p>
                <p className="mt-1 text-xs text-muted-foreground">Criada em {fmtDate(c.criadaEm)} · {num(c.publico)} contatos</p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                  <div><p className="font-mono text-lg font-semibold">{taxaEntrega}%</p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Entrega</p></div>
                  <div><p className="font-mono text-lg font-semibold">{taxaLeitura}%</p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Leitura</p></div>
                  <div><p className="font-mono text-lg font-semibold">{taxaResposta}%</p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Resposta</p></div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-1 border-t border-border pt-3">
                  {c.status === "enviando" && <Button variant="ghost" size="sm" onClick={() => { update(c.id, { status: "pausada" }); toast.success("Campanha pausada"); }}><Pause className="h-3.5 w-3.5" /></Button>}
                  {c.status === "pausada" && <Button variant="ghost" size="sm" onClick={() => { update(c.id, { status: "enviando" }); toast.success("Campanha retomada"); }}><Play className="h-3.5 w-3.5" /></Button>}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </Card>
            );
          })}
        </div>

        <CampanhaForm open={nova.open} onClose={nova.hide} onSubmit={(d) => { create(d); toast.success("Campanha criada"); nova.hide(); }} />
        <CampanhaForm open={!!editing} initial={editing ?? undefined} onClose={() => setEditing(null)}
          onSubmit={(d) => { if (editing) { update(editing.id, d); toast.success("Campanha atualizada"); } setEditing(null); }} />
        <ConfirmDialog open={!!deleting} title="Excluir campanha?" destructive
          description={`Isto removerá "${deleting?.nome ?? ""}" permanentemente.`}
          confirmLabel="Excluir" onClose={() => setDeleting(null)}
          onConfirm={() => { if (deleting) { remove(deleting.id); toast.success("Campanha removida"); } }} />
      </PageContainer>
    </AppShell>
  );
}

function TagPicker({
  label, selected, onChange,
}: { label: string; selected: string[]; onChange: (v: string[]) => void }) {
  const etiquetas = useStore((s) => s.etiquetas);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <Field label={label}>
      {etiquetas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((e) => {
            const on = selected.includes(e.id);
            return (
              <button
                type="button"
                key={e.id}
                onClick={() => toggle(e.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  on ? "border-transparent text-white" : "border-border bg-surface-1 text-muted-foreground hover:text-foreground"
                }`}
                style={on ? { background: e.cor } : undefined}
              >
                {e.nome}
              </button>
            );
          })}
        </div>
      )}
    </Field>
  );
}

function CampanhaForm({ open, onClose, onSubmit, initial }: { open: boolean; onClose: () => void; onSubmit: (d: Partial<Campanha>) => void; initial?: Campanha }) {
  const [form, setForm] = React.useState<Partial<Campanha>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    setForm(
      initial
        ? { ...initial }
        : { status: "rascunho", publico: 100, intervaloSegundos: 15, aceitouIntervalo: false, etiquetasClientes: [], etiquetasContatos: [], etiquetasInstancias: [] },
    );
    setErrors({});
  }, [initial, open]);
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.nome || form.nome.trim().length < 3) errs.nome = "Informe o nome.";
    if (!form.publico || form.publico < 1) errs.publico = "Público deve ser maior que 0.";
    if (!form.intervaloSegundos || form.intervaloSegundos < 1) errs.intervaloSegundos = "Intervalo inválido.";
    if (!form.aceitouIntervalo) errs.aceitouIntervalo = "Você precisa concordar com o intervalo entre mensagens.";
    if (Object.keys(errs).length) { setErrors(errs); toast.error("Verifique os campos."); return; }
    onSubmit(form);
  };
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar campanha" : "Nova campanha"} size="lg"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={submit}>Salvar</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />{errors.nome && <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>}</Field></div>
        <Field label="Público (contatos) *"><Input type="number" value={form.publico ?? 0} onChange={(e) => setForm({ ...form, publico: Number(e.target.value) })} />{errors.publico && <span className="mt-1 block text-[11px] text-destructive">{errors.publico}</span>}</Field>
        <Field label="Status"><Select value={form.status ?? "rascunho"} onChange={(e) => setForm({ ...form, status: e.target.value as Campanha["status"] })}><option>rascunho</option><option>agendada</option><option>enviando</option><option>concluida</option><option>pausada</option></Select></Field>

        <div className="md:col-span-2 mt-1 rounded-lg border border-border bg-surface-1 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Filtros por etiquetas</p>
          <div className="grid gap-3 md:grid-cols-3">
            <TagPicker label="Clientes" selected={form.etiquetasClientes ?? []} onChange={(v) => setForm({ ...form, etiquetasClientes: v })} />
            <TagPicker label="Contatos" selected={form.etiquetasContatos ?? []} onChange={(v) => setForm({ ...form, etiquetasContatos: v })} />
            <TagPicker label="Instâncias" selected={form.etiquetasInstancias ?? []} onChange={(v) => setForm({ ...form, etiquetasInstancias: v })} />
          </div>
        </div>

        <Field label="Intervalo entre mensagens (segundos) *">
          <Input
            type="number"
            min={1}
            value={form.intervaloSegundos ?? 15}
            onChange={(e) => setForm({ ...form, intervaloSegundos: Number(e.target.value) })}
          />
          {errors.intervaloSegundos && <span className="mt-1 block text-[11px] text-destructive">{errors.intervaloSegundos}</span>}
        </Field>
        <div className="md:col-span-2">
          <label className="flex items-start gap-2 rounded-lg border border-border bg-surface-1 p-3 text-xs">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={!!form.aceitouIntervalo}
              onChange={(e) => setForm({ ...form, aceitouIntervalo: e.target.checked })}
            />
            <span className="text-muted-foreground">
              Concordo em respeitar o intervalo de <strong className="text-foreground">{form.intervaloSegundos ?? 15}s</strong> entre o envio de cada mensagem para evitar bloqueios e garantir a entrega.
            </span>
          </label>
          {errors.aceitouIntervalo && <span className="mt-1 block text-[11px] text-destructive">{errors.aceitouIntervalo}</span>}
        </div>
      </div>
    </Modal>
  );
}
