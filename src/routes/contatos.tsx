import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
  Textarea,
} from "@/components/ui-kit";
import { isValidEmail, maskBrazilPhone } from "@/lib/input-masks";
import {
  crmApi,
  type ApiContact,
  type ApiContactCatalog,
  type ApiContactInstanceOption,
  type ApiCustomer,
  type ApiTag,
} from "@/lib/nexos-api";

export const Route = createFileRoute("/contatos")({ component: ContatosPage });

const PAGE_SIZE = 15;

type Customer = ApiCustomer;
type Contact = ApiContact;
type Tag = ApiTag;
type ContactCatalog = ApiContactCatalog;
type ContactInstanceOption = ApiContactInstanceOption;
type FilterMode = "all" | "linked" | "unlinked";
type DepartamentoFormData = {
  name?: string;
  description?: string | null;
  color?: string;
};

function ContatosPage() {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [departments, setDepartments] = React.useState<ContactCatalog[]>([]);
  const [profiles, setProfiles] = React.useState<ContactCatalog[]>([]);
  const [instances, setInstances] = React.useState<ContactInstanceOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [instanciaFilter, setInstanciaFilter] = React.useState("");
  const [departamentoFilter, setDepartamentoFilter] = React.useState("");
  const [clienteFilter, setClienteFilter] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [deleting, setDeleting] = React.useState<Contact | null>(null);
  const create = useDisclosure();
  const connectionLabelByValue = React.useMemo(
    () =>
      new Map(
        instances.flatMap((option) =>
          [option.value, option.id, option.externalReference].filter(Boolean).map((key) => [
            key as string,
            option.name,
          ]),
        ),
      ),
    [instances],
  );
  const connectionColorByValue = React.useMemo(
    () =>
      new Map(
        instances.flatMap((option) =>
          [option.value, option.id, option.externalReference].filter(Boolean).map((key) => [
            key as string,
            option.color ?? "#64748b",
          ]),
        ),
      ),
    [instances],
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
          tagId: tagFilter,
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
      setProfiles(options.profiles);
      setInstances(options.instances);
    } catch (e) {
      toast.error("Falha ao carregar", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [clienteFilter, departamentoFilter, filter, instanciaFilter, page, query, tagFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [query, filter, instanciaFilter, departamentoFilter, clienteFilter, tagFilter]);

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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_repeat(5,160px)]">
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
              {instances.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.name}
                </option>
              ))}
            </Select>
            <Select
              value={departamentoFilter}
              onChange={(e) => setDepartamentoFilter(e.target.value)}
            >
              <option value="">Departamento: Todos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
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
            <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">Etiqueta: Todas</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
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
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Instancia</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Departamento</th>
                <th className="px-4 py-3 font-medium">Etiquetas</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
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
                    <td className="px-4 py-3 font-mono text-xs">
                      {maskBrazilPhone(c.telefone)}
                    </td>
                    <td className="px-4 py-3">
                      {c.instanceIds?.length ? (
                        <div className="flex max-w-40 flex-wrap gap-1">
                          {c.instanceIds.slice(0, 2).map((instanceId) => {
                            const color = connectionColorByValue.get(instanceId) ?? "#64748b";
                            return (
                              <span
                                key={instanceId}
                                className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                                style={{
                                  backgroundColor: `${color}1f`,
                                  borderColor: `${color}66`,
                                  color,
                                }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                <span className="truncate">
                                  {connectionLabelByValue.get(instanceId) ?? instanceId}
                                </span>
                              </span>
                            );
                          })}
                          {c.instanceIds.length > 2 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{c.instanceIds.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
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
                    <td className="px-4 py-3 text-xs">
                      {c.contactDepartment?.nome ?? c.departamento ?? (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.tags.length ? (
                        <div className="flex max-w-48 flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                              style={{
                                backgroundColor: `${tag.cor}1f`,
                                borderColor: `${tag.cor}66`,
                                color: tag.cor,
                              }}
                            >
                              {tag.nome}
                            </span>
                          ))}
                          {c.tags.length > 3 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{c.tags.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
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
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
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
          departments={departments}
          profiles={profiles}
          instances={instances}
          onCustomerCreated={(customer) => setCustomers((current) => upsertCustomer(current, customer))}
          onDepartmentSaved={(department) =>
            setDepartments((current) => upsertCatalog(current, department))
          }
          onProfileSaved={(profile) => setProfiles((current) => upsertCatalog(current, profile))}
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
          departments={departments}
          profiles={profiles}
          instances={instances}
          onCustomerCreated={(customer) => setCustomers((current) => upsertCustomer(current, customer))}
          onDepartmentSaved={(department) =>
            setDepartments((current) => upsertCatalog(current, department))
          }
          onProfileSaved={(profile) => setProfiles((current) => upsertCatalog(current, profile))}
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
  departments,
  profiles,
  instances,
  onCustomerCreated,
  onDepartmentSaved,
  onProfileSaved,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  tags: Tag[];
  departments: ContactCatalog[];
  profiles: ContactCatalog[];
  instances: ContactInstanceOption[];
  onCustomerCreated: (customer: Customer) => void;
  onDepartmentSaved: (department: ContactCatalog) => void;
  onProfileSaved: (profile: ContactCatalog) => void;
  onSubmit: (data: {
    nome: string;
    telefone: string;
    customer_id: string | null;
    email: string | null;
    contactDepartmentId: string | null;
    contactProfileId: string | null;
    instanceIds: string[];
    tag_ids: string[];
  }) => void | Promise<void>;
  initial?: Contact;
}) {
  const [nome, setNome] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [contactDepartmentId, setContactDepartmentId] = React.useState("");
  const [contactProfileId, setContactProfileId] = React.useState("");
  const [instanceIds, setInstanceIds] = React.useState<string[]>([]);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const customersManager = useDisclosure();
  const departmentsManager = useDisclosure();
  const profilesManager = useDisclosure();

  React.useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? "");
    setTelefone(initial?.telefone ? maskBrazilPhone(initial.telefone) : "");
    setCustomerId(initial?.customer_id ?? "");
    setEmail(initial?.email ?? "");
    setContactDepartmentId(initial?.contactDepartmentId ?? "");
    setContactProfileId(initial?.contactProfileId ?? "");
    setInstanceIds(initial?.instanceIds ?? (initial?.instancia ? [initial.instancia] : []));
    setTagIds(initial?.tags.map((tag) => tag.id) ?? []);
    setErrors({});
  }, [initial, open]);

  const handle = () => {
    const errs: Record<string, string> = {};
    if (!nome.trim() || nome.trim().length < 2) errs.nome = "Informe o nome.";
    const digits = telefone.replace(/\D/g, "");
    if (digits.length < 10) errs.telefone = "Telefone invalido.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = "E-mail invalido.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    void onSubmit({
      nome: nome.trim(),
      telefone,
      customer_id: customerId || null,
      email: email.trim() || null,
      contactDepartmentId: contactDepartmentId || null,
      contactProfileId: contactProfileId || null,
      instanceIds,
      tag_ids: tagIds,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar contato" : "Novo contato"}
      description=""
      size="xl"
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
        <Field label="Cliente">
          <div className="flex gap-2">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">- Sem cliente -</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={customersManager.show}
              title="Gerenciar clientes"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
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
        </Field>
        <Field label="Telefone *">
          <Input
            value={telefone}
            onChange={(e) => setTelefone(maskBrazilPhone(e.target.value))}
            placeholder="(11) 90000-0000"
          />
          {errors.telefone && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.telefone}</span>
          )}
        </Field>
        <Field label="Departamento do Contato">
          <div className="flex gap-2">
            <Select
              value={contactDepartmentId}
              onChange={(e) => setContactDepartmentId(e.target.value)}
            >
              <option value="">- Sem departamento -</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.nome}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={departmentsManager.show}
              title="Gerenciar departamentos"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            {contactDepartmentId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContactDepartmentId("")}
                title="Remover departamento"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
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
        <Field label="Perfil do Contato">
          <div className="flex gap-2">
            <Select
              value={contactProfileId}
              onChange={(e) => setContactProfileId(e.target.value)}
            >
              <option value="">- Selecione -</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.nome}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={profilesManager.show}
              title="Selecionar perfil do contato"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            {contactProfileId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContactProfileId("")}
                title="Remover perfil"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </Field>
        <Field label="Instancia">
          <InstanceMultiSelect instances={instances} selectedIds={instanceIds} onChange={setInstanceIds} />
          {instances.length === 0 ? (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Conecte uma instancia antes de continuar.
            </span>
          ) : null}
        </Field>
        <Field label="Etiquetas">
          <TagMultiSelect tags={tags} selectedIds={tagIds} onChange={setTagIds} />
        </Field>
      </div>
      <CustomersManagerModal
        open={customersManager.open}
        onClose={customersManager.hide}
        onCustomerSelected={(customer) => {
          onCustomerCreated(customer);
          setCustomerId(customer.id);
          customersManager.hide();
        }}
      />
      <DepartmentsManagerModal
        open={departmentsManager.open}
        onClose={departmentsManager.hide}
        onDepartmentSelected={(department) => {
          onDepartmentSaved(department);
          setContactDepartmentId(department.id);
          departmentsManager.hide();
        }}
      />
      <ContactProfilesManagerModal
        open={profilesManager.open}
        onClose={profilesManager.hide}
        onProfileSelected={(profile) => {
          onProfileSaved(profile);
          setContactProfileId(profile.id);
          profilesManager.hide();
        }}
      />
    </Modal>
  );
}

