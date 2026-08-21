import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { Avatar, Button, Card, Field, Input, SectionHeader, Textarea } from "@/components/ui-kit";
import { isValidEmail, maskBrazilPhone } from "@/lib/input-masks";
import { crmApi, type ApiContact, type ApiCustomer } from "@/lib/nexos-api";

export const Route = createFileRoute("/clientes")({ component: ClientesPage });

const PAGE_SIZE = 12;

type Customer = ApiCustomer;
type Contact = ApiContact;
type CustomerFormData = Partial<Customer> & { nome: string };

function ClientesPage() {
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [deleting, setDeleting] = React.useState<Customer | null>(null);
  const [linking, setLinking] = React.useState<Customer | null>(null);
  const create = useDisclosure();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await crmApi.listCustomers({ q: query, page, pageSize: PAGE_SIZE });
      setCustomers(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (e) {
      toast.error("Falha ao carregar clientes", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  const pageSafe = Math.min(page, totalPages);

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Clientes"
          subtitle={`${total} clientes cadastrados.`}
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
              placeholder="Buscar por nome..."
            />
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Contato responsavel</th>
                <th className="px-4 py-3 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading &&
                customers.map((c) => (
                  <tr key={c.id} className="transition hover:bg-surface-1">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.nome} size={30} />
                        {c.cor && (
                          <span
                            className="inline-block h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: c.cor }}
                            aria-label={`Cor ${c.cor}`}
                          />
                        )}
                        <p className="truncate font-medium">{c.nome}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.contato_responsavel ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Contatos vinculados"
                          onClick={() => setLinking(c)}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Editar"
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Excluir"
                          onClick={() => setDeleting(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t border-border bg-surface-1 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Mostrando {customers.length} de {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pageSafe === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="font-mono">
                {pageSafe} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pageSafe === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>

        <CustomerFormModal
          open={create.open}
          onClose={create.hide}
          onSubmit={async (data) => {
            try {
              await crmApi.createCustomer(customerPayload(data));
              toast.success("Cliente criado");
              create.hide();
              await load();
            } catch (e) {
              toast.error("Falha ao criar", { description: (e as Error).message });
            }
          }}
        />
        <CustomerFormModal
          open={!!editing}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            if (!editing) return;
            try {
              await crmApi.updateCustomer(editing.id, customerPayload(data));
              toast.success("Cliente atualizado");
              setEditing(null);
              await load();
            } catch (e) {
              toast.error("Falha ao salvar", { description: (e as Error).message });
            }
          }}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Excluir cliente?"
          description={`Esta acao arquivara ${deleting?.nome ?? ""}. Contatos vinculados serao desvinculados.`}
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (!deleting) return;
            try {
              await crmApi.deleteCustomer(deleting.id);
              toast.success("Cliente excluido");
              setDeleting(null);
              await load();
            } catch (e) {
              toast.error("Falha ao excluir", { description: (e as Error).message });
            }
          }}
        />
        <LinkedContactsModal customer={linking} onClose={() => setLinking(null)} />
      </PageContainer>
    </AppShell>
  );
}

function CustomerFormModal({
  open,
  onClose,
  onSubmit,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CustomerFormData) => void | Promise<void>;
  initial?: Customer;
}) {
  const [form, setForm] = React.useState<Partial<Customer>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setForm(
      initial
        ? {
            ...initial,
            telefone: initial.telefone ? maskBrazilPhone(initial.telefone) : initial.telefone,
          }
        : {},
    );
    setErrors({});
  }, [initial, open]);

  const handle = () => {
    const errs: Record<string, string> = {};
    if (!form.nome || form.nome.trim().length < 2) errs.nome = "Informe o nome.";
    if (form.email?.trim() && !isValidEmail(form.email)) errs.email = "E-mail invalido.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Verifique os campos destacados.");
      return;
    }
    void onSubmit({ ...form, nome: form.nome!.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar cliente" : "Novo cliente"}
      description="Cliente e a empresa/pessoa juridica atendida. Contatos sao as pessoas que conversam pelo WhatsApp."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={handle}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <Field label="Nome *">
          <Input
            value={form.nome ?? ""}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          {errors.nome && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>
          )}
        </Field>
        <Field label="Contato responsavel">
          <Input
            value={form.contato_responsavel ?? ""}
            onChange={(e) => setForm({ ...form, contato_responsavel: e.target.value })}
            placeholder="Nome do responsavel"
          />
        </Field>
        <Field label="Telefone">
          <Input
            value={form.telefone ?? ""}
            onChange={(e) => setForm({ ...form, telefone: maskBrazilPhone(e.target.value) })}
            placeholder="(11) 90000-0000"
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="nome@empresa.com"
          />
          {errors.email && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>
          )}
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
          <Field label="Notas">
            <Textarea
              rows={3}
              value={form.notas ?? ""}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function LinkedContactsModal({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const [linked, setLinked] = React.useState<Contact[]>([]);
  const [available, setAvailable] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [q, setQ] = React.useState("");

  const load = React.useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    try {
      const [linkedContacts, availableContacts] = await Promise.all([
        crmApi.listCustomerContacts(customer.id),
        crmApi.listContacts({ linked: "unlinked", q, pageSize: 30 }),
      ]);
      setLinked(linkedContacts);
      setAvailable(availableContacts.items);
    } catch (e) {
      toast.error("Falha ao carregar contatos", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [customer, q]);

  React.useEffect(() => {
    if (customer) void load();
    else {
      setLinked([]);
      setAvailable([]);
      setQ("");
    }
  }, [customer, load]);

  if (!customer) return null;

  async function link(contactId: string) {
    try {
      await crmApi.updateContact(contactId, { customerId: customer!.id });
      toast.success("Contato vinculado");
      await load();
    } catch (e) {
      toast.error("Falha ao vincular", { description: (e as Error).message });
    }
  }

  async function unlink(contactId: string) {
    try {
      await crmApi.updateContact(contactId, { customerId: null });
      toast.success("Contato desvinculado");
      await load();
    } catch (e) {
      toast.error("Falha ao desvincular", { description: (e as Error).message });
    }
  }

  return (
    <Modal
      open={!!customer}
      onClose={onClose}
      title={`Contatos - ${customer.nome}`}
      size="lg"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Vinculados ({linked.length})
          </p>
          {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!loading && linked.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum contato vinculado ainda.</p>
          )}
          <ul className="space-y-1.5">
            {linked.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={c.nome} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {maskBrazilPhone(c.telefone)}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => unlink(c.id)}>
                  Desvincular
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Vincular contato existente
          </p>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full bg-transparent py-2 text-sm outline-none"
              placeholder="Buscar contato sem cliente..."
            />
          </div>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {available.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={c.nome} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {maskBrazilPhone(c.telefone)}
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => link(c.id)}>
                  <Link2 className="h-3.5 w-3.5" /> Vincular
                </Button>
              </li>
            ))}
            {available.length === 0 && (
              <li className="text-xs text-muted-foreground">Nenhum contato disponivel.</li>
            )}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" /> Novos contatos sao cadastrados na pagina <b>Contatos</b>.
          </p>
        </section>
      </div>
    </Modal>
  );
}

function customerPayload(data: CustomerFormData) {
  return {
    name: data.nome,
    responsibleContactName: data.contato_responsavel?.trim() || null,
    phone: data.telefone?.trim() || null,
    email: data.email?.trim() || null,
    color: data.cor || "#3b82f6",
    notes: data.notas?.trim() || null,
  };
}
