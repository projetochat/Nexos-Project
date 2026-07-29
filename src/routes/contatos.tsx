import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Input, Avatar, Badge, Field, Select } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { CONTACTS, CUSTOMERS, CATALOG, type ContactWithCustomer, type Customer, type Tag } from "@/lib/mvp";

export const Route = createFileRoute("/contatos")({ component: ContatosPage });

const PAGE_SIZE = 15;

const INSTANCIAS = ["FLOWID", "ZYVO", "ENORE"] as const;

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
}

async function syncContactTags(contactId: string, tagIds: string[]) {
  const current = await CONTACTS.tags(contactId);
  const currentIds = new Set(current.map((t) => t.id));
  const nextIds = new Set(tagIds);
  const toAdd = [...nextIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
  await Promise.all([
    ...toAdd.map((id) => CONTACTS.addTag(contactId, id)),
    ...toRemove.map((id) => CONTACTS.removeTag(contactId, id)),
  ]);
}


function ContatosPage() {
  const [contacts, setContacts] = React.useState<ContactWithCustomer[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "linked" | "unlinked">("all");
  const [instanciaFilter, setInstanciaFilter] = React.useState<string>("");
  const [departamentoFilter, setDepartamentoFilter] = React.useState<string>("");
  const [clienteFilter, setClienteFilter] = React.useState<string>("");
  const [page, setPage] = React.useState(1);

  const [editing, setEditing] = React.useState<ContactWithCustomer | null>(null);
  const [deleting, setDeleting] = React.useState<ContactWithCustomer | null>(null);
  const create = useDisclosure();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cs, cust] = await Promise.all([CONTACTS.list(), CUSTOMERS.list()]);
      setContacts(cs);
      setCustomers(cust);
    } catch (e) {
      toast.error("Falha ao carregar", { description: (e as Error).message });
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const departamentos = React.useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => { if (c.departamento) set.add(c.departamento); });
    return [...set].sort();
  }, [contacts]);

  const filtered = React.useMemo(() => {
    let out = contacts;
    if (filter === "linked") out = out.filter((c) => c.customer_id);
    else if (filter === "unlinked") out = out.filter((c) => !c.customer_id);
    if (instanciaFilter) out = out.filter((c) => c.instancia === instanciaFilter);
    if (departamentoFilter) out = out.filter((c) => c.departamento === departamentoFilter);
    if (clienteFilter) out = out.filter((c) => c.customer_id === clienteFilter);
    if (query) {
      const q = query.toLowerCase();
      out = out.filter((c) => (c.nome + " " + c.telefone + " " + (c.customer?.nome ?? "")).toLowerCase().includes(q));
    }
    return out;
  }, [contacts, query, filter, instanciaFilter, departamentoFilter, clienteFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const shown = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  React.useEffect(() => setPage(1), [query, filter, instanciaFilter, departamentoFilter, clienteFilter]);

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Contatos"
          subtitle={`${filtered.length} de ${contacts.length} contatos do WhatsApp.`}
          actions={
            <Button variant="primary" size="sm" onClick={create.show}>
              <Plus className="h-3.5 w-3.5" /> Novo contato
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_repeat(4,180px)]">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent py-2 text-sm outline-none"
                placeholder="Buscar por nome, telefone ou cliente…"
              />
            </div>
            <Select value={instanciaFilter} onChange={(e) => setInstanciaFilter(e.target.value)}>
              <option value="">Instância: Todas</option>
              {INSTANCIAS.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
            <Select value={departamentoFilter} onChange={(e) => setDepartamentoFilter(e.target.value)}>
              <option value="">Departamento: Todos</option>
              {departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)}>
              <option value="">Cliente: Todos</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">Vínculo: Todos</option>
              <option value="linked">Vinculados</option>
              <option value="unlinked">Sem cliente</option>
            </Select>
          </div>
        </Card>


        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Instância</th>
                <th className="px-4 py-3 font-medium">Departamento</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Carregando…</td></tr>
              )}
              {!loading && shown.map((c) => (
                <tr key={c.id} className="transition hover:bg-surface-1">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.nome} size={30} />
                      <p className="truncate font-medium">{c.nome}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.telefone}</td>
                  <td className="px-4 py-3">
                    {c.instancia ? (
                      <Badge tone="default" dot={false}>{c.instancia}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.departamento || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.customer ? (
                      c.customer.cor ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${c.customer.cor}1f`,
                            borderColor: `${c.customer.cor}66`,
                            color: c.customer.cor,
                          }}
                        >
                          <Link2 className="h-3 w-3" />{c.customer.nome}
                        </span>
                      ) : (
                        <Badge tone="info"><Link2 className="mr-1 h-3 w-3" />{c.customer.nome}</Badge>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">Não vinculado</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Editar" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" title="Excluir" onClick={() => setDeleting(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</td></tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t border-border bg-surface-1 px-4 py-3 text-xs text-muted-foreground">
            <span>Mostrando {shown.length} de {filtered.length}</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={pageSafe === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="font-mono">{pageSafe} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={pageSafe === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </Card>

        <ContactFormModal
          open={create.open}
          onClose={create.hide}
          customers={customers}
          onSubmit={async (data) => {
            try {
              const created = await CONTACTS.create(data);
              if (created?.id) await syncContactTags(created.id, data.tag_ids);
              toast.success("Contato criado");
              create.hide();
              await load();
            }
            catch (e) { toast.error("Falha ao criar", { description: (e as Error).message }); }
          }}
        />
        <ContactFormModal
          open={!!editing}
          initial={editing ?? undefined}
          customers={customers}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            if (!editing) return;
            try {
              await CONTACTS.update(editing.id, {
                nome: data.nome,
                telefone: data.telefone,
                email: data.email,
                departamento: data.departamento,
                nivel_gerencia: data.nivel_gerencia,
                instancia: data.instancia,
              });
              await CONTACTS.setCustomer(editing.id, data.customer_id ?? null);
              await syncContactTags(editing.id, data.tag_ids);
              toast.success("Contato atualizado");
              setEditing(null);
              await load();
            } catch (e) { toast.error("Falha ao salvar", { description: (e as Error).message }); }
          }}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Excluir contato?"
          description={`Esta ação removerá ${deleting?.nome ?? ""} permanentemente. Conversas associadas podem ficar órfãs.`}
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (!deleting) return;
            try { await CONTACTS.remove(deleting.id); toast.success("Contato excluído"); setDeleting(null); await load(); }
            catch (e) { toast.error("Falha ao excluir", { description: (e as Error).message }); }
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

function ContactFormModal({
  open, onClose, onSubmit, initial, customers,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  onSubmit: (data: { nome: string; telefone: string; customer_id: string | null; email: string | null; departamento: string | null; nivel_gerencia: "Colaborador" | "Supervisor" | "Gerente" | "Diretoria" | null; instancia: string | null; tag_ids: string[] }) => void | Promise<void>;
  initial?: ContactWithCustomer;
}) {
  const [nome, setNome] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [email, setEmail] = React.useState("");
  const [departamento, setDepartamento] = React.useState("");
  const [nivelGerencia, setNivelGerencia] = React.useState<"" | "Colaborador" | "Supervisor" | "Gerente" | "Diretoria">("");
  const [instancia, setInstancia] = React.useState<string>("");
  const [allTags, setAllTags] = React.useState<Tag[]>([]);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? "");
    setTelefone(initial?.telefone ?? "");
    setCustomerId(initial?.customer_id ?? "");
    setEmail(initial?.email ?? "");
    setDepartamento(initial?.departamento ?? "");
    setNivelGerencia((initial?.nivel_gerencia as "" | "Colaborador" | "Supervisor" | "Gerente" | "Diretoria") ?? "");
    setInstancia(initial?.instancia ?? "");
    setErrors({});
    void (async () => {
      try {
        const tags = await CATALOG.tags();
        setAllTags(tags);
      } catch { /* noop */ }
      if (initial?.id) {
        try {
          const current = await CONTACTS.tags(initial.id);
          setTagIds(current.map((t) => t.id));
        } catch { setTagIds([]); }
      } else {
        setTagIds([]);
      }
    })();
  }, [initial, open]);

  const toggleTag = (id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handle = () => {
    const errs: Record<string, string> = {};
    if (!nome.trim() || nome.trim().length < 2) errs.nome = "Informe o nome.";
    const digits = telefone.replace(/\D/g, "");
    if (digits.length < 10) errs.telefone = "Telefone inválido.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "E-mail inválido.";
    if (!departamento.trim()) errs.departamento = "Informe o departamento.";
    if (!customerId) errs.customerId = "Selecione o cliente.";
    if (Object.keys(errs).length) { setErrors(errs); toast.error("Verifique os campos destacados."); return; }
    void onSubmit({
      nome: nome.trim(),
      telefone,
      customer_id: customerId || null,
      email: email.trim() || null,
      departamento: departamento.trim() || null,
      nivel_gerencia: nivelGerencia || null,
      instancia: instancia || null,
      tag_ids: tagIds,
    });
  };

  return (
    <Modal
      open={open} onClose={onClose}
      title={initial ? "Editar contato" : "Novo contato"}
      description="Contato é a pessoa que conversa pelo WhatsApp. Você pode vincular a um cliente já cadastrado."
      size="lg"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={handle}>Salvar</Button></>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome *"><Input value={nome} onChange={(e) => setNome(e.target.value)} />{errors.nome && <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>}</Field>
        <Field label="Telefone *"><Input value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} placeholder="(11) 90000-0000" />{errors.telefone && <span className="mt-1 block text-[11px] text-destructive">{errors.telefone}</span>}</Field>
        <Field label="Departamento *"><Input value={departamento} onChange={(e) => setDepartamento(e.target.value)} placeholder="Ex.: Financeiro" />{errors.departamento && <span className="mt-1 block text-[11px] text-destructive">{errors.departamento}</span>}</Field>
        <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" />{errors.email && <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>}</Field>
        <Field label="Instância">
          <Select value={instancia} onChange={(e) => setInstancia(e.target.value)}>
            <option value="">— Selecione —</option>
            {INSTANCIAS.map((i) => <option key={i} value={i}>{i}</option>)}
          </Select>
        </Field>
        <Field label="Perfil na Empresa">
          <Select value={nivelGerencia} onChange={(e) => setNivelGerencia(e.target.value as "" | "Colaborador" | "Supervisor" | "Gerente" | "Diretoria")}>
            <option value="">— Selecione —</option>
            <option value="Colaborador">Colaborador</option>
            <option value="Supervisor">Supervisor</option>
            <option value="Gerente">Gerente</option>
            <option value="Diretoria">Diretoria</option>
          </Select>
        </Field>
        <Field label="Cliente *">
          <div className="flex gap-2">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— Selecione —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            {customerId && (
              <Button variant="ghost" size="sm" onClick={() => setCustomerId("")} title="Remover vínculo"><X className="h-3.5 w-3.5" /></Button>
            )}
          </div>
          {errors.customerId && <span className="mt-1 block text-[11px] text-destructive">{errors.customerId}</span>}
        </Field>
        <div className="md:col-span-2">
          <Field label="Etiquetas">
            {allTags.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">Nenhuma etiqueta cadastrada.</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allTags.map((t) => {
                  const active = tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${active ? "border-transparent text-white" : "border-border bg-surface-1 text-foreground hover:bg-surface-2"}`}
                      style={active ? { backgroundColor: t.cor } : undefined}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? "rgba(255,255,255,0.9)" : t.cor }} />
                      {t.nome}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </div>
      </div>
    </Modal>
  );
}
