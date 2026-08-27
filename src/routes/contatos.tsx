import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileUp,
  Link2,
  Info,
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
import { isValidEmail, maskBrazilPhone, onlyDigits } from "@/lib/input-masks";
import {
  crmApi,
  type ApiContact,
  type ApiContactCatalog,
  type ApiContactCustomField,
  type ApiContactInstanceOption,
  type ApiCustomer,
  type ApiTag,
} from "@/lib/nexos-api";

export const Route = createFileRoute("/contatos")({ component: ContatosPage });

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 500, 1000] as const;
const COUNTRY_CODES = [
  { code: "55", country: "Brasil", flag: "BR" },
  { code: "1", country: "Estados Unidos", flag: "US" },
  { code: "351", country: "Portugal", flag: "PT" },
  { code: "54", country: "Argentina", flag: "AR" },
  { code: "56", country: "Chile", flag: "CL" },
  { code: "57", country: "Colômbia", flag: "CO" },
  { code: "52", country: "México", flag: "MX" },
  { code: "34", country: "Espanha", flag: "ES" },
];

type Customer = ApiCustomer;
type Contact = ApiContact;
type Tag = ApiTag;
type ContactCatalog = ApiContactCatalog;
type ContactInstanceOption = ApiContactInstanceOption;
type ContactCustomField = ApiContactCustomField;
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
  const [instanciaFilter, setInstanciaFilter] = React.useState("");
  const [departamentoFilter, setDepartamentoFilter] = React.useState("");
  const [clienteFilter, setClienteFilter] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkMode, setBulkMode] = React.useState<
    "customer" | "department" | "profile" | "tags" | "delete" | ""
  >("");
  const [bulkValue, setBulkValue] = React.useState("");
  const [bulkTags, setBulkTags] = React.useState<string[]>([]);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const exportMenu = useDisclosure();
  const exportMenuRef = React.useRef<HTMLDivElement>(null);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [deleting, setDeleting] = React.useState<Contact | null>(null);
  const create = useDisclosure();
  const visibleInstances = React.useMemo(
    () => instances.filter((instance) => isSelectableInstanceStatus(instance.status)),
    [instances],
  );

  const connectionLabelByValue = React.useMemo(
    () =>
      new Map(
        instances.flatMap((option) =>
          [option.value, option.id, option.externalReference]
            .filter(Boolean)
            .map((key) => [key as string, option.name]),
        ),
      ),
    [instances],
  );
  const connectionColorByValue = React.useMemo(
    () =>
      new Map(
        instances.flatMap((option) =>
          [option.value, option.id, option.externalReference]
            .filter(Boolean)
            .map((key) => [key as string, option.color ?? "#64748b"]),
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
          pageSize,
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
      setInstances(
        options.instances.filter((instance) => isSelectableInstanceStatus(instance.status)),
      );
    } catch (e) {
      toast.error("Falha ao carregar", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [clienteFilter, departamentoFilter, instanciaFilter, page, pageSize, query, tagFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);
  React.useEffect(() => {
    setPage(1);
  }, [query, instanciaFilter, departamentoFilter, clienteFilter, tagFilter, pageSize]);
  React.useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => contacts.some((contact) => contact.id === id)),
    );
  }, [contacts]);
  React.useEffect(() => {
    if (!exportMenu.open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) exportMenu.hide();
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [exportMenu]);

  const pageSafe = Math.min(page, totalPages);
  const allVisibleSelected =
    contacts.length > 0 && contacts.every((contact) => selectedIds.includes(contact.id));
  const toggleVisibleSelection = () =>
    setSelectedIds(allVisibleSelected ? [] : contacts.map((contact) => contact.id));

  const exportContacts = async (format: "csv" | "xls" = "csv") => {
    const response = await crmApi.listContacts({
      q: query,
      page: 1,
      pageSize: 1000,
      instance: instanciaFilter,
      department: departamentoFilter,
      customerId: clienteFilter,
      tagId: tagFilter,
    });
    const rows = selectedIds.length
      ? response.items.filter((contact) => selectedIds.includes(contact.id))
      : response.items;
    const rowsForExport = [
      [
        "Contato",
        "WhatsApp",
        "E-mail",
        "Empresa",
        "Departamento",
        "Perfil",
        "Instâncias",
        "Etiquetas",
      ],
      ...rows.map((contact) => [
        contact.nome,
        formatPhoneWithDdi(contact.telefone),
        contact.email ?? "",
        contact.customer?.nome ?? "",
        contact.contactDepartment?.nome ?? contact.departamento ?? "",
        contact.contactProfile?.nome ?? "",
        (contact.instanceIds ?? []).map((id) => connectionLabelByValue.get(id) ?? id).join(", "),
        contact.tags.map((tag) => tag.nome).join(", "),
      ]),
    ];
    const csv = toCsv(rowsForExport);
    downloadTextFile(
      `contatos-${new Date().toISOString().slice(0, 10)}.${format}`,
      format === "xls" ? toExcelHtml(rowsForExport) : csv,
      format === "xls" ? "application/vnd.ms-excel;charset=utf-8" : "text/csv;charset=utf-8",
    );
    exportMenu.hide();
  };

  const importContactsFile = async (file: File) => {
    const rows = parseCsv(await file.text());
    const [header, ...records] = rows;
    if (!header?.length) return;
    const index = new Map(header.map((item, i) => [normalizeHeader(item), i]));
    let created = 0;
    for (const row of records) {
      const name = valueAt(row, index, ["nome", "contato", "name"]);
      const phone = valueAt(row, index, ["telefone", "phone", "celular", "numero", "número"]);
      if (!name || !phone) continue;
      try {
        await crmApi.createContact(
          contactPayload({
            nome: name,
            telefone: phone,
            customer_id: null,
            email: valueAt(row, index, ["email", "e-mail"]) || null,
            contactDepartmentId: null,
            contactProfileId: null,
            instanceIds: [],
            tag_ids: [],
          }),
        );
        created += 1;
      } catch {
        // Mantem a importacao rodando quando encontra duplicados ou linhas invalidas.
      }
    }
    toast.success("Importação concluída", { description: `${created} contatos importados.` });
    await load();
  };

  const applyBulkAction = async () => {
    if (!selectedIds.length || !bulkMode) return;
    if (bulkMode === "delete") {
      if (!window.confirm(`Deseja realmente excluir ${selectedIds.length} contato(s)?`)) return;
      await crmApi.bulkUpdateContacts({ contactIds: selectedIds, delete: true });
    } else if (bulkMode === "tags") {
      await crmApi.bulkUpdateContacts({ contactIds: selectedIds, tagIds: bulkTags });
    } else {
      await crmApi.bulkUpdateContacts({
        contactIds: selectedIds,
        customerId: bulkMode === "customer" ? bulkValue || null : undefined,
        contactDepartmentId: bulkMode === "department" ? bulkValue || null : undefined,
        contactProfileId: bulkMode === "profile" ? bulkValue || null : undefined,
      });
    }
    toast.success("Contatos atualizados");
    setSelectedIds([]);
    setBulkMode("");
    setBulkValue("");
    setBulkTags([]);
    await load();
  };

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Contatos"
          subtitle={`${total} contatos cadastrados.`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importContactsFile(file);
                }}
              />
              <Button variant="secondary" size="sm" onClick={() => importInputRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5" /> Importar
              </Button>
              <div ref={exportMenuRef} className="relative">
                <Button variant="secondary" size="sm" onClick={exportMenu.toggle}>
                  <Download className="h-3.5 w-3.5" /> Exportar
                </Button>
                {exportMenu.open && (
                  <div className="absolute right-0 z-[80] mt-2 w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-1"
                      onClick={() => void exportContacts("csv")}
                    >
                      <FileUp className="h-4 w-4" /> CSV
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-1"
                      onClick={() => void exportContacts("xls")}
                    >
                      <FileSpreadsheet className="h-4 w-4" /> Excel
                    </button>
                  </div>
                )}
              </div>
              <Button variant="primary" size="sm" onClick={create.show}>
                <Plus className="h-3.5 w-3.5" /> Criar Contato
              </Button>
            </div>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(140px,0.7fr))]">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Busca</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-transparent py-2 text-sm outline-none"
                  placeholder="Buscar por nome, WhatsApp ou empresa..."
                />
              </div>
            </div>
            <FilterSelect label="Instância" value={instanciaFilter} onChange={setInstanciaFilter}>
              {[
                <option key="all" value="">
                  Todas
                </option>,
                ...visibleInstances.map((option) => (
                  <option key={option.id} value={option.value}>
                    {option.name}
                  </option>
                )),
              ]}
            </FilterSelect>
            <FilterSelect label="Empresa" value={clienteFilter} onChange={setClienteFilter}>
              {[
                <option key="all" value="">
                  Todas
                </option>,
                ...customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.nome}
                  </option>
                )),
              ]}
            </FilterSelect>
            <FilterSelect
              label="Departamento"
              value={departamentoFilter}
              onChange={setDepartamentoFilter}
            >
              {[
                <option key="all" value="">
                  Todos
                </option>,
                ...departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.nome}
                  </option>
                )),
              ]}
            </FilterSelect>
            <FilterSelect label="Etiqueta" value={tagFilter} onChange={setTagFilter}>
              {[
                <option key="all" value="">
                  Todas
                </option>,
                ...tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.nome}
                  </option>
                )),
              ]}
            </FilterSelect>
          </div>
        </Card>

        {selectedIds.length > 0 && (
          <Card className="mb-4 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-sm font-medium">{selectedIds.length} selecionado(s)</span>
              <Select
                value={bulkMode}
                onChange={(event) => {
                  setBulkMode(event.target.value as typeof bulkMode);
                  setBulkValue("");
                  setBulkTags([]);
                }}
                className="w-60"
              >
                <option value="">Ações</option>
                <option value="customer">Atualizar empresa do contato</option>
                <option value="department">Atualizar departamento</option>
                <option value="profile">Atualizar perfil do contato</option>
                <option value="tags">Atualizar etiquetas</option>
                <option value="delete">Excluir</option>
              </Select>
              {bulkMode === "customer" && (
                <Select
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                  className="w-60"
                >
                  <option value="">- Sem empresa -</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.nome}
                    </option>
                  ))}
                </Select>
              )}
              {bulkMode === "department" && (
                <Select
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                  className="w-60"
                >
                  <option value="">- Sem departamento -</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.nome}
                    </option>
                  ))}
                </Select>
              )}
              {bulkMode === "profile" && (
                <Select
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                  className="w-60"
                >
                  <option value="">- Sem perfil -</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.nome}
                    </option>
                  ))}
                </Select>
              )}
              {bulkMode === "tags" && (
                <div className="min-w-72">
                  <TagMultiSelect
                    tags={tags}
                    selectedIds={bulkTags}
                    onChange={setBulkTags}
                    placement="down"
                    flow
                  />
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={!bulkMode}
                onClick={() => void applyBulkAction()}
              >
                <Check className="h-3.5 w-3.5" /> Aplicar
              </Button>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden p-0">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3 font-medium">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelection}
                    aria-label="Selecionar contatos visíveis"
                  />
                </th>
                <th className="w-[36%] px-4 py-3 font-medium">Contato</th>
                <th className="w-[20%] px-4 py-3 font-medium">WhatsApp</th>
                <th className="w-[10%] px-4 py-3 font-medium">Instância</th>
                <th className="w-[11%] px-4 py-3 font-medium">Empresa</th>
                <th className="w-[11%] px-4 py-3 font-medium">Departamento</th>
                <th className="w-24 px-4 py-3 font-medium text-right">Ações</th>
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
                contacts.map((contact) => (
                  <tr key={contact.id} className="transition hover:bg-surface-1">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedIds.includes(contact.id)}
                        onChange={() =>
                          setSelectedIds((current) =>
                            current.includes(contact.id)
                              ? current.filter((id) => id !== contact.id)
                              : [...current, contact.id],
                          )
                        }
                        aria-label={`Selecionar ${contact.nome}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={contact.nome} size={30} />
                        <p className="truncate font-medium">{contact.nome}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {formatPhoneWithDdi(contact.telefone)}
                    </td>
                    <td className="px-4 py-3">
                      {contact.instanceIds?.length ? (
                        <div className="flex max-w-32 flex-wrap gap-1">
                          {contact.instanceIds.slice(0, 2).map((instanceId) => {
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
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                                <span className="truncate">
                                  {connectionLabelByValue.get(instanceId) ?? instanceId}
                                </span>
                              </span>
                            );
                          })}
                          {contact.instanceIds.length > 2 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{contact.instanceIds.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {contact.customer ? (
                        <span
                          className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${contact.customer.cor ?? "#3b82f6"}1f`,
                            borderColor: `${contact.customer.cor ?? "#3b82f6"}66`,
                            color: contact.customer.cor ?? "#3b82f6",
                          }}
                        >
                          <Link2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{contact.customer.nome}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não vinculado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {contact.contactDepartment?.nome ?? contact.departamento ?? (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Editar"
                          onClick={() => setEditing(contact)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Excluir"
                          onClick={() => setDeleting(contact)}
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
            <div className="flex items-center gap-2">
              <span>
                Mostrando {contacts.length} de {total}
              </span>
              <Select
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 w-24 text-xs"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
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
          instances={visibleInstances}
          onCustomerCreated={(customer) =>
            setCustomers((current) => upsertCustomer(current, customer))
          }
          onDepartmentSaved={(department) =>
            setDepartments((current) => upsertCatalog(current, department))
          }
          onProfileSaved={(profile) => setProfiles((current) => upsertCatalog(current, profile))}
          onSubmit={async (data) => {
            try {
              const contact = await crmApi.createContact(contactPayload(data));
              toast.success(
                contact.lifecycle === "restored" ? "Contato restaurado" : "Contato criado",
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
          instances={visibleInstances}
          onCustomerCreated={(customer) =>
            setCustomers((current) => upsertCustomer(current, customer))
          }
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
          description={`Contato "${deleting?.nome ?? ""}" será apagado.\nDeseja continuar?\n\nHistórico de Conversas associadas a esse contato serão preservadas para auditoria.`}
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (!deleting) return;
            try {
              await crmApi.deleteContact(deleting.id);
              toast.success("Contato excluído");
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
    countryCode?: string;
    customer_id: string | null;
    email: string | null;
    contactDepartmentId: string | null;
    contactProfileId: string | null;
    instanceIds: string[];
    tag_ids: string[];
    customFields: Record<string, string | boolean>;
  }) => void | Promise<void>;
  initial?: Contact;
}) {
  const [nome, setNome] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [countryCode, setCountryCode] = React.useState("55");
  const [customerId, setCustomerId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [contactDepartmentId, setContactDepartmentId] = React.useState("");
  const [contactProfileId, setContactProfileId] = React.useState("");
  const [instanceIds, setInstanceIds] = React.useState<string[]>([]);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [customFields, setCustomFields] = React.useState<Record<string, string | boolean>>({});
  const [customFieldDefinitions, setCustomFieldDefinitions] = React.useState<ContactCustomField[]>(
    [],
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const customersManager = useDisclosure();
  const departmentsManager = useDisclosure();
  const profilesManager = useDisclosure();

  React.useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? "");
    const initialPhone = splitPhoneByCountry(initial?.telefone ?? "");
    setCountryCode(initialPhone.countryCode);
    setTelefone(initialPhone.localPhone ? maskBrazilPhone(initialPhone.localPhone) : "");
    setCustomerId(initial?.customer_id ?? "");
    setEmail(initial?.email ?? "");
    setContactDepartmentId(initial?.contactDepartmentId ?? "");
    setContactProfileId(initial?.contactProfileId ?? "");
    setInstanceIds(initial?.instanceIds ?? (initial?.instancia ? [initial.instancia] : []));
    setTagIds(initial?.tags.map((tag) => tag.id) ?? []);
    setCustomFields(initial?.customFields ?? {});
    setErrors({});
    void crmApi
      .listContactCustomFields()
      .then(setCustomFieldDefinitions)
      .catch(() => setCustomFieldDefinitions([]));
  }, [initial, open]);

  const handle = () => {
    const errs: Record<string, string> = {};
    if (!nome.trim() || nome.trim().length < 2) errs.nome = "Informe o nome.";
    if (onlyDigits(telefone).length < 10) errs.telefone = "WhatsApp inválido.";
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "E-mail invalido.";
    for (const field of customFieldDefinitions) {
      if (field.required && !String(customFields[field.id] ?? "").trim())
        errs[`custom_${field.id}`] = "Campo obrigatorio.";
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    void onSubmit({
      nome: nome.trim(),
      telefone,
      countryCode,
      customer_id: customerId || null,
      email: email.trim() || null,
      contactDepartmentId: contactDepartmentId || null,
      contactProfileId: contactProfileId || null,
      instanceIds,
      tag_ids: tagIds,
      customFields,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar Contato" : "Criar Contato"}
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
        <Field label="Empresa">
          <div className="flex gap-2">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">- Sem empresa -</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.nome}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={customersManager.show}
              title="Gerenciar empresas"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            {customerId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomerId("")}
                title="Remover empresa"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </Field>
        <Field label="WhatsApp *">
          <div className="flex gap-2">
            <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
            <Input
              value={telefone}
              onChange={(e) => setTelefone(maskBrazilPhone(e.target.value))}
              placeholder="(11) 90000-0000"
            />
          </div>
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
            <Select value={contactProfileId} onChange={(e) => setContactProfileId(e.target.value)}>
              <option value="">- Sem perfil -</option>
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
              title="Gerenciar perfis"
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
        <Field label="Instância">
          <InstanceMultiSelect
            instances={instances}
            selectedIds={instanceIds}
            onChange={setInstanceIds}
          />
        </Field>
        <Field label="Etiquetas">
          <TagMultiSelect tags={tags} selectedIds={tagIds} onChange={setTagIds} />
        </Field>
        {customFieldDefinitions.map((field) => (
          <Field key={field.id} label={field.required ? `${field.label} *` : field.label}>
            <div className="flex items-center gap-2">
              <CustomContactFieldInput
                field={field}
                value={customFields[field.id]}
                onChange={(value) =>
                  setCustomFields((current) => ({ ...current, [field.id]: value }))
                }
              />
              {field.note && (
                <span
                  title={field.note}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                >
                  <Info className="h-4 w-4" />
                </span>
              )}
            </div>
            {errors[`custom_${field.id}`] && (
              <span className="mt-1 block text-[11px] text-destructive">
                {errors[`custom_${field.id}`]}
              </span>
            )}
          </Field>
        ))}
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
      toast.error("Falha ao carregar empresas", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [open, page, query]);
  React.useEffect(() => {
    if (open) void load();
  }, [load, open]);
  React.useEffect(() => {
    setPage(1);
  }, [query]);
  const pageSafe = Math.min(page, totalPages);
  const selectCustomer = (customer: Customer) => {
    onCustomerSelected(customer);
    onClose();
  };
  const saveCustomer = async (data: CustomerFormData) => {
    try {
      const customer = editing
        ? await crmApi.updateCustomer(editing.id, customerPayload(data))
        : await crmApi.createCustomer(customerPayload(data));
      toast.success(editing ? "Empresa atualizada" : "Empresa criada");
      create.hide();
      setEditing(null);
      await load();
      if (!editing) onCustomerSelected(customer);
    } catch (error) {
      toast.error("Falha ao salvar empresa", { description: (error as Error).message });
    }
  };
  const deleteCustomer = async () => {
    if (!deleting) return;
    try {
      await crmApi.deleteCustomer(deleting.id);
      toast.success("Empresa excluida");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error("Falha ao excluir empresa", { description: (error as Error).message });
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Empresa do Contato"
      size="xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div></div>
          <Button variant="primary" size="sm" onClick={create.show}>
            <Plus className="h-3.5 w-3.5" /> Nova Empresa
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
                <th className="w-[26%] px-4 py-3 font-medium">Empresa</th>
                <th className="w-[22%] px-4 py-3 font-medium">Contato Responsável</th>
                <th className="w-[20%] px-4 py-3 font-medium">E-mail</th>
                <th className="w-[14%] px-4 py-3 font-medium">Telefone</th>
                <th className="w-44 px-4 py-3 font-medium text-right">Ações</th>
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
                          className="h-3 w-3 shrink-0 rounded-full border border-border"
                          style={{ backgroundColor: customer.cor }}
                        />
                        <span className="truncate font-medium">{customer.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {customer.contato_responsavel ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{customer.email ?? "-"}</td>
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
                    Nenhuma empresa encontrada.
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
        title="Excluir empresa?"
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
      title="Departamento do Contato"
      size="xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="primary" size="sm" onClick={create.show}>
            <Plus className="h-3.5 w-3.5" /> Novo Departamento do Contato
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
                <Button variant="secondary" size="sm" onClick={() => selectDepartment(department)}>
                  Selecionar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Editar"
                  onClick={() => setEditing(department)}
                >
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
      title={title ?? (initial ? "Editar Departamento do Contato" : "Novo Departamento do Contato")}
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
        <Field label="Nota">
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
      title="Perfis do Contato"
      size="xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="primary" size="sm" onClick={create.show}>
            <Plus className="h-3.5 w-3.5" /> Novo Perfil do Contato
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
                <Button
                  variant="ghost"
                  size="sm"
                  title="Editar"
                  onClick={() => setEditing(profile)}
                >
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
        title={editing ? "Editar Perfil do Contato" : "Novo Perfil do Contato"}
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
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id],
    );
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
        <div className="absolute bottom-full z-[90] mb-2 flex max-h-[min(22rem,calc(100vh-10rem))] w-full flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="min-h-0 overflow-auto p-1">
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
                Nenhuma instância cadastrada.
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border bg-popover p-2">
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selectedIds.length === 0}
              className="flex items-center justify-center gap-1 rounded-md border border-destructive/30 bg-white px-2 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Limpar seleção
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 rounded-md border border-primary/30 bg-white px-2 py-2 text-xs font-medium text-primary hover:bg-primary/5"
            >
              <Check className="h-3 w-3" /> Confirmar seleção
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TagMultiSelect({
  tags,
  selectedIds,
  onChange,
  placement = "up",
  flow = false,
}: {
  tags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placement?: "up" | "down";
  flow?: boolean;
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
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id],
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left text-sm text-foreground outline-none transition focus:border-primary"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedTags.length === 0 ? (
            <span className="text-muted-foreground">- Selecione -</span>
          ) : (
            selectedTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-foreground"
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
        <div
          className={`${flow ? "relative z-[9999] mt-2" : `absolute right-0 z-[9999] ${placement === "down" ? "top-full mt-2" : "bottom-full mb-2"}`} flex max-h-[min(24rem,calc(100vh-10rem))] w-[min(42rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl`}
        >
          <div className="grid min-h-0 grid-cols-1 gap-1 overflow-auto p-1 sm:grid-cols-2">
            {tags.map((tag) => {
              const active = selectedIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag.id)}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-surface-1"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? "border-primary bg-primary text-white" : "border-border"}`}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.cor }}
                  />
                  <span className="truncate">{tag.nome}</span>
                </button>
              );
            })}
            {tags.length === 0 && (
              <div className="col-span-full px-2 py-3 text-center text-xs text-muted-foreground">
                Nenhuma etiqueta cadastrada.
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border bg-popover p-2">
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selectedIds.length === 0}
              className="flex items-center justify-center gap-1 rounded-md border border-destructive/30 bg-white px-2 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Limpar seleção
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 rounded-md border border-primary/30 bg-white px-2 py-2 text-xs font-medium text-primary hover:bg-primary/5"
            >
              <Check className="h-3 w-3" /> Confirmar seleção
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function CustomContactFieldInput({
  field,
  value,
  onChange,
}: {
  field: ContactCustomField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(event) => onChange(event.target.checked)}
        />
        Marcado
      </label>
    );
  }
  if (field.type === "list") {
    return (
      <Select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        <option value="">- Selecione -</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <Input
      type="text"
      inputMode={field.type === "number" ? "decimal" : undefined}
      className={field.type === "number" ? "text-right" : undefined}
      value={String(value ?? "")}
      placeholder={field.type === "number" ? (field.mask ?? "#.###,##") : undefined}
      onChange={(event) =>
        onChange(
          field.type === "number" ? maskAdditionalNumber(event.target.value) : event.target.value,
        )
      }
    />
  );
}
function maskAdditionalNumber(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const integer = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const decimals = padded.slice(-2);
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimals}`;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </label>
  );
}

function toCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function toExcelHtml(rows: Array<Array<string | number | null | undefined>>) {
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td>${String(cell ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<html><head><meta charset="utf-8" /></head><body><table>${body}</table></body></html>`;
}
function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsv(input: string) {
  return input
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.split(/;|,/).map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function valueAt(row: string[], index: Map<string, number>, names: string[]) {
  for (const name of names) {
    const position = index.get(normalizeHeader(name));
    if (position !== undefined) return row[position]?.trim() ?? "";
  }
  return "";
}
function splitPhoneByCountry(value: string) {
  const digits = onlyDigits(value);
  const match = COUNTRY_CODES.slice()
    .sort((a, b) => b.code.length - a.code.length)
    .find((country) => digits.startsWith(country.code) && digits.length > country.code.length + 8);
  return {
    countryCode: match?.code ?? "55",
    localPhone: match ? digits.slice(match.code.length) : digits,
  };
}

function formatPhoneForSubmit(value: string, countryCode = "55") {
  const digits = onlyDigits(value);
  if (!digits) return value;
  const code = onlyDigits(countryCode) || "55";
  return digits.startsWith(code) ? `+${digits}` : `+${code}${digits}`;
}

function formatPhoneWithDdi(value: string) {
  const parsed = splitPhoneByCountry(value);
  const local =
    parsed.countryCode === "55" ? maskBrazilPhone(parsed.localPhone) : parsed.localPhone;
  return `+${parsed.countryCode} ${local}`.trim();
}

function CountryCodeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const selected = COUNTRY_CODES.find((country) => country.code === value) ?? COUNTRY_CODES[0];
  const filtered = COUNTRY_CODES.filter((country) =>
    `${country.country} ${country.code} ${country.flag}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-32 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 text-sm outline-none transition focus:border-primary"
      >
        <span>
          {selected.flag} +{selected.code}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[100] mt-2 w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar país ou DDI..."
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-auto p-1">
            {filtered.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => {
                  onChange(country.code);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-1"
              >
                <span className="truncate">
                  {country.flag} {country.country}
                </span>
                <span className="font-mono text-xs text-muted-foreground">+{country.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function isSelectableInstanceStatus(status?: string | null) {
  return (
    !status ||
    status === "CONNECTED" ||
    status === "DISCONNECTED" ||
    status === "connected" ||
    status === "disconnected"
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
      title={initial ? "Editar Empresa do Contato" : "Nova Empresa do Contato"}
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
        <Field label="WhatsApp">
          <Input
            value={form.telefone ?? ""}
            onChange={(event) =>
              setForm({ ...form, telefone: maskBrazilPhone(event.target.value) })
            }
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
        <Field label="Contato Responsável">
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
  countryCode?: string;
  customer_id: string | null;
  email: string | null;
  contactDepartmentId: string | null;
  contactProfileId: string | null;
  instanceIds: string[];
  tag_ids: string[];
  customFields?: Record<string, string | boolean>;
}) {
  return {
    name: data.nome,
    phone: formatPhoneForSubmit(data.telefone, data.countryCode),
    customerId: data.customer_id,
    email: data.email,
    contactDepartmentId: data.contactDepartmentId,
    contactProfileId: data.contactProfileId,
    instanceIds: data.instanceIds,
    instance: data.instanceIds[0] ?? null,
    tagIds: data.tag_ids,
    customFields: data.customFields ?? {},
  };
}
