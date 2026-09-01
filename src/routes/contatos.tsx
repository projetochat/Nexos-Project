import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Building2,
  Bold,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileSpreadsheet,
  FileUp,
  Italic,
  Link2,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  MessageCircle,
  Network,
  Plug,
  Info,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Strikethrough,
  Tag,
  Trash2,
  Type,
  Underline,
  Undo2,
  Redo2,
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
  SearchInput,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { isValidEmail, maskBrazilPhone, onlyDigits } from "@/lib/input-masks";
import {
  conversationApi,
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
const PAGE_SIZE_OPTIONS = [25, 50, 100, 500, 1000, 10000] as const;
const COUNTRY_CODES = [
  { code: "55", country: "Brasil", flag: "🇧🇷" },
  { code: "1", country: "Estados Unidos", flag: "🇺🇸" },
  { code: "351", country: "Portugal", flag: "🇵🇹" },
  { code: "54", country: "Argentina", flag: "🇦🇷" },
  { code: "56", country: "Chile", flag: "🇨🇱" },
  { code: "57", country: "Colômbia", flag: "🇨🇴" },
  { code: "52", country: "México", flag: "🇲🇽" },
  { code: "34", country: "Espanha", flag: "🇪🇸" },
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

type ContactTextVariant = "short" | "long" | "html";
type ContactNumberSymbol = "" | "R$" | "%" | "$" | "€" | "£" | "¥";
type ContactDateVariant = "date" | "datetime";
type ContactFieldConfig = {
  text?: { variant?: ContactTextVariant };
  number?: { decimals?: number; thousands?: boolean; symbol?: ContactNumberSymbol };
  date?: { variant?: ContactDateVariant };
};
type ImportSource = "agenda" | "excel";
type ImportProgressStatus = "idle" | "running" | "completed" | "cancelled";
type ImportProgressState = {
  open: boolean;
  source: ImportSource | null;
  current: number;
  total: number;
  imported: number;
  status: ImportProgressStatus;
};
type ContactPickerNavigator = Navigator & {
  contacts?: {
    select: (
      properties: Array<"name" | "tel" | "email">,
      options?: { multiple?: boolean },
    ) => Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
  };
};

function ContatosPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [departments, setDepartments] = React.useState<ContactCatalog[]>([]);
  const [profiles, setProfiles] = React.useState<ContactCatalog[]>([]);
  const [instances, setInstances] = React.useState<ContactInstanceOption[]>([]);
  const [customFieldDefinitions, setCustomFieldDefinitions] = React.useState<ContactCustomField[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [instanciaFilter, setInstanciaFilter] = React.useState("");
  const [departamentoFilter, setDepartamentoFilter] = React.useState("");
  const [clienteFilter, setClienteFilter] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkAction, setBulkAction] = React.useState("");
  const [bulkMode, setBulkMode] = React.useState("");
  const [bulkValue, setBulkValue] = React.useState("");
  const [bulkTags, setBulkTags] = React.useState<string[]>([]);
  const [bulkCustomValue, setBulkCustomValue] = React.useState<string | boolean>("");
  const importModal = useDisclosure();
  const exportMenu = useDisclosure();
  const exportMenuRef = React.useRef<HTMLDivElement>(null);
  const [exportAllRecords, setExportAllRecords] = React.useState(false);
  const cancelImportRef = React.useRef(false);
  const [importProgress, setImportProgress] = React.useState<ImportProgressState>({
    open: false,
    source: null,
    current: 0,
    total: 0,
    imported: 0,
    status: "idle",
  });
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
      const [contactResponse, customerResponse, options, customFields] = await Promise.all([
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
        crmApi.listContactCustomFields(),
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
      setCustomFieldDefinitions(customFields);
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

  const selectedBulkCustomField = bulkMode.startsWith("custom:")
    ? customFieldDefinitions.find((field) => field.id === bulkMode.slice("custom:".length))
    : undefined;

  const openConversation = async (contact: Contact) => {
    try {
      const existing = await conversationApi.list({
        contactId: contact.id,
        page: 1,
        pageSize: 10,
        sort: "lastMessageAt",
        direction: "desc",
      });
      const open = existing.items.find((conversation) => conversation.status !== "fechada");
      if (open) {
        navigate({ to: "/inbox/$conversationId", params: { conversationId: open.id } });
        return;
      }
      const connectionId =
        contact.instanceIds
          ?.map((value) =>
            instances.find((instance) => instance.value === value || instance.id === value),
          )
          .find(Boolean)?.id ??
        contact.instanceIds?.[0] ??
        null;
      const conversation = await conversationApi.create({
        contactId: contact.id,
        connectionId,
        assignToSelf: true,
      });
      navigate({ to: "/inbox/$conversationId", params: { conversationId: conversation.id } });
    } catch (e) {
      toast.error("Falha ao abrir conversa", { description: (e as Error).message });
    }
  };

  const exportContacts = async (format: "csv" | "xls" = "csv") => {
    if (!exportAllRecords && selectedIds.length === 0) {
      toast.error("Selecione algum registro p/ prosseguir com a exportação");
      return;
    }
    const rows = exportAllRecords
      ? await loadContactsForExport()
      : contacts.filter((contact) => selectedIds.includes(contact.id));
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

  const loadContactsForExport = async () => {
    const all: Contact[] = [];
    let nextPage = 1;
    let pages = 1;
    do {
      const response = await crmApi.listContacts({
        q: query,
        page: nextPage,
        pageSize: 1000,
        instance: instanciaFilter,
        department: departamentoFilter,
        customerId: clienteFilter,
        tagId: tagFilter,
      });
      all.push(...response.items);
      pages = response.totalPages;
      nextPage += 1;
    } while (nextPage <= pages);
    return all;
  };

  const reopenImportProgress = () => {
    if (importProgress.status === "idle") return false;
    setImportProgress((current) => ({ ...current, open: true }));
    exportMenu.hide();
    return true;
  };

  const openExcelImport = () => {
    if (reopenImportProgress()) return;
    exportMenu.hide();
    importModal.show();
  };

  const importContactsRows = async (rows: string[][], source: ImportSource = "excel") => {
    const [header, ...records] = rows;
    if (!header?.length) return;
    const index = new Map(header.map((item, i) => [normalizeHeader(item), i]));
    const validRecords = records.filter((row) => {
      const name = valueAt(row, index, ["contato", "nome", "name"]);
      const phone = valueAt(row, index, [
        "whatsapp",
        "telefone",
        "phone",
        "celular",
        "numero",
        "número",
      ]);
      return Boolean(name && phone);
    });
    if (!validRecords.length) {
      toast.error("Nenhum contato válido encontrado.");
      return;
    }
    cancelImportRef.current = false;
    setImportProgress({
      open: true,
      source,
      current: 0,
      total: validRecords.length,
      imported: 0,
      status: "running",
    });
    let created = 0;
    let processed = 0;
    for (const row of validRecords) {
      if (cancelImportRef.current) {
        setImportProgress((current) => ({ ...current, status: "cancelled" }));
        break;
      }
      const name = valueAt(row, index, ["contato", "nome", "name"]);
      const phone = valueAt(row, index, [
        "whatsapp",
        "telefone",
        "phone",
        "celular",
        "numero",
        "número",
      ]);
      if (!name || !phone) continue;
      const customerName = valueAt(row, index, ["empresa"]);
      const departmentName = valueAt(row, index, ["departamento"]);
      const profileName = valueAt(row, index, ["perfil"]);
      const tagNames = splitImportList(valueAt(row, index, ["etiquetas"]));
      const instanceNames = splitImportList(valueAt(row, index, ["instancias", "instâncias"]));
      const customer = findByImportedName(customers, customerName);
      const department = findByImportedName(departments, departmentName);
      const profile = findByImportedName(profiles, profileName);
      const importedTags = tagNames
        .map((item) => findByImportedName(tags, item))
        .filter(Boolean) as Tag[];
      const importedInstances = instanceNames
        .map((item) => findImportedInstance(instances, item))
        .filter(Boolean) as ContactInstanceOption[];
      try {
        await crmApi.createContact(
          contactPayload({
            nome: name,
            telefone: phone,
            customer_id: customer?.id ?? null,
            email: valueAt(row, index, ["email", "e-mail"]) || null,
            contactDepartmentId: department?.id ?? null,
            contactProfileId: profile?.id ?? null,
            instanceIds: importedInstances.map((instance) => instance.value),
            tag_ids: importedTags.map((tag) => tag.id),
          }),
        );
        created += 1;
      } catch {
        // Mantem a importacao rodando quando encontra duplicados ou linhas invalidas.
      }
      processed += 1;
      setImportProgress((current) => ({
        ...current,
        current: processed,
        imported: created,
      }));
    }
    if (!cancelImportRef.current) {
      setImportProgress((current) => ({
        ...current,
        current: current.total,
        imported: created,
        status: "completed",
      }));
      toast.success("Importação concluída", { description: `${created} contatos importados.` });
    } else {
      toast.error("Importação cancelada", {
        description: `${created} contato(s) importado(s) antes do cancelamento.`,
      });
    }
    await load();
  };

  const importFromAgenda = async () => {
    if (reopenImportProgress()) return;
    exportMenu.hide();
    const contactsApi = (navigator as ContactPickerNavigator).contacts;
    if (!contactsApi?.select) {
      toast.error("Agenda indisponível neste navegador ou dispositivo.");
      return;
    }
    try {
      const selectedContacts = await contactsApi.select(["name", "tel", "email"], {
        multiple: true,
      });
      const rows = [
        ["Contato", "WhatsApp", "E-mail"],
        ...selectedContacts.map((contact) => [
          contact.name?.[0] ?? "",
          contact.tel?.[0] ?? "",
          contact.email?.[0] ?? "",
        ]),
      ];
      await importContactsRows(rows, "agenda");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error("Falha ao acessar a agenda", { description: (error as Error).message });
      }
    }
  };

  const closeImportProgress = () => setImportProgress((current) => ({ ...current, open: false }));

  const handleImportProgressAction = () => {
    if (importProgress.status === "running") {
      cancelImportRef.current = true;
      return;
    }
    setImportProgress({
      open: false,
      source: null,
      current: 0,
      total: 0,
      imported: 0,
      status: "idle",
    });
  };

  const applyBulkAction = async () => {
    if (!selectedIds.length || !bulkMode) return;
    if (bulkMode === "delete") {
      if (!window.confirm(`Deseja realmente excluir ${selectedIds.length} contato(s)?`)) return;
      await crmApi.bulkUpdateContacts({ contactIds: selectedIds, delete: true });
    } else if (bulkMode === "tags") {
      await crmApi.bulkUpdateContacts({ contactIds: selectedIds, tagIds: bulkTags });
    } else if (bulkMode === "instances") {
      await crmApi.bulkUpdateContacts({
        contactIds: selectedIds,
        instanceIds: bulkValue ? bulkValue.split(",").filter(Boolean) : [],
      });
    } else if (bulkMode === "email") {
      await crmApi.bulkUpdateContacts({ contactIds: selectedIds, email: bulkValue || null });
    } else if (selectedBulkCustomField) {
      await crmApi.bulkUpdateContacts({
        contactIds: selectedIds,
        customFields: { [selectedBulkCustomField.id]: bulkCustomValue },
      });
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
    setBulkAction("");
    setBulkMode("");
    setBulkValue("");
    setBulkTags([]);
    setBulkCustomValue("");
    await load();
  };

  return (
    <AppShell>
      <PageContainer className="max-w-[96rem] lg:px-8 xl:px-10 2xl:px-12">
        <SectionHeader
          title="Contatos"
          subtitle={`${total} contatos cadastrados.`}
          subtitleClassName="hidden sm:block"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div ref={exportMenuRef} className="relative">
                <Button variant="secondary" size="sm" onClick={exportMenu.toggle}>
                  Importar / Exportar
                </Button>
                {exportMenu.open && (
                  <div className="absolute left-0 z-[80] mt-2 w-64 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-1"
                      onClick={() => void importFromAgenda()}
                    >
                      <Phone className="h-4 w-4" /> Importar via Agenda
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-1"
                      onClick={openExcelImport}
                    >
                      <FileSpreadsheet className="h-4 w-4" /> Importar via Excel/CSV
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-1"
                      onClick={() => void exportContacts("csv")}
                    >
                      <Download className="h-4 w-4" /> Exportar
                    </button>
                    <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={exportAllRecords}
                        onChange={(event) => setExportAllRecords(event.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      Exportar todos os Registros
                    </label>
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
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(140px,0.7fr))]">
            <div className="col-span-2 xl:col-span-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Busca</label>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar por nome, WhatsApp ou empresa..."
              />
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
          <Card className="mb-4 hidden p-3 md:block">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-sm font-medium">{selectedIds.length} selecionado(s)</span>
              <Select
                value={bulkAction}
                onChange={(event) => {
                  const nextAction = event.target.value;
                  setBulkAction(nextAction);
                  setBulkMode(nextAction === "delete" ? "delete" : "");
                  setBulkValue("");
                  setBulkTags([]);
                  setBulkCustomValue("");
                }}
                className="w-60"
              >
                <option value="">Ações</option>
                <option value="update">Atualizar em massa</option>
                <option value="delete">Excluir em massa</option>
              </Select>
              {bulkAction === "update" && (
                <Select
                  value={bulkMode}
                  onChange={(event) => {
                    setBulkMode(event.target.value as typeof bulkMode);
                    setBulkValue("");
                    setBulkTags([]);
                    setBulkCustomValue("");
                  }}
                  className="w-60"
                >
                  <option value="">Campo</option>
                  <option value="customer">Empresa do contato</option>
                  <option value="department">Departamento</option>
                  <option value="profile">Perfil do contato</option>
                  <option value="email">E-mail</option>
                  <option value="instances">Instâncias</option>
                  <option value="tags">Etiquetas</option>
                  {customFieldDefinitions.length > 0 && (
                    <optgroup label="Campos adicionais">
                      {customFieldDefinitions.map((field) => (
                        <option key={field.id} value={`custom:${field.id}`}>
                          {field.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              )}
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
              {bulkMode === "email" && (
                <Input
                  type="email"
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                  placeholder="email@exemplo.com"
                  className="w-72"
                />
              )}
              {bulkMode === "instances" && (
                <div className="min-w-72">
                  <InstanceMultiSelect
                    instances={visibleInstances}
                    selectedIds={bulkValue ? bulkValue.split(",").filter(Boolean) : []}
                    onChange={(ids) => setBulkValue(ids.join(","))}
                  />
                </div>
              )}
              {selectedBulkCustomField && (
                <div className="min-w-72">
                  <CustomContactFieldInput
                    field={selectedBulkCustomField}
                    value={bulkCustomValue}
                    onChange={setBulkCustomValue}
                  />
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={!bulkAction || (bulkAction === "update" && !bulkMode)}
                onClick={() => void applyBulkAction()}
              >
                <Check className="h-3.5 w-3.5" /> Aplicar
              </Button>
            </div>
          </Card>
        )}

        <Card className="mb-3 p-4 md:hidden">
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={allVisibleSelected}
              onChange={toggleVisibleSelection}
              aria-label="Selecionar todos os registros"
            />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              Selecionar todos os registros
            </span>
          </label>
          {selectedIds.length > 0 && (
            <div className="mt-3 rounded-lg border border-border bg-card p-3">
              <span className="mb-2 block text-xs font-semibold">
                {selectedIds.length} selecionado(s)
              </span>
              <div className="grid gap-2">
                <Select
                  value={bulkAction}
                  onChange={(event) => {
                    const nextAction = event.target.value;
                    setBulkAction(nextAction);
                    setBulkMode(nextAction === "delete" ? "delete" : "");
                    setBulkValue("");
                    setBulkTags([]);
                    setBulkCustomValue("");
                  }}
                  className="w-full"
                >
                  <option value="">Ações</option>
                  <option value="update">Atualizar em massa</option>
                  <option value="delete">Excluir em massa</option>
                </Select>
                {bulkAction === "update" && (
                  <Select
                    value={bulkMode}
                    onChange={(event) => {
                      setBulkMode(event.target.value as typeof bulkMode);
                      setBulkValue("");
                      setBulkTags([]);
                      setBulkCustomValue("");
                    }}
                    className="w-full"
                  >
                    <option value="">Campo</option>
                    <option value="customer">Empresa do contato</option>
                    <option value="department">Departamento</option>
                    <option value="profile">Perfil do contato</option>
                    <option value="email">E-mail</option>
                    <option value="instances">Instâncias</option>
                    <option value="tags">Etiquetas</option>
                    {customFieldDefinitions.length > 0 && (
                      <optgroup label="Campos adicionais">
                        {customFieldDefinitions.map((field) => (
                          <option key={field.id} value={`custom:${field.id}`}>
                            {field.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                )}
                {bulkMode === "customer" && (
                  <Select value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                    <option value="">- Sem empresa -</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.nome}
                      </option>
                    ))}
                  </Select>
                )}
                {bulkMode === "department" && (
                  <Select value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                    <option value="">- Sem departamento -</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.nome}
                      </option>
                    ))}
                  </Select>
                )}
                {bulkMode === "profile" && (
                  <Select value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                    <option value="">- Sem perfil -</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.nome}
                      </option>
                    ))}
                  </Select>
                )}
                {bulkMode === "tags" && (
                  <TagMultiSelect
                    tags={tags}
                    selectedIds={bulkTags}
                    onChange={setBulkTags}
                    placement="down"
                    flow
                  />
                )}
                {bulkMode === "email" && (
                  <Input
                    type="email"
                    value={bulkValue}
                    onChange={(event) => setBulkValue(event.target.value)}
                    placeholder="email@exemplo.com"
                  />
                )}
                {bulkMode === "instances" && (
                  <InstanceMultiSelect
                    instances={visibleInstances}
                    selectedIds={bulkValue ? bulkValue.split(",").filter(Boolean) : []}
                    onChange={(ids) => setBulkValue(ids.join(","))}
                  />
                )}
                {selectedBulkCustomField && (
                  <CustomContactFieldInput
                    field={selectedBulkCustomField}
                    value={bulkCustomValue}
                    onChange={setBulkCustomValue}
                  />
                )}
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!bulkAction || (bulkAction === "update" && !bulkMode)}
                  onClick={() => void applyBulkAction()}
                >
                  <Check className="h-3.5 w-3.5" /> Aplicar
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="overflow-visible p-4 md:overflow-hidden md:rounded-lg md:p-0">
          <div className="space-y-3 md:hidden">
            {loading && (
              <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
                Carregando...
              </div>
            )}
            {!loading &&
              contacts.map((contact) => (
                <div key={contact.id} className="rounded-lg border border-border bg-surface-1 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0"
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
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{contact.nome}</p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                          {formatPhoneWithDdi(contact.telefone)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="border-transparent bg-transparent hover:bg-transparent"
                        title="Abrir conversa"
                        onClick={() => void openConversation(contact)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="border-transparent bg-transparent hover:bg-transparent"
                        title="Editar"
                        onClick={() => setEditing(contact)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="border-transparent bg-transparent text-destructive hover:bg-transparent hover:text-destructive/80"
                        title="Excluir"
                        onClick={() => setDeleting(contact)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            {!loading && contacts.length === 0 && (
              <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
                Nenhum contato encontrado.
              </div>
            )}
          </div>
          <table className="hidden w-full table-fixed overflow-hidden rounded-lg text-sm md:table">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="w-10 rounded-tl-lg px-3 py-3 font-medium sm:px-4">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelection}
                    aria-label="Selecionar contatos visíveis"
                  />
                </th>
                <th className="w-[38%] px-3 py-3 font-medium sm:px-4">Contato</th>
                <th className="w-[16%] px-3 py-3 font-medium sm:px-4">WhatsApp</th>
                <th className="w-[21%] px-4 py-3 font-medium">Empresa</th>
                <th className="w-[15%] px-4 py-3 font-medium">Departamento</th>
                <th className="w-28 rounded-tr-lg px-3 py-3 text-center font-medium sm:px-4">
                  Ações
                </th>
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
                contacts.map((contact) => (
                  <tr key={contact.id} className="transition hover:bg-surface-1">
                    <td className="relative px-3 py-3 sm:px-4">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
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
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex items-center gap-3">
                        <span className="hidden sm:inline-flex">
                          <Avatar name={contact.nome} size={30} />
                        </span>
                        <p className="truncate font-medium">{contact.nome}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs sm:px-4">
                      {formatPhoneWithDdi(contact.telefone)}
                    </td>
                    <td className="px-4 py-3">
                      {contact.customer ? (
                        <span
                          className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${contact.customer.cor ?? "#3B82F6"}1f`,
                            borderColor: `${contact.customer.cor ?? "#3B82F6"}66`,
                            color: contact.customer.cor ?? "#3B82F6",
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
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="border-transparent bg-transparent hover:bg-transparent hover:text-primary"
                          title="Abrir conversa"
                          onClick={() => void openConversation(contact)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="border-transparent bg-transparent hover:bg-transparent hover:text-warning"
                          title="Editar"
                          onClick={() => setEditing(contact)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="border-transparent bg-transparent hover:bg-transparent hover:text-destructive"
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
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Nenhum contato encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 leading-tight sm:leading-normal">
                <span className="block sm:inline">Mostrando</span>
                <span className="block sm:inline">
                  {" "}
                  {contacts.length} de {total}
                </span>
              </span>
              <Select
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 w-20 text-xs sm:w-24"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
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
                className="h-8 w-8 p-0"
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
        <ImportContactsModal
          open={importModal.open}
          onClose={importModal.hide}
          onImport={importContactsRows}
        />
        <ImportProgressModal
          open={importProgress.open}
          source={importProgress.source}
          current={importProgress.current}
          total={importProgress.total}
          imported={importProgress.imported}
          status={importProgress.status}
          onClose={closeImportProgress}
          onAction={handleImportProgressAction}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Excluir contato?"
          description={
            deleting ? (
              <div className="space-y-3">
                <p>
                  Contato abaixo será apagado.
                  <br />
                  Deseja continuar?
                </p>
                <div className="space-y-1 text-foreground">
                  <p>
                    <strong>Nome: </strong> {deleting.nome}
                  </p>
                  <p>
                    <strong>Whatsapp: </strong> {formatPhoneWithDdi(deleting.telefone)}
                  </p>
                </div>
                <p className="italic">
                  Histórico de Conversas associadas a esse contato serão preservadas para auditoria.
                </p>
              </div>
            ) : undefined
          }
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

function ImportContactsModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (rows: string[][]) => Promise<void>;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [validRows, setValidRows] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setValidRows(0);
    setBusy(false);
  }, [open]);

  const selectFile = (selected: File | null) => {
    setFile(selected);
    setValidRows(0);
  };

  const confirm = async () => {
    if (!file) {
      toast.error("Selecione um arquivo para importar.");
      return;
    }
    setBusy(true);
    try {
      const rows = await parseSpreadsheetFile(file);
      const valid = countValidImportRows(rows);
      setValidRows(valid);
      if (!valid) {
        toast.error("Nenhum contato válido encontrado.");
        return;
      }
      await onImport(rows);
      onClose();
    } catch (error) {
      toast.error("Falha ao importar arquivo", { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar Contatos"
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={confirm} disabled={busy || !file}>
            {busy ? "Importando..." : "Confirmar importação"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-destructive">Templates Modelo</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground underline transition hover:text-primary"
              onClick={() => downloadImportTemplate("csv")}
            >
              <Download className="h-3.5 w-3.5" /> Modelo CSV
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground underline transition hover:text-primary"
              onClick={() => downloadImportTemplate("xls")}
            >
              <Download className="h-3.5 w-3.5" /> Modelo XLS
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground underline transition hover:text-primary"
              onClick={() => downloadImportTemplate("xlsx")}
            >
              <Download className="h-3.5 w-3.5" /> Modelo XLSX
            </button>
          </div>
        </div>
        <div className="border-t border-border" />
        <Field label="Arquivo *">
          <label className="flex min-h-20 cursor-pointer items-center gap-4 rounded-lg border border-border bg-surface-1 px-5 py-4 text-sm transition hover:border-primary">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground">
              <FileUp className="h-5 w-5" />
            </span>
            <span className="min-w-0 truncate text-base">
              {file ? file.name : "Clique aqui para selecionar o arquivo"}
            </span>
            <input
              type="file"
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <p className="mt-2 text-xs italic text-muted-foreground">
            Arquivos aceitos: XLSX, XLS e CSV. O modelo deve conter ao menos as colunas Contato e
            WhatsApp.
          </p>
        </Field>
        {file && validRows > 0 && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {validRows} contato(s) válido(s) pronto(s) para importação.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ImportProgressModal({
  open,
  source,
  current,
  total,
  imported,
  status,
  onClose,
  onAction,
}: {
  open: boolean;
  source: ImportSource | null;
  current: number;
  total: number;
  imported: number;
  status: ImportProgressStatus;
  onClose: () => void;
  onAction: () => void;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const sourceLabel = source === "agenda" ? "agenda" : "Excel/CSV";
  const done = status !== "running";
  const statusText =
    status === "completed"
      ? "Importação concluída"
      : status === "cancelled"
        ? "Importação cancelada"
        : "Importando contatos";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importação de Contatos"
      size="sm"
      footer={
        <Button variant={done ? "primary" : "secondary"} size="sm" onClick={onAction}>
          {done ? "Concluir" : "Cancelar importação"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">{statusText}</p>
          <p className="text-sm text-muted-foreground">Origem: {sourceLabel}</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">
              {current} de {total} Contatos
            </span>
            <span className="text-muted-foreground">{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        {done && (
          <p className="text-sm text-muted-foreground">{imported} contato(s) importado(s).</p>
        )}
      </div>
    </Modal>
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
    avatarUrl: string | null;
  }) => void | Promise<void>;
  initial?: Contact;
}) {
  const [nome, setNome] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [countryCode, setCountryCode] = React.useState("55");
  const [customerId, setCustomerId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [contactDepartmentId, setContactDepartmentId] = React.useState("");
  const [contactProfileId, setContactProfileId] = React.useState("");
  const [instanceIds, setInstanceIds] = React.useState<string[]>([]);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [customFields, setCustomFields] = React.useState<Record<string, string | boolean>>({});
  const [customFieldDefinitions, setCustomFieldDefinitions] = React.useState<ContactCustomField[]>(
    [],
  );
  const [activeContactTab, setActiveContactTab] = React.useState("Geral");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const customersManager = useDisclosure();
  const departmentsManager = useDisclosure();
  const profilesManager = useDisclosure();

  React.useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? "");
    const initialPhone = splitPhoneByCountry(initial?.telefone ?? "");
    setCountryCode(initialPhone.countryCode);
    setTelefone(
      initialPhone.localPhone
        ? maskBrazilMobilePhone(initialPhone.localPhone, initialPhone.countryCode)
        : "",
    );
    setCustomerId(initial?.customer_id ?? "");
    setEmail(initial?.email ?? "");
    setAvatarUrl(initial?.avatar_url ?? null);
    setContactDepartmentId(initial?.contactDepartmentId ?? "");
    setContactProfileId(initial?.contactProfileId ?? "");
    setInstanceIds(initial?.instanceIds ?? (initial?.instancia ? [initial.instancia] : []));
    setTagIds(initial?.tags.map((tag) => tag.id) ?? []);
    setCustomFields(initial?.customFields ?? {});
    setActiveContactTab("Geral");
    setErrors({});
    void crmApi
      .listContactCustomFields()
      .then(setCustomFieldDefinitions)
      .catch(() => setCustomFieldDefinitions([]));
  }, [initial, open]);

  const contactTabs = React.useMemo(
    () => uniqueLabels(["Geral", ...customFieldDefinitions.map(normalizeContactCustomFieldTab)]),
    [customFieldDefinitions],
  );
  const groupedCustomFields = React.useMemo(() => {
    const groups = new Map<string, ContactCustomField[]>();
    for (const field of customFieldDefinitions) {
      if (normalizeContactCustomFieldTab(field) !== activeContactTab) continue;
      const group = normalizeContactCustomFieldGroup(field);
      groups.set(group, [...(groups.get(group) ?? []), field]);
    }
    return Array.from(groups.entries());
  }, [activeContactTab, customFieldDefinitions]);

  const handle = () => {
    const errs: Record<string, string> = {};
    if (!nome.trim() || nome.trim().length < 2) errs.nome = "Informe o nome.";
    if (!isValidPhoneForCountry(telefone, countryCode)) errs.telefone = "WhatsApp inválido.";
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "E-mail invalido.";
    const normalizedCustomFields = normalizeCustomFieldValues(customFields, customFieldDefinitions);
    for (const field of customFieldDefinitions) {
      if (field.required && !String(normalizedCustomFields[field.id] ?? "").trim())
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
      customFields: normalizedCustomFields,
      avatarUrl,
    });
  };

  const handlePhotoChange = async (file: File | null) => {
    if (!file) return;
    try {
      setAvatarUrl(await readContactImageAsDataUrl(file));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar Contato" : "Criar Contato"}
      description=""
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <ContactFormLog contact={initial} />
          <div className="flex shrink-0 justify-end gap-1.5 sm:gap-2">
            <Button variant="ghost" size="sm" className="px-2 sm:px-2.5" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" className="px-2.5 sm:px-2.5" onClick={handle}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 border-b border-border">
          {contactTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveContactTab(tab)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeContactTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {activeContactTab === "Geral" && (
          <div className="grid gap-4 md:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)] md:items-start">
            <div className="order-0 md:row-span-2">
              <div className="flex items-center gap-3 md:block">
                <div className="relative inline-flex">
                  <Avatar name={nome || "Contato"} src={avatarUrl ?? undefined} size={88} />
                  <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-surface-1 text-muted-foreground shadow-sm transition hover:text-primary">
                    <Camera className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        void handlePhotoChange(event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                {avatarUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:mt-2 md:w-[88px] md:px-1"
                    onClick={() => setAvatarUrl(null)}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
            <div className="order-1 md:order-none">
              <Field label="Nome *">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                {errors.nome && (
                  <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>
                )}
              </Field>
            </div>
            <div className="order-4 md:order-none">
              <Field label="Empresa do Contato">
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
                </div>
              </Field>
            </div>
            <div className="order-2 md:order-none">
              <Field label="WhatsApp *">
                <div className="flex gap-2">
                  <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
                  <Input
                    value={telefone}
                    onChange={(e) =>
                      setTelefone(maskBrazilMobilePhone(e.target.value, countryCode))
                    }
                    placeholder="(00) 00000-0000"
                  />
                </div>
                {errors.telefone && (
                  <span className="mt-1 block text-[11px] text-destructive">{errors.telefone}</span>
                )}
              </Field>
            </div>
            <div className="order-5 md:order-none">
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
                </div>
              </Field>
            </div>
            <div className="order-3 md:order-none">
              <Field label="E-mail">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
                {errors.email && (
                  <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>
                )}
              </Field>
            </div>
            <div className="order-6 md:order-none">
              <Field label="Perfil do Contato">
                <div className="flex gap-2">
                  <Select
                    value={contactProfileId}
                    onChange={(e) => setContactProfileId(e.target.value)}
                  >
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
                </div>
              </Field>
            </div>
            <div className="order-7 md:order-none">
              <Field label="Instância">
                <InstanceMultiSelect
                  instances={instances}
                  selectedIds={instanceIds}
                  onChange={setInstanceIds}
                />
              </Field>
            </div>
            <div className="order-8 md:order-none">
              <Field label="Etiquetas">
                <TagMultiSelect tags={tags} selectedIds={tagIds} onChange={setTagIds} />
              </Field>
            </div>
          </div>
        )}
        {groupedCustomFields.map(([group, fields]) => (
          <div key={group} className="space-y-3">
            {group && (
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {group}
              </h3>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map((field) => {
                const isHtmlField = field.type === "text" && contactTextVariant(field) === "html";
                return (
                  <div key={field.id} className={isHtmlField ? "md:col-span-2" : ""}>
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium leading-none text-muted-foreground">
                        <span>
                          {field.label}
                          {field.required && <span className="text-destructive"> *</span>}
                        </span>
                        {field.note && (
                          <span
                            title={field.note}
                            className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full align-middle text-primary transition hover:text-primary/80"
                          >
                            <Info className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className={`flex gap-2 ${isHtmlField ? "items-start" : "items-center"}`}>
                        <CustomContactFieldInput
                          field={field}
                          value={customFields[field.id]}
                          onChange={(value) =>
                            setCustomFields((current) => ({ ...current, [field.id]: value }))
                          }
                        />
                      </div>
                      {errors[`custom_${field.id}`] && (
                        <span className="mt-1 block text-[11px] text-destructive">
                          {errors[`custom_${field.id}`]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
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
      const response = await crmApi.listCustomers({ q: query, page, pageSize });
      setCustomers(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      toast.error("Falha ao carregar empresas", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [open, page, pageSize, query]);
  React.useEffect(() => {
    if (open) void load();
  }, [load, open]);
  React.useEffect(() => {
    setPage(1);
  }, [pageSize, query]);
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
    <Modal open={open} onClose={onClose} title="Empresa do Contato" size="xl">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div></div>
          <Button variant="primary" size="sm" onClick={create.show}>
            <Plus className="h-3.5 w-3.5" /> Nova Empresa do Contato
          </Button>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por Empresa..." />
        <div className="space-y-3">
          {loading && (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          )}
          {!loading && (
            <div className="grid gap-3 md:grid-cols-2">
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-1 p-3 sm:gap-3"
                >
                  <div className="flex min-w-[9rem] flex-1 items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: customer.cor }}
                    >
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{customer.nome}</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => selectCustomer(customer)}>
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
              ))}
            </div>
          )}
          {!loading && customers.length === 0 && (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma empresa encontrada.
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 leading-tight sm:leading-normal">
                <span className="block sm:inline">Mostrando</span>
                <span className="block sm:inline">
                  {" "}
                  {customers.length} de {total}
                </span>
              </span>
              <Select
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 w-20 text-xs sm:w-24"
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
        title="Excluir Empresa do Contato?"
        description={
          <DeleteLinkedContactCatalogMessage name={deleting?.nome} entityLabel="empresa" />
        }
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
      toast.success("Departamento excluído");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error("Falha ao excluir departamento", { description: (error as Error).message });
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
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar departamento..." />
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
                  <Network className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{department.nome}</p>
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
                  title="Excluir"
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
        title="Excluir Departamento do Contato?"
        description={
          <DeleteLinkedContactCatalogMessage name={deleting?.nome} entityLabel="departamento" />
        }
        destructive
        confirmLabel="Excluir"
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
        : { color: "#3B82F6" },
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
        <div className="flex w-full items-center justify-between gap-2">
          <EntityFormLog createdAt={initial?.createdAt} updatedAt={initial?.updatedAt} />
          <div className="flex shrink-0 justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
          <Field label="Nome *">
            <Input
              value={form.name ?? ""}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
          </Field>
          <Field label="Cor">
            <ColorField
              value={form.color ?? "#3B82F6"}
              fallback="#3B82F6"
              onChange={(color) => setForm({ ...form, color })}
            />
          </Field>
        </div>
        <Field label="Nota">
          <Textarea
            rows={3}
            value={form.description ?? ""}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
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
      toast.success("Perfil excluído");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error("Falha ao excluir perfil", { description: (error as Error).message });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Perfil do Contato"
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
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar perfil..." />
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
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{profile.nome}</p>
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
                  title="Excluir"
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
        title="Excluir Perfil do Contato?"
        description={
          <DeleteLinkedContactCatalogMessage name={deleting?.nome} entityLabel="perfil" />
        }
        destructive
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={deleteProfile}
      />
    </Modal>
  );
}

function DeleteLinkedContactCatalogMessage({
  name,
  entityLabel,
}: {
  name?: string | null;
  entityLabel: string;
}) {
  const selectedName = name ?? `Sem ${entityLabel}`;

  return (
    <div className="space-y-2">
      <p>
        Deseja realmente excluir o cadastro <strong>"{selectedName}"</strong>?
      </p>
      <p className="text-xs italic text-muted-foreground">
        Os Contatos vinculados serão desvinculados.
      </p>
    </div>
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
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange([]);
              }}
              disabled={selectedIds.length === 0}
              className="flex items-center justify-center gap-1 rounded-md border border-destructive/30 bg-white px-2 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Limpar seleção
            </button>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }}
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
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: `${tag.cor ?? "#3B82F6"}1f`,
                  borderColor: `${tag.cor ?? "#3B82F6"}66`,
                  color: tag.cor ?? "#3B82F6",
                }}
              >
                <Tag className="h-3 w-3 shrink-0" />
                {tag.nome}
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          className={`${flow ? "relative z-[9999] mt-2" : `absolute right-0 z-[9999] ${placement === "down" ? "top-full mt-2" : "bottom-full mb-2"}`} flex max-h-[min(24rem,calc(100vh-8rem))] w-[min(42rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl`}
        >
          <div className="grid min-h-0 grid-cols-1 gap-1 overflow-y-auto overflow-x-hidden p-1 sm:grid-cols-2">
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
                    className="inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: `${tag.cor ?? "#3B82F6"}1f`,
                      borderColor: `${tag.cor ?? "#3B82F6"}66`,
                      color: tag.cor ?? "#3B82F6",
                    }}
                  >
                    <Tag className="h-3 w-3 shrink-0" />
                    <span className="truncate">{tag.nome}</span>
                  </span>
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
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange([]);
              }}
              disabled={selectedIds.length === 0}
              className="flex items-center justify-center gap-1 rounded-md border border-destructive/30 bg-white px-2 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Limpar seleção
            </button>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }}
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
function ContactFormLog({ contact }: { contact?: Contact }) {
  if (!contact) return <span aria-hidden="true" />;
  return (
    <div className="min-w-0 text-left text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
      <div className="truncate">
        <span className="font-semibold text-foreground">Criado:</span>{" "}
        {formatDateTime(contact.createdAt)}
      </div>
      <div className="truncate">
        <span className="font-semibold text-foreground">Editado:</span>{" "}
        {formatDateTime(contact.updatedAt)}
      </div>
    </div>
  );
}

function EntityFormLog({
  createdAt,
  updatedAt,
}: {
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  if (!createdAt && !updatedAt) return <span aria-hidden="true" />;
  return (
    <div className="min-w-0 text-left text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
      <div className="truncate">
        <span className="font-semibold text-foreground">Criado:</span> {formatDateTime(createdAt)}
      </div>
      <div className="truncate">
        <span className="font-semibold text-foreground">Editado:</span> {formatDateTime(updatedAt)}
      </div>
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
      <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>Marcado</span>
      </div>
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

  if (field.type === "text") {
    const variant = contactTextVariant(field);
    const inputValue = String(value ?? "");
    if (variant === "long") {
      return (
        <Textarea rows={3} value={inputValue} onChange={(event) => onChange(event.target.value)} />
      );
    }
    if (variant === "html") {
      return <HtmlTextEditor value={inputValue} onChange={(next) => onChange(next)} />;
    }
    return (
      <Input type="text" value={inputValue} onChange={(event) => onChange(event.target.value)} />
    );
  }

  if (field.type === "date") {
    const variant = contactDateVariant(field);
    return (
      <CustomDateInput
        value={String(value ?? "")}
        variant={variant}
        onChange={(next) => onChange(next)}
      />
    );
  }

  const numberConfig = contactNumberConfig(field);
  return (
    <Input
      type="text"
      inputMode="decimal"
      className="text-right"
      value={String(value ?? "")}
      placeholder={numberPlaceholder(numberConfig)}
      onChange={(event) => onChange(maskAdditionalNumber(event.target.value, numberConfig))}
    />
  );
}

function HtmlTextEditor({
  value,
  onChange,
  expanded = false,
}: {
  value: string;
  onChange: (value: string) => void;
  expanded?: boolean;
}) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const selectionRef = React.useRef<Range | null>(null);
  const lastCommandRef = React.useRef<{ name: string; at: number } | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [alignmentCommand, setAlignmentCommand] = React.useState("justifyLeft");
  const [fontName, setFontName] = React.useState("Arial");
  const [fontSize, setFontSize] = React.useState("3");
  const [fontColor, setFontColor] = React.useState("#111827");
  const alignmentIcon =
    alignmentCommand === "justifyCenter" ? (
      <AlignCenter className="h-4 w-4 text-muted-foreground" />
    ) : alignmentCommand === "justifyRight" ? (
      <AlignRight className="h-4 w-4 text-muted-foreground" />
    ) : alignmentCommand === "justifyFull" ? (
      <AlignJustify className="h-4 w-4 text-muted-foreground" />
    ) : (
      <AlignLeft className="h-4 w-4 text-muted-foreground" />
    );

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    if (editor.innerHTML !== value) editor.innerHTML = value;
  }, [value]);

  const sync = () => onChange(editorRef.current?.innerHTML ?? "");
  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  };
  const restoreSelection = () => {
    const selection = window.getSelection();
    const range = selectionRef.current;
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const placeCursorAtEnd = (element: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    selectionRef.current = range.cloneRange();
  };
  const command = (name: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const now = Date.now();
    const commandKey = `${name}:${commandValue ?? ""}`;
    if (lastCommandRef.current?.name === commandKey && now - lastCommandRef.current.at < 700) {
      return;
    }
    lastCommandRef.current = { name: commandKey, at: now };
    editor.focus();
    restoreSelection();
    if (name === "insertUnorderedList" && !editor.textContent?.trim()) {
      editor.innerHTML = "<ul><li><br></li></ul>";
      const item = editor.querySelector("li");
      if (item instanceof HTMLElement) placeCursorAtEnd(item);
      sync();
      return;
    }
    document.execCommand(name, false, commandValue);
    saveSelection();
    sync();
  };

  const editor = (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-surface-1">
      <div className="flex items-start justify-between gap-2 border-b border-border bg-card px-2 py-1.5">
        <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-xl bg-surface-2 px-2 py-1 shadow-sm">
          <ToolbarButton title="Desfazer" onClick={() => command("undo")}>
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Refazer" onClick={() => command("redo")}>
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarSelect
            title="Tipo da fonte"
            value={fontName}
            className="w-32"
            onMouseDown={saveSelection}
            onChange={(next) => {
              setFontName(next);
              command("fontName", next);
            }}
          >
            <option value="Arial">Sans Serif</option>
            <option value="Times New Roman">Serif</option>
            <option value="Courier New">Largura fixa</option>
            <option value="Arial Black">Largo</option>
            <option value="Arial Narrow">Estreito</option>
            <option value="Comic Sans MS">Comic Sans MS</option>
            <option value="Garamond">Garamond</option>
            <option value="Georgia">Georgia</option>
            <option value="Tahoma">Tahoma</option>
            <option value="Trebuchet MS">Trebuchet MS</option>
            <option value="Verdana">Verdana</option>
          </ToolbarSelect>
          <ToolbarDivider />
          <label
            className="relative inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-foreground transition hover:bg-card"
            title="Tamanho da fonte"
          >
            <Type className="h-4 w-4" />
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-none"
              value={fontSize}
              onMouseDown={saveSelection}
              onChange={(event) => {
                setFontSize(event.target.value);
                command("fontSize", event.target.value);
              }}
              aria-label="Tamanho da fonte"
            >
              <option value="2">Pequeno</option>
              <option value="3">Normal</option>
              <option value="5">Grande</option>
              <option value="7">Enorme</option>
            </select>
          </label>
          <ToolbarDivider />
          <ToolbarButton title="Negrito" onClick={() => command("bold")}>
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Itálico" onClick={() => command("italic")}>
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Sublinhado" onClick={() => command("underline")}>
            <Underline className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Riscado" onClick={() => command("strikeThrough")}>
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <label
            className="relative inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs transition hover:bg-card"
            title="Cor do texto"
          >
            <span className="font-semibold">A</span>
            <span className="h-1 w-4 rounded-sm" style={{ backgroundColor: fontColor }} />
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="color"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={fontColor}
              onMouseDown={saveSelection}
              onChange={(event) => {
                setFontColor(event.target.value);
                command("foreColor", event.target.value);
              }}
            />
          </label>
          <ToolbarDivider />
          <label
            className="relative inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs transition hover:bg-card"
            title="Alinhamento"
          >
            {alignmentIcon}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-none"
              value={alignmentCommand}
              onMouseDown={saveSelection}
              onChange={(event) => {
                setAlignmentCommand(event.target.value);
                command(event.target.value);
              }}
              aria-label="Alinhamento"
            >
              <option value="justifyLeft">Esquerda</option>
              <option value="justifyCenter">Centro</option>
              <option value="justifyRight">Direita</option>
              <option value="justifyFull">Justificado</option>
            </select>
          </label>
          <ToolbarButton title="Lista numerada" onClick={() => command("insertOrderedList")}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Marcadores" onClick={() => command("insertUnorderedList")}>
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Diminuir recuo" onClick={() => command("outdent")}>
            <ListIndentDecrease className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Aumentar recuo" onClick={() => command("indent")}>
            <ListIndentIncrease className="h-4 w-4" />
          </ToolbarButton>
          {!expanded && (
            <>
              <ToolbarDivider />
              <ToolbarButton title="Maximizar" onClick={() => setFullscreen(true)}>
                <Expand className="h-4 w-4" />
              </ToolbarButton>
            </>
          )}
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={`min-h-44 w-full overflow-y-auto px-3 py-2 text-sm outline-none [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 ${
          expanded ? "min-h-[62vh]" : ""
        }`}
        onBlur={saveSelection}
        onInput={() => {
          saveSelection();
          sync();
        }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
      />
    </div>
  );

  return (
    <>
      {editor}
      <Modal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title="Editar Texto HTML"
        size="xl"
        footer={
          <Button variant="primary" size="sm" onClick={() => setFullscreen(false)}>
            Concluir
          </Button>
        }
      >
        <HtmlTextEditor value={value} onChange={onChange} expanded />
      </Modal>
    </>
  );
}

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-card hover:text-foreground"
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

function ToolbarSelect({
  title,
  value,
  className = "",
  onMouseDown,
  onChange,
  children,
}: {
  title: string;
  value: string;
  className?: string;
  onMouseDown: () => void;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`relative inline-flex h-8 items-center rounded-md px-2 text-xs transition hover:bg-card ${className}`}
      title={title}
    >
      <select
        className="w-full appearance-none bg-transparent pr-5 text-xs outline-none"
        value={value}
        onMouseDown={onMouseDown}
        onChange={(event) => onChange(event.target.value)}
        aria-label={title}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </label>
  );
}

function CustomDateInput({
  value,
  variant,
  onChange,
}: {
  value: string;
  variant: ContactDateVariant;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(() => formatDateForDisplay(value, variant));

  React.useEffect(() => {
    if (document.activeElement instanceof HTMLElement && document.activeElement.dataset.dateInput) {
      return;
    }
    setDraft(formatDateForDisplay(value, variant));
  }, [value, variant]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={draft}
      placeholder={variant === "datetime" ? "28/08/2026 10:08" : "28/08/2026"}
      data-date-input="true"
      onKeyDown={(event) => {
        if (event.key.toLowerCase() !== "h") return;
        event.preventDefault();
        const parsed = dateDraftFromDate(new Date(), variant);
        setDraft(parsed.display);
        onChange(parsed.iso);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        const parsed = parseDateDraft(draft, variant);
        if (!parsed) {
          onChange(draft);
          return;
        }
        setDraft(parsed.display);
        onChange(parsed.iso);
      }}
    />
  );
}

function dateDraftFromDate(date: Date, variant: ContactDateVariant) {
  const pad = (part: number) => String(part).padStart(2, "0");
  const displayDate = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  return {
    display:
      variant === "datetime"
        ? `${displayDate} ${pad(date.getHours())}:${pad(date.getMinutes())}`
        : displayDate,
    iso: date.toISOString(),
  };
}

function normalizeCustomFieldValues(
  values: Record<string, string | boolean>,
  fields: ContactCustomField[],
) {
  const normalized = { ...values };
  for (const field of fields) {
    if (field.type !== "date") continue;
    const value = values[field.id];
    if (typeof value !== "string" || !value.trim()) continue;
    const parsed = parseDateDraft(value, contactDateVariant(field));
    if (parsed) normalized[field.id] = parsed.iso;
  }
  return normalized;
}

function parseContactFieldConfig(mask?: string | null): ContactFieldConfig {
  if (!mask?.trim().startsWith("{")) return {};
  try {
    return JSON.parse(mask) as ContactFieldConfig;
  } catch {
    return {};
  }
}

function contactTextVariant(field: ContactCustomField): ContactTextVariant {
  return parseContactFieldConfig(field.mask).text?.variant ?? "short";
}

function contactNumberConfig(field: ContactCustomField) {
  const config = parseContactFieldConfig(field.mask).number;
  return {
    decimals: clampInteger(config?.decimals ?? 2, 0, 6),
    thousands: config?.thousands ?? true,
    symbol: (config?.symbol ?? "") as ContactNumberSymbol,
  };
}

function contactDateVariant(field: ContactCustomField): ContactDateVariant {
  return parseContactFieldConfig(field.mask).date?.variant ?? "date";
}

function formatDateForDisplay(value: string, variant: ContactDateVariant) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const parsed = parseDateDraft(value, variant);
    return parsed?.display ?? value;
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  const base = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  if (variant === "date") return base;
  return `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateDraft(value: string, variant: ContactDateVariant) {
  const digits = onlyDigits(value);
  const expectedLength = variant === "datetime" ? 12 : 8;
  if (digits.length < expectedLength) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const hour = variant === "datetime" ? Number(digits.slice(8, 10)) : 0;
  const minute = variant === "datetime" ? Number(digits.slice(10, 12)) : 0;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;
  if (!valid) return null;
  const pad = (part: number) => String(part).padStart(2, "0");
  const displayDate = `${pad(day)}/${pad(month)}/${year}`;
  return {
    display: variant === "datetime" ? `${displayDate} ${pad(hour)}:${pad(minute)}` : displayDate,
    iso: date.toISOString(),
  };
}

function numberPlaceholder(config: ReturnType<typeof contactNumberConfig>) {
  const decimals = config.decimals > 0 ? `,${"0".repeat(config.decimals)}` : "";
  const base = `0${decimals}`;
  if (!config.symbol) return base;
  return config.symbol === "%" ? `${base}%` : `${config.symbol} ${base}`;
}

function maskAdditionalNumber(value: string, config: ReturnType<typeof contactNumberConfig>) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  const decimals = clampInteger(config.decimals, 0, 6);
  const padded = decimals > 0 ? digits.padStart(decimals + 1, "0") : digits;
  const integerRaw = decimals > 0 ? padded.slice(0, -decimals) : padded;
  const decimalRaw = decimals > 0 ? padded.slice(-decimals) : "";
  const integer = (integerRaw.replace(/^0+(?=\d)/, "") || "0").replace(
    config.thousands ? /\B(?=(\d{3})+(?!\d))/g : /$^/g,
    ".",
  );
  const formatted = decimals > 0 ? `${integer},${decimalRaw}` : integer;
  if (!config.symbol) return formatted;
  return config.symbol === "%" ? `${formatted}%` : `${config.symbol} ${formatted}`;
}

function clampInteger(value: string | number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }).replace(",", "");
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

const IMPORT_TEMPLATE_ROWS = [
  ["Contato", "WhatsApp", "E-mail", "Empresa", "Departamento", "Perfil", "Instâncias", "Etiquetas"],
  [
    "Maria Exemplo",
    "+55 (11) 90000-0000",
    "maria@empresa.com",
    "FLOWID",
    "Financeiro",
    "Gerente",
    "SMCLICK",
    "VIP",
  ],
];

async function parseSpreadsheetFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") return parseCsv(await file.text());
  if (extension === "xls" || extension === "xlsx") {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) return [];
    return XLSX.utils.sheet_to_json<string[]>(firstSheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
  }
  throw new Error("Formato inválido. Use XLSX, XLS ou CSV.");
}

function countValidImportRows(rows: string[][]) {
  const [header, ...records] = rows;
  if (!header?.length) return 0;
  const index = new Map(header.map((item, i) => [normalizeHeader(item), i]));
  return records.filter((row) => {
    const name = valueAt(row, index, ["contato", "nome", "name"]);
    const phone = valueAt(row, index, [
      "whatsapp",
      "telefone",
      "phone",
      "celular",
      "numero",
      "número",
    ]);
    return Boolean(name && phone);
  }).length;
}

function downloadImportTemplate(format: "csv" | "xls" | "xlsx") {
  const filename = `modelo-importacao-contatos.${format}`;
  if (format === "xlsx") {
    const worksheet = XLSX.utils.aoa_to_sheet(IMPORT_TEMPLATE_ROWS);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contatos");
    XLSX.writeFile(workbook, filename);
    return;
  }
  if (format === "xls") {
    downloadTextFile(filename, toExcelHtml(IMPORT_TEMPLATE_ROWS), "application/vnd.ms-excel");
    return;
  }
  downloadTextFile(filename, toCsv(IMPORT_TEMPLATE_ROWS), "text/csv;charset=utf-8");
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === "," || char === ";") && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
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

function splitImportList(value: string) {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeImportName(value: string) {
  return normalizeHeader(value).replace(/\s+/g, " ");
}

function findByImportedName<T extends { nome: string }>(items: T[], value: string) {
  const normalized = normalizeImportName(value);
  if (!normalized) return undefined;
  return items.find((item) => normalizeImportName(item.nome) === normalized);
}

function findImportedInstance(instances: ContactInstanceOption[], value: string) {
  const normalized = normalizeImportName(value);
  if (!normalized) return undefined;
  return instances.find((instance) =>
    [instance.name, instance.id, instance.value, instance.externalReference ?? ""].some(
      (candidate) => normalizeImportName(candidate) === normalized,
    ),
  );
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
  const digits = normalizeBrazilMobileDigits(onlyDigits(value), countryCode);
  if (!digits) return value;
  const code = onlyDigits(countryCode) || "55";
  return digits.startsWith(code) ? `+${digits}` : `+${code}${digits}`;
}

function maskBrazilMobilePhone(value: string, countryCode = "55") {
  const digits = onlyDigits(value);
  return onlyDigits(countryCode) === "55" ? maskBrazilPhone(digits) : digits;
}

function isValidPhoneForCountry(value: string, countryCode = "55") {
  const code = onlyDigits(countryCode) || "55";
  const digits = onlyDigits(value);
  const fullDigits = digits.startsWith(code) ? digits : `${code}${digits}`;
  if (isWhatsAppGroupPhone(fullDigits)) return true;
  if (code !== "55") return digits.length >= 6;
  const local = normalizeBrazilMobileDigits(digits, code);
  if (local.length !== 11 || local[2] !== "9") return false;
  const subscriber = local.slice(3);
  return !/^(\d)\1+$/.test(subscriber);
}

function isWhatsAppGroupPhone(digits: string) {
  return digits.startsWith("120363") && digits.length >= 16 && digits.length <= 30;
}

function normalizeBrazilMobileDigits(digits: string, countryCode = "55") {
  if (onlyDigits(countryCode) !== "55") return digits;
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 10) {
    return `${local.slice(0, 2)}9${local.slice(2)}`;
  }
  return local;
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
        <span>+{selected.code}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[100] mt-2 w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar país ou DDI..."
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive/15"
                aria-label="Limpar busca"
                title="Limpar busca"
              >
                <X className="h-3 w-3" />
              </button>
            )}
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

function uniqueLabels(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function normalizeContactCustomFieldTab(field: ContactCustomField) {
  const tab = field.tabName?.trim();
  return !tab || tab.toLowerCase() === "geral" || tab.toLowerCase() === "campos adicionais"
    ? "Dados Adicionais"
    : tab;
}

function normalizeContactCustomFieldGroup(field: ContactCustomField) {
  const group = field.groupName?.trim();
  return !group || group.toLowerCase() === "dados do contato" ? "" : group;
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
        <div className="flex w-full items-center justify-between gap-2">
          <EntityFormLog createdAt={initial?.createdAt} updatedAt={initial?.updatedAt} />
          <div className="flex shrink-0 justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
          <Field label="Nome *">
            <Input
              value={form.nome ?? ""}
              onChange={(event) => setForm({ ...form, nome: event.target.value })}
            />
            {errors.nome && (
              <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>
            )}
          </Field>
          <Field label="Cor">
            <ColorField
              value={form.cor ?? "#3B82F6"}
              fallback="#3B82F6"
              onChange={(cor) => setForm({ ...form, cor })}
            />
          </Field>
        </div>
        <Field label="Contato Responsável">
          <Input
            value={form.contato_responsavel ?? ""}
            onChange={(event) => setForm({ ...form, contato_responsavel: event.target.value })}
          />
        </Field>
        <Field label="WhatsApp">
          <Input
            value={form.telefone ?? ""}
            onChange={(event) =>
              setForm({ ...form, telefone: maskBrazilPhone(event.target.value) })
            }
            placeholder="(00) 00000-0000"
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="email@exemplo.com"
          />
          {errors.email && (
            <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>
          )}
        </Field>
        <Field label="Notas">
          <Textarea
            rows={4}
            value={form.notas ?? ""}
            onChange={(event) => setForm({ ...form, notas: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}

function normalizeHexColor(value?: string | null, _fallback = "#3B82F6") {
  const digits = String(value ?? "")
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6);
  return `#${digits.toUpperCase()}`;
}

function completeHexColor(value?: string | null, fallback = "#3B82F6") {
  const normalized = normalizeHexColor(value);
  return normalized.length === 7 ? normalized : normalizeHexColor(fallback);
}

function ColorField({
  value,
  fallback,
  onChange,
}: {
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-1.5 transition focus-within:border-primary">
      <input
        type="color"
        value={completeHexColor(value, fallback)}
        onChange={(event) => onChange(normalizeHexColor(event.target.value, fallback))}
        className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0"
        aria-label="Selecionar cor"
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(normalizeHexColor(event.target.value, fallback))}
        placeholder={completeHexColor(fallback, fallback)}
        maxLength={7}
        className="min-w-0 flex-1 border-0 bg-transparent font-mono text-xs uppercase outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
      />
    </div>
  );
}

function readContactImageAsDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    return Promise.reject(new Error("Use uma imagem PNG, JPG ou WebP."));
  }
  if (file.size > 2 * 1024 * 1024) {
    return Promise.reject(new Error("A imagem deve ter até 2 MB."));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 320;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Não foi possível processar a imagem."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function customerPayload(data: CustomerFormData) {
  return {
    name: data.nome,
    responsibleContactName: data.contato_responsavel?.trim() || null,
    phone: data.telefone?.trim() || null,
    email: data.email?.trim() || null,
    color: completeHexColor(data.cor, "#3B82F6"),
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
    color: completeHexColor(data.color, "#3B82F6"),
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
  avatarUrl?: string | null;
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
    avatarUrl: data.avatarUrl ?? null,
  };
}
