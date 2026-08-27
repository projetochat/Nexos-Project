import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
import { Button, Card, Field, Input, SectionHeader, Select, Textarea } from "@/components/ui-kit";
import { crmApi, type ApiContactCustomField } from "@/lib/nexos-api";

export const Route = createFileRoute("/configuracoes/campos-contato")({ component: ContactFieldsSettings });

type FieldForm = {
  label: string;
  type: ApiContactCustomField["type"];
  required: boolean;
  mask: string;
  note: string;
  optionsText: string;
};

function ContactFieldsSettings() {
  const [fields, setFields] = React.useState<ApiContactCustomField[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<ApiContactCustomField | null>(null);
  const [deleting, setDeleting] = React.useState<ApiContactCustomField | null>(null);
  const create = useDisclosure();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setFields(await crmApi.listContactCustomFields());
    } catch (error) {
      toast.error("Falha ao carregar campos", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const save = async (data: FieldForm) => {
    const payload = {
      label: data.label.trim(),
      type: data.type,
      required: data.required,
      mask: data.type === "number" ? data.mask || "#.###,##" : null,
      note: data.note.trim() || null,
      options: data.type === "list" ? data.optionsText.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) : [],
    };
    try {
      editing ? await crmApi.updateContactCustomField(editing.id, payload) : await crmApi.createContactCustomField(payload);
      toast.success(editing ? "Campo atualizado" : "Campo criado");
      create.hide();
      setEditing(null);
      await load();
    } catch (error) {
      toast.error("Falha ao salvar campo", { description: (error as Error).message });
    }
  };

  return (
    <Card className="p-5">
      <SectionHeader title="Campos adicionais de contato" subtitle="Defina campos que aparecem no cadastro e edição de contatos." actions={<Button variant="primary" size="sm" onClick={create.show}><Plus className="h-3.5 w-3.5" /> Novo campo</Button>} />
      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr><th className="w-[28%] px-4 py-3">Campo</th><th className="w-28 px-4 py-3">Tipo</th><th className="w-28 px-4 py-3">Obrigatório</th><th className="px-4 py-3">Nota</th><th className="w-24 px-4 py-3 text-right">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>}
            {!loading && fields.map((field) => <tr key={field.id} className="hover:bg-surface-1"><td className="px-4 py-3 font-medium">{field.label}</td><td className="px-4 py-3 text-muted-foreground">{fieldTypeLabel(field.type)}</td><td className="px-4 py-3 text-muted-foreground">{field.required ? "Sim" : "Não"}</td><td className="px-4 py-3 text-muted-foreground">{field.note || "-"}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" title="Editar" onClick={() => setEditing(field)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" title="Excluir" onClick={() => setDeleting(field)}><Trash2 className="h-3.5 w-3.5" /></Button></div></td></tr>)}
            {!loading && fields.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum campo adicional cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <ContactFieldFormModal open={create.open || !!editing} initial={editing ?? undefined} onClose={() => { create.hide(); setEditing(null); }} onSubmit={save} />
      <ConfirmDialog open={!!deleting} title="Excluir campo?" description={`Esta acao removera ${deleting?.label ?? ""} dos novos cadastros.`} destructive confirmLabel="Excluir" onClose={() => setDeleting(null)} onConfirm={async () => { if (!deleting) return; await crmApi.deleteContactCustomField(deleting.id); toast.success("Campo excluido"); setDeleting(null); await load(); }} />
    </Card>
  );
}

function ContactFieldFormModal({ open, onClose, onSubmit, initial }: { open: boolean; onClose: () => void; onSubmit: (data: FieldForm) => void | Promise<void>; initial?: ApiContactCustomField }) {
  const [form, setForm] = React.useState<FieldForm>({ label: "", type: "text", required: false, mask: "#.###,##", note: "", optionsText: "" });
  React.useEffect(() => { if (!open) return; setForm(initial ? { label: initial.label, type: initial.type, required: initial.required, mask: initial.mask ?? "#.###,##", note: initial.note ?? "", optionsText: initial.options.join("\n") } : { label: "", type: "text", required: false, mask: "#.###,##", note: "", optionsText: "" }); }, [initial, open]);
  const save = () => { if (form.label.trim().length < 2) { toast.error("Informe o nome do campo."); return; } if (form.type === "list" && !form.optionsText.trim()) { toast.error("Informe as opções da lista."); return; } void onSubmit(form); };
  return <Modal open={open} onClose={onClose} title={initial ? "Editar campo" : "Novo campo"} footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={save}>Salvar</Button></>}><div className="space-y-4"><Field label="Nome *"><Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></Field><Field label="Tipo *"><Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as FieldForm["type"] })}><option value="text">Texto</option><option value="number">Número</option><option value="checkbox">Checkbox</option><option value="list">Lista</option></Select></Field>{form.type === "number" && <Field label="Máscara"><Input value={form.mask} onChange={(event) => setForm({ ...form, mask: event.target.value })} placeholder="#.###,##" /></Field>}{form.type === "list" && <Field label="Opções da lista *"><Textarea rows={4} value={form.optionsText} onChange={(event) => setForm({ ...form, optionsText: event.target.value })} placeholder="Uma opção por linha" /></Field>}<label className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm"><input type="checkbox" checked={form.required} onChange={(event) => setForm({ ...form, required: event.target.checked })} /> Campo obrigatório</label><Field label="Nota explicativa"><Textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Explique o motivo deste campo." /></Field></div></Modal>;
}

function fieldTypeLabel(type: ApiContactCustomField["type"]) {
  return { text: "Texto", number: "Número", checkbox: "Checkbox", list: "Lista" }[type];
}