function CustomersManagerModal({
  open,
  onClose,
  onCustomerSelected,
}: {
  open: boolean;
  onClose: () => void;
  onCustomerSelected: (customer: Customer) => void;
}) {
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [deleting, setDeleting] = React.useState<Customer | null>(null);
  const create = useDisclosure();

  const load = React.useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const response = await crmApi.listCustomers({ q: query, page, pageSize: 8 });
      setCustomers(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      toast.error("Falha ao carregar clientes", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [open, page, query]);

  React.useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  React.useEffect(() => {
    setPage(1);
  }, [query]);

  const selectCustomer = (customer: Customer) => {
    onCustomerSelected(customer);
    onClose();
  };

  const pageSafe = Math.min(page, totalPages);

  const saveCustomer = async (data: CustomerFormData) => {
    try {
      const customer = editing
        ? await crmApi.updateCustomer(editing.id, customerPayload(data))
        : await crmApi.createCustomer(customerPayload(data));
      toast.success(editing ? "Cliente atualizado" : "Cliente criado");
      create.hide();
      setEditing(null);
      await load();
      if (!editing) onCustomerSelected(customer);
    } catch (error) {
      toast.error("Falha ao salvar cliente", { description: (error as Error).message });
    }
  };

  const deleteCustomer = async () => {
    if (!deleting) return;
    try {
      await crmApi.deleteCustomer(deleting.id);
      toast.success("Cliente excluido");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error("Falha ao excluir cliente", { description: (error as Error).message });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Clientes"
      description="Cadastre, edite, exclua e selecione o cliente para este contato."
      size="xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">{total} clientes cadastrados.</p>
            <p className="text-xs text-muted-foreground">
              O cliente selecionado sera vinculado ao contato em edicao.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={create.show}>
            <Plus className="h-3.5 w-3.5" /> Novo cliente
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent py-2 text-sm outline-none"
            placeholder="Buscar por nome..."
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Contato responsavel</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading &&
                customers.map((customer) => (
                  <tr key={customer.id} className="transition hover:bg-surface-1">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full border border-border"
                          style={{ backgroundColor: customer.cor }}
                        />
                        <span className="truncate font-medium">{customer.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {customer.contato_responsavel ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {customer.email ?? "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {customer.telefone ? maskBrazilPhone(customer.telefone) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => selectCustomer(customer)}
                        >
                          Selecionar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Editar"
                          onClick={() => setEditing(customer)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Excluir"
                          onClick={() => setDeleting(customer)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
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
                onClick={() => setPage((current) => Math.max(1, current - 1))}
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
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      <CustomerFormModal
        open={create.open || !!editing}
        initial={editing ?? undefined}
        onClose={() => {
          create.hide();
          setEditing(null);
        }}
        onSubmit={saveCustomer}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Excluir cliente?"
        description={`Esta acao arquivara ${deleting?.nome ?? ""}. Contatos vinculados serao desvinculados.`}
        destructive
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={deleteCustomer}
      />
    </Modal>
  );
}

function DepartmentsManagerModal({
  open,
  onClose,
  onDepartmentSelected,
}: {
  open: boolean;
  onClose: () => void;
  onDepartmentSelected: (department: ContactCatalog) => void;
}) {
  const [departments, setDepartments] = React.useState<ContactCatalog[]>([]);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<ContactCatalog | null>(null);
  const [deleting, setDeleting] = React.useState<ContactCatalog | null>(null);
  const create = useDisclosure();

  const load = React.useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      setDepartments(await crmApi.listContactDepartments());
    } catch (error) {
      toast.error("Falha ao carregar departamentos", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return departments.filter((department) => {
      if (!q) return true;
      return `${department.nome} ${department.descricao ?? ""}`.toLowerCase().includes(q);
    });
  }, [departments, query]);

  const selectDepartment = (department: ContactCatalog) => {
    onDepartmentSelected(department);
    onClose();
  };

  const saveDepartment = async (data: DepartamentoFormData) => {
    try {
      const department = editing
        ? await crmApi.updateContactDepartment(editing.id, departmentPayload(data))
        : await crmApi.createContactDepartment(departmentPayload(data));
      toast.success(editing ? "Departamento atualizado" : "Departamento criado");
      create.hide();
      setEditing(null);
      await load();
      if (!editing) onDepartmentSelected(department);
    } catch (error) {
      toast.error("Falha ao salvar departamento", { description: (error as Error).message });
    }
  };

  const deleteDepartment = async () => {
    if (!deleting) return;
    try {
      await crmApi.deleteContactDepartment(deleting.id);
      toast.success("Departamento desativado");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error("Falha ao desativar departamento", { description: (error as Error).message });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Departamentos"
      description="Cadastre, edite, desative e selecione o departamento deste contato."
      size="xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">{filtered.length} departamentos ativos.</p>
          <Button variant="primary" size="sm" onClick={create.show}>
            <Plus className="h-3.5 w-3.5" /> Criar departamento
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent py-2 text-sm outline-none"
            placeholder="Buscar departamento..."
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {loading && (
            <div className="col-span-full rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          )}
          {!loading &&
            filtered.map((department) => (
              <div
                key={department.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 p-3"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: department.cor }}
                >
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{department.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {department.descricao ?? "Sem descricao"}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => selectDepartment(department)}
                >
                  Selecionar
                </Button>
                <Button variant="ghost" size="sm" title="Editar" onClick={() => setEditing(department)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Desativar"
                  onClick={() => setDeleting(department)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum departamento encontrado.
            </div>
          )}
        </div>
      </div>
      <DepartmentFormModal
        open={create.open || !!editing}
        initial={editing ?? undefined}
        onClose={() => {
          create.hide();
          setEditing(null);
        }}
        onSubmit={saveDepartment}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Desativar departamento?"
        description={`Esta acao desativara ${deleting?.nome ?? ""}.`}
        destructive
        confirmLabel="Desativar"
        onClose={() => setDeleting(null)}
        onConfirm={deleteDepartment}
      />
    </Modal>
  );
}

function DepartmentFormModal({
  open,
  onClose,
  onSubmit,
  initial,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DepartamentoFormData) => void | Promise<void>;
  initial?: ContactCatalog;
  title?: string;
}) {
  const [form, setForm] = React.useState<DepartamentoFormData>({});
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? { name: initial.nome, description: initial.descricao, color: initial.cor }
        : { color: "#6366f1" },
    );
    setError("");
  }, [initial, open]);

  const save = async () => {
    if (!form.name || form.name.trim().length < 2) {
      setError("Informe o nome.");
      toast.error("Nome obrigatorio.");
      return;
    }
    await onSubmit({ ...form, name: form.name.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? (initial ? "Editar departamento" : "Criar departamento")}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome *">
          <Input
            value={form.name ?? ""}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
        </Field>
        <Field label="Descricao">
          <Textarea
            rows={3}
            value={form.description ?? ""}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>
        <Field label="Cor">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color ?? "#6366f1"}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
              className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent"
            />
            <Input
              value={form.color ?? "#6366f1"}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
            />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function ContactProfilesManagerModal({
  open,
  onClose,
  onProfileSelected,
}: {
  open: boolean;
  onClose: () => void;
  onProfileSelected: (profile: ContactCatalog) => void;
}) {
  const [profiles, setProfiles] = React.useState<ContactCatalog[]>([]);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<ContactCatalog | null>(null);
  const [deleting, setDeleting] = React.useState<ContactCatalog | null>(null);
  const create = useDisclosure();

  const load = React.useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      setProfiles(await crmApi.listContactProfiles());
    } catch (error) {
      toast.error("Falha ao carregar perfis", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (!q) return true;
      return `${profile.nome} ${profile.descricao ?? ""}`.toLowerCase().includes(q);
    });
  }, [profiles, query]);

  const selectProfile = (profile: ContactCatalog) => {
    onProfileSelected(profile);
    onClose();
  };

  const saveProfile = async (data: DepartamentoFormData) => {
    try {
      const profile = editing
        ? await crmApi.updateContactProfile(editing.id, departmentPayload(data))
        : await crmApi.createContactProfile(departmentPayload(data));
      toast.success(editing ? "Perfil atualizado" : "Perfil criado");
      create.hide();
      setEditing(null);
      await load();
      if (!editing) onProfileSelected(profile);
    } catch (error) {
      toast.error("Falha ao salvar perfil", { description: (error as Error).message });
    }
  };

  const deleteProfile = async () => {
    if (!deleting) return;
    try {
      await crmApi.deleteContactProfile(deleting.id);
      toast.success("Perfil desativado");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error("Falha ao desativar perfil", { description: (error as Error).message });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Perfis do contato"
      description="Cadastre, edite, desative e selecione o perfil deste contato."
      size="xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">{filtered.length} perfis ativos.</p>
          <Button variant="primary" size="sm" onClick={create.show}>
            <Plus className="h-3.5 w-3.5" /> Criar perfil
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent py-2 text-sm outline-none"
            placeholder="Buscar perfil..."
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {loading && (
            <div className="col-span-full rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          )}
          {!loading &&
            filtered.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 p-3"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: profile.cor }}
                >
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{profile.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {profile.descricao ?? "Sem descricao"}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => selectProfile(profile)}>
                  Selecionar
                </Button>
                <Button variant="ghost" size="sm" title="Editar" onClick={() => setEditing(profile)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Desativar"
                  onClick={() => setDeleting(profile)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum perfil encontrado.
            </div>
          )}
        </div>
      </div>
      <DepartmentFormModal
        open={create.open || !!editing}
        initial={editing ?? undefined}
        title={editing ? "Editar perfil" : "Criar perfil"}
        onClose={() => {
          create.hide();
          setEditing(null);
        }}
        onSubmit={saveProfile}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Desativar perfil?"
        description={`Esta acao desativara ${deleting?.nome ?? ""}.`}
        destructive
        confirmLabel="Desativar"
        onClose={() => setDeleting(null)}
        onConfirm={deleteProfile}
      />
    </Modal>
  );
}

function InstanceMultiSelect({
  instances,
  selectedIds,
  onChange,
}: {
  instances: ContactInstanceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selectedInstances = instances.filter((instance) =>
    [instance.value, instance.id, instance.externalReference].some(
      (key) => key && selectedIds.includes(key),
    ),
  );

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left text-sm outline-none transition focus:border-primary"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedInstances.length === 0 ? (
            <span className="text-muted-foreground">- Selecione -</span>
          ) : (
            selectedInstances.map((instance) => (
              <span
                key={instance.value}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: instance.color ?? "#64748b" }}
                />
                {instance.name}
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute bottom-full z-[80] mb-2 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
          {instances.map((instance) => {
            const active = [instance.value, instance.id, instance.externalReference].some(
              (key) => key && selectedIds.includes(key),
            );
            return (
              <button
                key={instance.value}
                type="button"
                onClick={() => toggle(instance.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-1"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    active ? "border-primary bg-primary text-white" : "border-border"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: instance.color ?? "#64748b" }}
                />
                <span className="truncate">{instance.name}</span>
              </button>
            );
          })}
          {instances.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhuma instancia cadastrada.
            </div>
          )}
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-xs text-muted-foreground hover:bg-surface-1"
            >
              <X className="h-3 w-3" /> Limpar selecao
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TagMultiSelect({
  tags,
  selectedIds,
  onChange,
}: {
  tags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selectedTags = tags.filter((tag) => selectedIds.includes(tag.id));

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left text-sm outline-none transition focus:border-primary"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedTags.length === 0 ? (
            <span className="text-muted-foreground">- Selecione -</span>
          ) : (
            selectedTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                {tag.nome}
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute bottom-full z-[80] mb-2 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
          {tags.map((tag) => {
            const active = selectedIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-1"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    active ? "border-primary bg-primary text-white" : "border-border"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                <span className="truncate">{tag.nome}</span>
              </button>
            );
          })}
          {tags.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhuma etiqueta cadastrada.
            </div>
          )}
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-xs text-muted-foreground hover:bg-surface-1"
            >
              <X className="h-3 w-3" /> Limpar selecao
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type CustomerFormData = Partial<Customer> & { nome: string };

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
    if (!open) return;
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

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!form.nome || form.nome.trim().length < 2) errs.nome = "Informe o nome.";
    if (form.email?.trim() && !isValidEmail(form.email)) errs.email = "E-mail invalido.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    void onSubmit({ ...form, nome: form.nome!.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar cliente" : "Novo cliente"}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome *">
          <Input
            value={form.nome ?? ""}
            onChange={(event) => setForm({ ...form, nome: event.target.value })}
          />
          {errors.nome && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>
          )}
        </Field>
        <Field label="Telefone">
          <Input
            value={form.telefone ?? ""}
            onChange={(event) => setForm({ ...form, telefone: maskBrazilPhone(event.target.value) })}
            placeholder="(11) 90000-0000"
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="nome@empresa.com"
          />
          {errors.email && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>
          )}
        </Field>
        <Field label="Contato responsavel">
          <Input
            value={form.contato_responsavel ?? ""}
            onChange={(event) => setForm({ ...form, contato_responsavel: event.target.value })}
          />
        </Field>
        <Field label="Cor">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-1.5">
            <input
              type="color"
              value={form.cor ?? "#3b82f6"}
              onChange={(event) => setForm({ ...form, cor: event.target.value })}
              className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0"
              aria-label="Selecionar cor"
            />
            <input
              type="text"
              value={form.cor ?? ""}
              onChange={(event) => setForm({ ...form, cor: event.target.value })}
              placeholder="#3B82F6"
              maxLength={7}
              className="w-24 bg-transparent font-mono text-xs uppercase outline-none"
            />
          </div>
        </Field>
        <Field label="Notas">
          <Input
            value={form.notas ?? ""}
            onChange={(event) => setForm({ ...form, notas: event.target.value })}
          />
        </Field>
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

function upsertCustomer(customers: Customer[], customer: Customer) {
  const exists = customers.some((item) => item.id === customer.id);
  return exists
    ? customers.map((item) => (item.id === customer.id ? customer : item))
    : [customer, ...customers];
}

function upsertCatalog(items: ContactCatalog[], value: ContactCatalog) {
  const exists = items.some((item) => item.id === value.id);
  return exists
    ? items.map((item) => (item.id === value.id ? value : item))
    : [value, ...items].sort((a, b) => a.nome.localeCompare(b.nome));
}

function departmentPayload(data: DepartamentoFormData) {
  return {
    name: data.name ?? "",
    description: data.description?.trim() || null,
    color: data.color || "#6366f1",
  };
}

function contactPayload(data: {
  nome: string;
  telefone: string;
  customer_id: string | null;
  email: string | null;
  contactDepartmentId: string | null;
  contactProfileId: string | null;
  instanceIds: string[];
  tag_ids: string[];
}) {
  return {
    name: data.nome,
    phone: data.telefone,
    customerId: data.customer_id,
    email: data.email,
    contactDepartmentId: data.contactDepartmentId,
    contactProfileId: data.contactProfileId,
    instanceIds: data.instanceIds,
    instance: data.instanceIds[0] ?? null,
    tagIds: data.tag_ids,
  };
}
