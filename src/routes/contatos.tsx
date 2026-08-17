import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Link2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionHeader,
  Select,
} from "@/components/ui-kit";
import type { ConnectedConnectionOption } from "@/lib/connection-options";
import { connectionPrimaryLabel, hasExampleInstanceName } from "@/lib/connection-options";
import { crmApi, type ApiContact, type ApiCustomer, type ApiTag } from "@/lib/nexos-api";
import { useConnectedMessagingConnections } from "@/lib/use-connected-messaging-connections";

export const Route = createFileRoute("/contatos")({ component: ContatosPage });

const PAGE_SIZE = 15;

type Customer = ApiCustomer;
type Contact = ApiContact;
type Tag = ApiTag;
type FilterMode = "all" | "linked" | "unlinked";
type RoleLabel = "Colaborador" | "Supervisor" | "Gerente" | "Diretoria";
type RoleCode = "COLABORADOR" | "SUPERVISOR" | "GERENTE" | "DIRETORIA";

const ROLE_TO_API: Record<RoleLabel, RoleCode> = {
  Colaborador: "COLABORADOR",
  Supervisor: "SUPERVISOR",
  Gerente: "GERENTE",
  Diretoria: "DIRETORIA",
};

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
}

function ContatosPage() {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [departments, setDepartments] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [instanciaFilter, setInstanciaFilter] = React.useState("");
  const [departamentoFilter, setDepartamentoFilter] = React.useState("");
  const [clienteFilter, setClienteFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [deleting, setDeleting] = React.useState<Contact | null>(null);
  const create = useDisclosure();
  const { connectionOptions, error: connectionsError } = useConnectedMessagingConnections();
  const connectionLabelByValue = React.useMemo(
    () =>
      new Map(
        connectionOptions.map((option) => [
          option.value,
          connectionPrimaryLabel(option.connection),
        ]),
      ),
    [connectionOptions],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [contactResponse, customerResponse, options] = await Promise.all([
        crmApi.listContacts({
          q: query,
          page,
          pageSize: PAGE_SIZE,
          linked: filter,
          instance: instanciaFilter,
          department: departamentoFilter,
          customerId: clienteFilter,
        }),
        crmApi.listCustomers({ pageSize: 100 }),
        crmApi.contactOptions(),
      ]);
      setContacts(contactResponse.items);
      setTotal(contactResponse.total);
      setTotalPages(contactResponse.totalPages);
      setCustomers(customerResponse.items);
      setTags(options.tags);
      setDepartments(options.departments);
    } catch (e) {
      toast.error("Falha ao carregar", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [clienteFilter, departamentoFilter, filter, instanciaFilter, page, query]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [query, filter, instanciaFilter, departamentoFilter, clienteFilter]);

  const pageSafe = Math.min(page, totalPages);

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Contatos"
          subtitle={`${total} contatos do WhatsApp.`}
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
                placeholder="Buscar por nome, telefone ou cliente..."
              />
            </div>
            <Select value={instanciaFilter} onChange={(e) => setInstanciaFilter(e.target.value)}>
              <option value="">Instancia: Todas</option>
              {connectionOptions.map((option) => (
                <option key={option.id} value={option.value}>
                  {connectionPrimaryLabel(option.connection)}
                </option>
              ))}
            </Select>
            <Select
              value={departamentoFilter}
              onChange={(e) => setDepartamentoFilter(e.target.value)}
            >
              <option value="">Departamento: Todos</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            <Select value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)}>
              <option value="">Cliente: Todos</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as FilterMode)}>
              <option value="all">Vinculo: Todos</option>
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
                <th className="px-4 py-3 font-medium">Instancia</th>
                <th className="px-4 py-3 font-medium">Departamento</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading &&
                contacts.map((c) => (
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
                        <Badge tone="default" dot={false}>
                          {connectionLabelByValue.get(c.instancia) ?? c.instancia}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.departamento || <span className="text-muted-foreground">-</span>}
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
                            <Link2 className="h-3 w-3" />
                            {c.customer.nome}
                          </span>
                        ) : (
                          <Badge tone="info">
                            <Link2 className="mr-1 h-3 w-3" />
                            {c.customer.nome}
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">Nao vinculado</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
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
              {!loading && contacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Nenhum contato encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t border-border bg-surface-1 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Mostrando {contacts.length} de {total}
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

        <ContactFormModal
          open={create.open}
          onClose={create.hide}
          customers={customers}
          tags={tags}
          connectionOptions={connectionOptions}
          connectionsError={connectionsError}
          onSubmit={async (data) => {
            try {
              const contact = await crmApi.createContact(contactPayload(data));
              toast.success(
                contact.lifecycle === "restored" ? "Contato restaurado" : "Contato criado",
                contact.lifecycle === "restored"
                  ? { description: "O contato arquivado com este telefone voltou para a lista." }
                  : undefined,
              );
              create.hide();
              await load();
            } catch (e) {
              toast.error("Falha ao criar", { description: (e as Error).message });
            }
          }}
        />
        <ContactFormModal
          open={!!editing}
          initial={editing ?? undefined}
          customers={customers}
          tags={tags}
          connectionOptions={connectionOptions}
          connectionsError={connectionsError}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            if (!editing) return;
            try {
              await crmApi.updateContact(editing.id, contactPayload(data));
              toast.success("Contato atualizado");
              setEditing(null);
              await load();
            } catch (e) {
              toast.error("Falha ao salvar", { description: (e as Error).message });
            }
          }}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Excluir contato?"
          description={`Esta acao arquivara ${deleting?.nome ?? ""}. Conversas associadas serao preservadas para auditoria futura.`}
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (!deleting) return;
            try {
              await crmApi.deleteContact(deleting.id);
              toast.success("Contato excluido");
              setDeleting(null);
              await load();
            } catch (e) {
              toast.error("Falha ao excluir", { description: (e as Error).message });
            }
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

