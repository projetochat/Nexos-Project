import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Pencil, Trash2, Link2, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Input, Avatar, Field, Textarea } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { CUSTOMERS, CONTACTS, type Customer, type Contact } from "@/lib/mvp";

export const Route = createFileRoute("/clientes")({ component: ClientesPage });

const PAGE_SIZE = 12;


function ClientesPage() {
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [deleting, setDeleting] = React.useState<Customer | null>(null);
  const [linking, setLinking] = React.useState<Customer | null>(null);
  const create = useDisclosure();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setCustomers(await CUSTOMERS.list());
    } catch (e) {
      toast.error("Falha ao carregar clientes", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const filtered = React.useMemo(() => {
    if (!query) return customers;
    const q = query.toLowerCase();
    return customers.filter((c) => c.nome.toLowerCase().includes(q));
  }, [customers, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const shown = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  React.useEffect(() => setPage(1), [query]);

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Clientes"
          subtitle={`${filtered.length} de ${customers.length} clientes cadastrados.`}
          actions={
            <Button variant="primary" size="sm" onClick={create.show}>
              <Plus className="h-3.5 w-3.5" /> Novo cliente
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent py-2 text-sm outline-none"
              placeholder="Buscar por nome…"
            />
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Contato responsável</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">Carregando…</td></tr>
              )}
              {!loading && shown.map((c) => (
                <tr key={c.id} className="transition hover:bg-surface-1">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.nome} size={30} />
                      {c.cor && <span className="inline-block h-3 w-3 rounded-full border border-border" style={{ backgroundColor: c.cor }} aria-label={`Cor ${c.cor}`} />}
                      <p className="truncate font-medium">{c.nome}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.contato_responsavel ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Contatos vinculados" onClick={() => setLinking(c)}><Link2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" title="Editar" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" title="Excluir" onClick={() => setDeleting(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</td></tr>
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

        <CustomerFormModal
          open={create.open}
          onClose={create.hide}
          onSubmit={async (data) => {
            try { await CUSTOMERS.create(data as Partial<Customer> & { nome: string }); toast.success("Cliente criado"); create.hide(); await load(); }
            catch (e) { toast.error("Falha ao criar", { description: (e as Error).message }); }
          }}
        />
        <CustomerFormModal
          open={!!editing}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            if (!editing) return;
            try { await CUSTOMERS.update(editing.id, data); toast.success("Cliente atualizado"); setEditing(null); await load(); }
            catch (e) { toast.error("Falha ao salvar", { description: (e as Error).message }); }
          }}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Excluir cliente?"
          description={`Esta ação removerá permanentemente ${deleting?.nome ?? ""}. Contatos vinculados serão desvinculados.`}
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (!deleting) return;
            try { await CUSTOMERS.remove(deleting.id); toast.success("Cliente excluído"); setDeleting(null); await load(); }
            catch (e) { toast.error("Falha ao excluir", { description: (e as Error).message }); }
          }}
        />
        <LinkedContactsModal
          customer={linking}
          onClose={() => setLinking(null)}
        />
      </PageContainer>
    </AppShell>
  );
}

function CustomerFormModal({
  open, onClose, onSubmit, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Customer> & { nome: string }) => void | Promise<void>;
  initial?: Customer;
}) {
  const [form, setForm] = React.useState<Partial<Customer>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setForm(initial ? { ...initial } : {});
    setErrors({});
  }, [initial, open]);

  const handle = () => {
    const errs: Record<string, string> = {};
    if (!form.nome || form.nome.trim().length < 2) errs.nome = "Informe o nome.";
    if (Object.keys(errs).length) { setErrors(errs); toast.error("Verifique os campos destacados."); return; }
    void onSubmit({ ...form, nome: form.nome!.trim() });
  };

  return (
    <Modal
      open={open} onClose={onClose}
      title={initial ? "Editar cliente" : "Novo cliente"}
      description="Cliente é a empresa/pessoa jurídica atendida. Contatos são as pessoas que conversam pelo WhatsApp."
      size="lg"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button variant="primary" size="sm" onClick={handle}>Salvar</Button></>}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />{errors.nome && <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>}</Field>
        <Field label="Contato responsável">
          <Input
            value={form.contato_responsavel ?? ""}
            onChange={(e) => setForm({ ...form, contato_responsavel: e.target.value })}
            placeholder="Nome do responsável"
          />
        </Field>
        <Field label="Cor">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-1.5">
            <input
              type="color"
              value={form.cor ?? "#3b82f6"}
              onChange={(e) => setForm({ ...form, cor: e.target.value })}
              className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0"
              aria-label="Selecionar cor"
            />
            <input
              type="text"
              value={form.cor ?? ""}
              onChange={(e) => setForm({ ...form, cor: e.target.value })}
              placeholder="#3B82F6"
              maxLength={7}
              className="w-24 bg-transparent font-mono text-xs uppercase outline-none"
            />
          </div>
        </Field>
        <div className="md:col-span-3">
          <Field label="Notas"><Textarea rows={3} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function LinkedContactsModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const [linked, setLinked] = React.useState<Contact[]>([]);
  const [available, setAvailable] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [q, setQ] = React.useState("");

  const load = React.useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    try {
      const [ls, all] = await Promise.all([CUSTOMERS.contactsOf(customer.id), CONTACTS.list()]);
      setLinked(ls);
      setAvailable(all.filter((c) => c.customer_id == null));
    } finally { setLoading(false); }
  }, [customer]);
  React.useEffect(() => { if (customer) void load(); else { setLinked([]); setAvailable([]); setQ(""); } }, [customer, load]);

  if (!customer) return null;

  const filteredAvail = q ? available.filter((c) => (c.nome + " " + c.telefone).toLowerCase().includes(q.toLowerCase())) : available;

  async function link(contactId: string) {
    try { await CONTACTS.setCustomer(contactId, customer!.id); toast.success("Contato vinculado"); await load(); }
    catch (e) { toast.error("Falha ao vincular", { description: (e as Error).message }); }
  }
  async function unlink(contactId: string) {
    try { await CONTACTS.setCustomer(contactId, null); toast.success("Contato desvinculado"); await load(); }
    catch (e) { toast.error("Falha ao desvincular", { description: (e as Error).message }); }
  }

  return (
    <Modal open={!!customer} onClose={onClose} title={`Contatos · ${customer.nome}`} size="lg"
      footer={<Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>}>
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Vinculados ({linked.length})</p>
          {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {!loading && linked.length === 0 && <p className="text-xs text-muted-foreground">Nenhum contato vinculado ainda.</p>}
          <ul className="space-y-1.5">
            {linked.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3 py-2">
                <div className="flex items-center gap-3">
                  <Avatar name={c.nome} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{c.telefone}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => unlink(c.id)}>Desvincular</Button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Vincular contato existente</p>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Buscar contato sem cliente…" />
          </div>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {filteredAvail.slice(0, 30).map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3 py-2">
                <div className="flex items-center gap-3">
                  <Avatar name={c.nome} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{c.telefone}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => link(c.id)}><Link2 className="h-3.5 w-3.5" /> Vincular</Button>
              </li>
            ))}
            {filteredAvail.length === 0 && <li className="text-xs text-muted-foreground">Nenhum contato disponível.</li>}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" /> Novos contatos são cadastrados na página <b>Contatos</b>.
          </p>
        </section>
      </div>
    </Modal>
  );
}