function ContactFormModal({
  open,
  onClose,
  onSubmit,
  initial,
  customers,
  tags,
  connectionOptions,
  connectionsError,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  tags: Tag[];
  connectionOptions: ConnectedConnectionOption[];
  connectionsError: Error | null;
  onSubmit: (data: {
    nome: string;
    telefone: string;
    customer_id: string | null;
    email: string | null;
    departamento: string | null;
    nivel_gerencia: RoleLabel | null;
    instancia: string | null;
    tag_ids: string[];
  }) => void | Promise<void>;
  initial?: Contact;
}) {
  const [nome, setNome] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [departamento, setDepartamento] = React.useState("");
  const [nivelGerencia, setNivelGerencia] = React.useState<"" | RoleLabel>("");
  const [instancia, setInstancia] = React.useState("");
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? "");
    setTelefone(initial?.telefone ?? "");
    setCustomerId(initial?.customer_id ?? "");
    setEmail(initial?.email ?? "");
    setDepartamento(initial?.departamento ?? "");
    setNivelGerencia(initial?.nivel_gerencia ?? "");
    const initialInstance = initial?.instancia ?? "";
    const isAvailable = connectionOptions.some((option) => option.value === initialInstance);
    setInstancia(isAvailable && !hasExampleInstanceName(initialInstance) ? initialInstance : "");
    setTagIds(initial?.tags.map((tag) => tag.id) ?? []);
    setErrors({});
  }, [connectionOptions, initial, open]);

  const toggleTag = (id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handle = () => {
    const errs: Record<string, string> = {};
    if (!nome.trim() || nome.trim().length < 2) errs.nome = "Informe o nome.";
    const digits = telefone.replace(/\D/g, "");
    if (digits.length < 10) errs.telefone = "Telefone invalido.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = "E-mail invalido.";
    if (!departamento.trim()) errs.departamento = "Informe o departamento.";
    if (!customerId) errs.customerId = "Selecione o cliente.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Verifique os campos destacados.");
      return;
    }
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
      open={open}
      onClose={onClose}
      title={initial ? "Editar contato" : "Novo contato"}
      description="Contato e a pessoa que conversa pelo WhatsApp. Voce pode vincular a um cliente ja cadastrado."
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
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome *">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          {errors.nome && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>
          )}
        </Field>
        <Field label="Telefone *">
          <Input
            value={telefone}
            onChange={(e) => setTelefone(maskPhone(e.target.value))}
            placeholder="(11) 90000-0000"
          />
          {errors.telefone && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.telefone}</span>
          )}
        </Field>
        <Field label="Departamento do Contato *">
          <Input
            value={departamento}
            onChange={(e) => setDepartamento(e.target.value)}
            placeholder="Ex.: Financeiro"
          />
          {errors.departamento && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.departamento}</span>
          )}
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@empresa.com"
          />
          {errors.email && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>
          )}
        </Field>
        <Field label="Instancia">
          <Select value={instancia} onChange={(e) => setInstancia(e.target.value)}>
            <option value="">
              {connectionOptions.length === 0
                ? "Nenhuma instancia conectada disponivel."
                : "- Selecione -"}
            </option>
            {connectionOptions.map((option) => (
              <option key={option.id} value={option.value}>
                {connectionPrimaryLabel(option.connection)}
              </option>
            ))}
          </Select>
          {connectionsError ? (
            <span className="mt-1 block text-[11px] text-destructive">
              {connectionsError.message}
            </span>
          ) : connectionOptions.length === 0 ? (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Conecte uma instancia antes de continuar.
            </span>
          ) : null}
        </Field>
        <Field label="Perfil do Contato">
          <Select
            value={nivelGerencia}
            onChange={(e) => setNivelGerencia(e.target.value as "" | RoleLabel)}
          >
            <option value="">- Selecione -</option>
            <option value="Colaborador">Colaborador</option>
            <option value="Supervisor">Supervisor</option>
            <option value="Gerente">Gerente</option>
            <option value="Diretoria">Diretoria</option>
          </Select>
        </Field>
        <Field label="Cliente *">
          <div className="flex gap-2">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">- Selecione -</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            {customerId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomerId("")}
                title="Remover vinculo"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {errors.customerId && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.customerId}</span>
          )}
        </Field>
        <div className="md:col-span-2">
          <Field label="Etiquetas">
            {tags.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">
                Nenhuma etiqueta cadastrada.
              </span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const active = tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        active
                          ? "border-transparent text-white"
                          : "border-border bg-surface-1 text-foreground hover:bg-surface-2"
                      }`}
                      style={active ? { backgroundColor: t.cor } : undefined}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: active ? "rgba(255,255,255,0.9)" : t.cor }}
                      />
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

function contactPayload(data: {
  nome: string;
  telefone: string;
  customer_id: string | null;
  email: string | null;
  departamento: string | null;
  nivel_gerencia: RoleLabel | null;
  instancia: string | null;
  tag_ids: string[];
}) {
  return {
    name: data.nome,
    phone: data.telefone,
    customerId: data.customer_id,
    email: data.email,
    departmentName: data.departamento,
    companyRole: data.nivel_gerencia ? ROLE_TO_API[data.nivel_gerencia] : null,
    instance: data.instancia,
    tagIds: data.tag_ids,
  };
}
