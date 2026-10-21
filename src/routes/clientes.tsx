import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FilterX,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  SendHorizontal,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  InstanceFilterSelect,
  SearchInput,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { ConfirmDialog, Modal } from "@/components/modal";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatPhoneForDisplay,
  isValidEmail,
  maskBrazilPhone,
  maskCnpj,
  onlyDigits,
} from "@/lib/input-masks";
import { formatPhoneForSubmit, splitPhoneByCountry } from "@/lib/phone-country";
import { CountryCodeSelect } from "@/routes/contatos";
import {
  crmApi,
  ticketApi,
  TrixusApiError,
  type ApiContact,
  type ApiCustomer,
  type ApiCustomerBranch,
  type ApiCustomerDepartment,
} from "@/lib/trixus-api";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes | Trixus" }] }),
  component: ClientesPage,
});

type PersonType = "PHYSICAL" | "LEGAL";
type CustomerStatus = "ACTIVE" | "PROSPECT" | "SUSPENDED" | "CANCELLED";
type ViewMode = "list" | "cards";
type CustomerTab = "general" | "branches" | "departments" | "contacts";

type TicketCustomer = ApiCustomer & {
  personType?: PersonType;
  status?: CustomerStatus;
  document?: string | null;
  legalName?: string | null;
  city?: string | null;
  state?: string | null;
  addressFullEnabled?: boolean;
  postalCode?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  addressWithoutNumber?: boolean;
  complement?: string | null;
  neighborhood?: string | null;
  country?: string | null;
};

type CustomerForm = {
  name: string;
  personType: PersonType;
  status: CustomerStatus;
  document: string;
  legalName: string;
  responsibleContactName: string;
  countryCode: string;
  phone: string;
  email: string;
  notes: string;
  fullAddress: boolean;
  zipCode: string;
  address: string;
  addressNumber: string;
  addressWithoutNumber: boolean;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
};

const STATUS_OPTIONS: Array<{
  value: CustomerStatus;
  label: string;
  tone: "success" | "info" | "warning" | "destructive";
  color: string;
}> = [
  { value: "ACTIVE", label: "Ativo", tone: "success", color: "var(--color-success)" },
  { value: "PROSPECT", label: "Prospecção", tone: "info", color: "var(--color-info)" },
  { value: "SUSPENDED", label: "Suspenso", tone: "warning", color: "var(--color-warning)" },
  {
    value: "CANCELLED",
    label: "Cancelado",
    tone: "destructive",
    color: "var(--color-destructive)",
  },
];

const STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const EMPTY_FORM: CustomerForm = {
  name: "",
  personType: "LEGAL",
  status: "ACTIVE",
  document: "",
  legalName: "",
  responsibleContactName: "",
  countryCode: "55",
  phone: "",
  email: "",
  notes: "",
  fullAddress: false,
  zipCode: "",
  address: "",
  addressNumber: "",
  addressWithoutNumber: false,
  addressComplement: "",
  neighborhood: "",
  city: "",
  state: "",
  country: "Brasil",
};

function ClientesPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [query, setQuery] = React.useState("");
  const [personType, setPersonType] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const viewModeTouched = React.useRef(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [editing, setEditing] = React.useState<TicketCustomer | null>(null);
  const [viewing, setViewing] = React.useState<TicketCustomer | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<TicketCustomer | null>(null);

  const customers = useQuery({
    queryKey: ["tickets", "customers", "catalog"],
    queryFn: () => crmApi.listCustomers({ pageSize: 10_000 }),
  });
  const items = React.useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return ((customers.data?.items ?? []) as TicketCustomer[]).filter((customer) => {
      const matchesQuery =
        !normalized ||
        [customer.nome, customer.document, customer.contato_responsavel, customer.email]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalized));
      return (
        matchesQuery &&
        (!personType || customerPersonType(customer) === personType) &&
        (!status || customerStatus(customer) === status)
      );
    });
  }, [customers.data?.items, personType, query, status]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => setPage(1), [query, personType, status, pageSize]);
  React.useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages]);
  React.useEffect(() => {
    if (isMobile) {
      setViewMode("cards");
      return;
    }
    if (!viewModeTouched.current) setViewMode("list");
  }, [isMobile]);

  const remove = useMutation({
    mutationFn: (id: string) => crmApi.deleteCustomer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tickets", "customers"] });
      setDeleting(null);
      toast.success("Cliente excluído.");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const duplicate = async (customer: TicketCustomer) => {
    try {
      await crmApi.createCustomer({
        name: `${customer.nome} - Cópia`,
        responsibleContactName: customer.contato_responsavel,
        phone: customer.telefone,
        email: null,
        notes: customer.notas,
        color: customer.cor,
      });
      await queryClient.invalidateQueries({ queryKey: ["tickets", "customers"] });
      toast.success("Cliente duplicado.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setPersonType("");
    setStatus("");
  };
  const hasFilters = Boolean(query.trim() || personType || status);

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Clientes"
          subtitle={`${items.length} ${items.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}.`}
          actions={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo cliente
            </Button>
          }
        />
        <Card className="mb-4" padding={false}>
          <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
            <Field label="Busca">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar por nome, CNPJ, CPF ou responsável..."
              />
            </Field>
            <Field label="Tipo de pessoa">
              <Select value={personType} onChange={(event) => setPersonType(event.target.value)}>
                <option value="">Todas</option>
                <option value="PHYSICAL">Física</option>
                <option value="LEGAL">Jurídica</option>
              </Select>
            </Field>
            <Field label="Situação">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todas</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            {hasFilters && (
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-10 w-10 px-0"
                  onClick={resetFilters}
                  aria-label="Limpar filtros"
                  title="Limpar filtros"
                >
                  <FilterX className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </Card>
        <div
          className="mb-3 hidden items-center justify-end gap-1 md:flex"
          aria-label="Visualização de clientes"
        >
          <Button
            type="button"
            variant={viewMode === "cards" ? "primary" : "secondary"}
            size="icon"
            onClick={() => {
              viewModeTouched.current = true;
              setViewMode("cards");
            }}
            aria-label="Visualizar clientes em cards"
            aria-pressed={viewMode === "cards"}
            title="Cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "primary" : "secondary"}
            size="icon"
            onClick={() => {
              viewModeTouched.current = true;
              setViewMode("list");
            }}
            aria-label="Visualizar clientes em lista"
            aria-pressed={viewMode === "list"}
            title="Lista"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        {customers.isPending ? (
          <Card>
            <p className="text-sm text-muted-foreground">Carregando clientes...</p>
          </Card>
        ) : customers.isError ? (
          <Card>
            <p className="text-sm text-destructive">{customers.error.message}</p>
          </Card>
        ) : visibleItems.length === 0 ? (
          <Card className="py-12 text-center">
            <Building2 className="mx-auto h-9 w-9 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhum cliente encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste os filtros ou cadastre um novo cliente.
            </p>
          </Card>
        ) : viewMode === "cards" ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                onView={() => setViewing(customer)}
                onDuplicate={() => void duplicate(customer)}
                onEdit={() => setEditing(customer)}
                onDelete={() => setDeleting(customer)}
              />
            ))}
          </div>
        ) : (
          <>
            <Card padding={false} className="hidden overflow-hidden p-0 md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead className="bg-surface-2">
                    <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-3 py-3">CPF / CNPJ</th>
                      <th className="px-3 py-3">Tipo de pessoa</th>
                      <th className="px-3 py-3">Telefone</th>
                      <th className="px-3 py-3">Cidade - UF</th>
                      <th className="px-3 py-3">Dt. Cadastro</th>
                      <th className="px-3 py-3">Situação</th>
                      <th className="px-4 py-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((customer) => (
                      <tr
                        key={customer.id}
                        className="border-b border-border/70 last:border-0 hover:bg-surface-1/70"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold">{customer.nome}</p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <UserRound className="h-3 w-3" />{" "}
                            {customer.contato_responsavel || "Sem responsável"}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" /> {customer.email || "Sem e-mail"}
                          </p>
                        </td>
                        <td className="px-3 py-3">{customerDocument(customer)}</td>
                        <td className="px-3 py-3">
                          {customerPersonType(customer) === "LEGAL" ? "Jurídica" : "Física"}
                        </td>
                        <td className="px-3 py-3">
                          {customer.telefone ? formatPhoneForDisplay(customer.telefone) : "-"}
                        </td>
                        <td className="px-3 py-3">{customerLocation(customer)}</td>
                        <td className="px-3 py-3">
                          {formatCustomerRegistrationDate(customer.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <CustomerStatusBadge status={customerStatus(customer)} />
                        </td>
                        <td className="px-4 py-3">
                          <CustomerActions
                            onView={() => setViewing(customer)}
                            onDuplicate={() => void duplicate(customer)}
                            onEdit={() => setEditing(customer)}
                            onDelete={() => setDeleting(customer)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                total={items.length}
                visible={visibleItems.length}
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
              />
            </Card>
            <div className="grid gap-3 md:hidden">
              {visibleItems.map((customer) => (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  onView={() => setViewing(customer)}
                  onDuplicate={() => void duplicate(customer)}
                  onEdit={() => setEditing(customer)}
                  onDelete={() => setDeleting(customer)}
                />
              ))}
            </div>
          </>
        )}
        {items.length > 0 && viewMode === "cards" && (
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border md:block">
            <Pagination
              total={items.length}
              visible={visibleItems.length}
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          </div>
        )}
      </PageContainer>
      <CustomerFormModal
        open={creating || !!editing}
        initial={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ["tickets", "customers"] });
          setCreating(false);
          setEditing(null);
        }}
      />
      <CustomerViewModal customer={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="Excluir cliente?"
        description={
          <>
            Deseja realmente excluir o cliente{" "}
            <strong className="font-semibold text-foreground">
              {`"${deleting?.nome ?? "selecionado"}"`}
            </strong>
            ?
            <br />
            Os contatos vinculados serão preservados sem empresa.
          </>
        }
        confirmLabel="Excluir"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </AppShell>
  );
}

function CustomerCard({
  customer,
  onView,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  customer: TicketCustomer;
  onView: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card padding={false} className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-semibold">{customer.nome}</p>
          <CustomerStatusBadge status={customerStatus(customer)} />
        </div>
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />{" "}
            {customerPersonType(customer) === "LEGAL" ? "CNPJ" : "CPF"}:{" "}
            {customerDocument(customer)}
          </p>
          <p className="flex items-center gap-2">
            <UserRound className="h-4 w-4" /> {customer.contato_responsavel || "Sem responsável"}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4" />{" "}
            {customer.telefone ? formatPhoneForDisplay(customer.telefone) : "Sem telefone"}
          </p>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <p className="flex min-w-0 items-center gap-2">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{customer.email || "Sem e-mail"}</span>
          </p>
          <p className="flex shrink-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {customerLocation(customer)}
          </p>
        </div>
      </div>
      <div className="mx-4 border-t border-border py-2">
        <CustomerActions
          onView={onView}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </Card>
  );
}

function CustomerActions({
  onView,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Action icon={<Eye />} label="Ver" onClick={onView} />
      <Action icon={<Copy />} label="Duplicar" onClick={onDuplicate} />
      <Action icon={<Pencil />} label="Editar" onClick={onEdit} />
      <Action icon={<Trash2 />} label="Excluir" onClick={onDelete} danger />
    </div>
  );
}

function Action({
  icon,
  label,
  onClick,
  danger,
  success,
  disabled = false,
}: {
  icon: React.ReactElement<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  success?: boolean;
  disabled?: boolean;
}) {
  const defaultHoverClass = danger
    ? "hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
    : "hover:border-primary/40 hover:text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${success ? "action-hover-success" : defaultHoverClass}`}
    >
      {React.cloneElement(icon, {
        className: `h-4 w-4 ${icon.props.className ?? ""}`.trim(),
      })}
    </button>
  );
}

function Pagination({
  total,
  visible,
  page,
  totalPages,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number;
  visible: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <div
      data-customers-list-footer
      className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">
          Mostrando {visible} de {total}
        </span>
        <Select
          className="!h-6 !min-h-6 !w-16 !rounded-md !px-2 !py-0 !pr-6 text-xs"
          value={String(pageSize)}
          onChange={(event) => onPageSize(Number(event.target.value))}
          aria-label="Itens por página"
        >
          {[10, 25, 50].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !min-h-7 !w-7 !p-0"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-mono">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !min-h-7 !w-7 !p-0"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CustomerFormModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: TicketCustomer | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [tab, setTab] = React.useState<CustomerTab>("general");
  const [form, setForm] = React.useState<CustomerForm>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const contacts = useQuery({
    queryKey: ["tickets", "customer-contacts", initial?.id],
    queryFn: () => crmApi.listCustomerContacts(initial!.id),
    enabled: open && !!initial?.id,
  });
  const branches = useQuery({
    queryKey: ["tickets", "customer-branches", initial?.id],
    queryFn: () => crmApi.listCustomerBranches(initial!.id),
    enabled: open && !!initial?.id,
  });
  const departments = useQuery({
    queryKey: ["tickets", "customer-departments", initial?.id],
    queryFn: () => crmApi.listCustomerDepartments(initial!.id),
    enabled: open && !!initial?.id,
  });
  React.useEffect(() => {
    if (open) {
      setTab("general");
      setErrors({});
      setForm(initial ? formFromCustomer(initial) : EMPTY_FORM);
    }
  }, [initial, open]);
  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) nextErrors.name = "Informe o nome do cliente.";
    if (form.email && !isValidEmail(form.email)) nextErrors.email = "Informe um e-mail válido.";
    if (!form.city.trim()) nextErrors.city = "Informe a cidade.";
    if (!form.state) nextErrors.state = "Informe a UF.";
    if (form.fullAddress && !form.address.trim()) nextErrors.address = "Informe o endereço.";
    if (form.fullAddress && !form.addressWithoutNumber && !form.addressNumber.trim())
      nextErrors.addressNumber = "Informe o número ou marque S/N.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const payload = customerPayload(form);
      if (initial) await crmApi.updateCustomer(initial.id, payload);
      else await crmApi.createCustomer(payload);
      toast.success(initial ? "Cliente atualizado." : "Cliente cadastrado.");
      await onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar Cliente" : "Novo Cliente"}
      size="xl"
      className="sm:max-w-[45rem]"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Audit customer={initial} />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="save-action-button" onClick={() => void save()} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="-mx-4 -mt-4 mb-5 flex overflow-x-auto border-b border-border px-4 sm:-mx-6 sm:-mt-5 sm:px-6">
        {(
          [
            ["general", "Geral"],
            ["branches", "Filiais"],
            ["departments", "Departamentos"],
            ["contacts", "Contatos"],
          ] as Array<[CustomerTab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm ${tab === value ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "general" ? (
        <GeneralForm form={form} setForm={setForm} errors={errors} />
      ) : tab === "branches" ? (
        <BranchesTab customer={initial} items={branches.data ?? []} loading={branches.isPending} />
      ) : tab === "departments" ? (
        <DepartmentsTab
          customer={initial}
          items={departments.data ?? []}
          contacts={contacts.data ?? []}
          loading={departments.isPending}
        />
      ) : tab === "contacts" ? (
        <ContactsTab
          customer={initial}
          contacts={contacts.data ?? []}
          branches={branches.data ?? []}
          departments={departments.data ?? []}
          loading={contacts.isPending && !!initial}
        />
      ) : null}
    </Modal>
  );
}

function GeneralForm({
  form,
  setForm,
  errors,
}: {
  form: CustomerForm;
  setForm: React.Dispatch<React.SetStateAction<CustomerForm>>;
  errors: Record<string, string>;
}) {
  const company = form.personType === "LEGAL";
  const set = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setAddressWithoutNumber = (addressWithoutNumber: boolean) =>
    setForm((current) => ({
      ...current,
      addressWithoutNumber,
      addressNumber: addressWithoutNumber
        ? "SN"
        : current.addressNumber.trim().toUpperCase() === "SN"
          ? ""
          : current.addressNumber,
    }));
  const [loadingPostalCode, setLoadingPostalCode] = React.useState(false);
  const lookupPostalCode = async () => {
    const postalCode = onlyDigits(form.zipCode);
    if (postalCode.length !== 8 || loadingPostalCode) return;
    setLoadingPostalCode(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      if (!response.ok) throw new Error("Não foi possível consultar o CEP.");
      const address = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (address.erro) throw new Error("CEP não encontrado.");
      setForm((current) => ({
        ...current,
        address: address.logradouro ?? current.address,
        neighborhood: address.bairro ?? current.neighborhood,
        city: address.localidade ?? current.city,
        state: address.uf ?? current.state,
        country: "Brasil",
      }));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingPostalCode(false);
    }
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Situação *">
        <StatusSelect value={form.status} onChange={(value) => set("status", value)} />
      </Field>
      <Field label="Tipo da pessoa *">
        <Select
          value={form.personType}
          onChange={(event) => set("personType", event.target.value as PersonType)}
        >
          <option value="LEGAL">Jurídica</option>
          <option value="PHYSICAL">Física</option>
        </Select>
      </Field>
      <Field label="Nome do cliente *" error={errors.name}>
        <Input value={form.name} onChange={(event) => set("name", event.target.value)} />
      </Field>
      {company ? (
        <Field label="Razão Social *">
          <Input
            value={form.legalName}
            onChange={(event) => set("legalName", event.target.value)}
          />
        </Field>
      ) : (
        <Field label="CPF *">
          <Input
            value={maskDocument(form.document, "PHYSICAL")}
            onChange={(event) => set("document", onlyDigits(event.target.value))}
          />
        </Field>
      )}
      {company && (
        <Field label="CNPJ *">
          <Input
            value={maskDocument(form.document, "LEGAL")}
            onChange={(event) => set("document", onlyDigits(event.target.value))}
          />
        </Field>
      )}
      {company && (
        <Field label="Responsável *">
          <Input
            value={form.responsibleContactName}
            onChange={(event) => set("responsibleContactName", event.target.value)}
          />
        </Field>
      )}
      <Field label={company ? "Telefone do responsável *" : "Telefone *"}>
        <div className="flex h-9 overflow-hidden rounded-md border border-input bg-transparent transition-colors focus-within:border-primary">
          <CountryCodeSelect
            value={form.countryCode}
            onChange={(value) => set("countryCode", value)}
            compact
            embedded
          />
          <Input
            type="tel"
            inputMode="tel"
            value={form.countryCode === "55" ? maskBrazilPhone(form.phone) : form.phone}
            onChange={(event) =>
              set(
                "phone",
                form.countryCode === "55"
                  ? event.target.value
                  : onlyDigits(event.target.value).slice(0, 15),
              )
            }
            placeholder={form.countryCode === "55" ? "(00) 00000-0000" : undefined}
            className="!h-9 !min-h-0 rounded-none border-0 !py-0 !pl-0 leading-normal shadow-none focus-visible:ring-0"
          />
        </div>
      </Field>
      <Field label={company ? "E-mail do responsável *" : "E-mail *"} error={errors.email}>
        <Input
          type="email"
          value={form.email}
          onChange={(event) => set("email", event.target.value.toLocaleLowerCase("en-US"))}
          placeholder="email@exemplo.com"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Observações">
          <Textarea
            className="min-h-20"
            value={form.notes}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="Informações adicionais sobre o cliente..."
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold">Endereço</h3>
          <label className="flex items-center gap-2 text-xs text-primary">
            <span>Adicionar endereço completo</span>
            <Switch
              checked={form.fullAddress}
              onCheckedChange={(fullAddress) => set("fullAddress", fullAddress)}
              aria-label="Adicionar endereço completo"
            />
          </label>
        </div>
        {form.fullAddress && (
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Field label="Código Postal (CEP) *">
              <div className="flex gap-2">
                <Input
                  value={form.zipCode}
                  onChange={(event) => set("zipCode", maskZipCode(event.target.value))}
                  onBlur={() => void lookupPostalCode()}
                  placeholder="00000-000"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={onlyDigits(form.zipCode).length !== 8 || loadingPostalCode}
                  onClick={() => void lookupPostalCode()}
                  aria-label="Buscar CEP"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <Field label="Endereço *" error={errors.address}>
              <Input
                value={form.address}
                onChange={(event) => set("address", event.target.value)}
                placeholder="Rua, Avenida, etc..."
              />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <Field label="Número *" error={errors.addressNumber}>
                <Input
                  value={form.addressNumber}
                  disabled={form.addressWithoutNumber}
                  onChange={(event) => set("addressNumber", event.target.value)}
                />
              </Field>
              <div className="shrink-0">
                <span className="relative top-2 mb-1.5 block text-center text-xs font-medium text-muted-foreground">
                  S/N
                </span>
                <div className="flex min-h-10 items-center justify-center">
                  <Switch
                    checked={form.addressWithoutNumber}
                    onCheckedChange={setAddressWithoutNumber}
                    aria-label="Endereço sem número"
                  />
                </div>
              </div>
            </div>
            <Field label="Complemento">
              <Input
                value={form.addressComplement}
                onChange={(event) => set("addressComplement", event.target.value)}
              />
            </Field>
            <Field label="Bairro *">
              <Input
                value={form.neighborhood}
                onChange={(event) => set("neighborhood", event.target.value)}
              />
            </Field>
            <Field label="País *">
              <Input
                value={form.country}
                onChange={(event) => set("country", event.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label="Cidade *" error={errors.city}>
            <Input value={form.city} onChange={(event) => set("city", event.target.value)} />
          </Field>
          <Field label="UF *" error={errors.state}>
            <Select value={form.state} onChange={(event) => set("state", event.target.value)}>
              <option value="">Selecione</option>
              {STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}

const CUSTOMER_ACCESS_PROFILES = [
  { value: "COLLABORATOR", label: "Colaborador" },
  { value: "MANAGER", label: "Gerente" },
  { value: "FULL_ACCESS", label: "Acesso full" },
] as const;

type CustomerAccessProfile = (typeof CUSTOMER_ACCESS_PROFILES)[number]["value"];

type CustomerContactPayload = {
  name: string;
  active: boolean;
  phone: string;
  email: string;
  customerId: string;
  customerBranchId: string | null;
  customerDepartmentId: string | null;
  customerAccessProfile: CustomerAccessProfile;
};

type ContactCustomerTransferDetails = {
  contact: { id: string; name: string };
  currentCustomer: { id: string; name: string };
  targetCustomer: { id: string; name: string };
};

function contactCustomerTransferDetails(error: unknown) {
  if (!(error instanceof TrixusApiError) || error.code !== "CONTACT_CUSTOMER_TRANSFER_REQUIRED") {
    return null;
  }
  const details = error.details as Partial<ContactCustomerTransferDetails> | undefined;
  if (
    !details?.contact?.id ||
    !details.contact.name ||
    !details.currentCustomer?.id ||
    !details.currentCustomer.name ||
    !details.targetCustomer?.id ||
    !details.targetCustomer.name
  ) {
    return null;
  }
  return details as ContactCustomerTransferDetails;
}

function customerAccessProfileLabel(value: ApiContact["customerAccessProfile"]) {
  return CUSTOMER_ACCESS_PROFILES.find((item) => item.value === value)?.label ?? "Colaborador";
}

function ContactsTab({
  customer,
  contacts,
  branches,
  departments,
  loading,
}: {
  customer: TicketCustomer | null;
  contacts: ApiContact[];
  branches: ApiCustomerBranch[];
  departments: ApiCustomerDepartment[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = React.useState<
    { initial: ApiContact | null; mode: "create" | "edit" | "duplicate" } | undefined
  >();
  const [unlinking, setUnlinking] = React.useState<ApiContact | null>(null);
  const [resendingContactId, setResendingContactId] = React.useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["tickets", "customer-contacts", customer?.id] });
  const resendInvite = async (contact: ApiContact) => {
    setResendingContactId(contact.id);
    try {
      const invitation = await ticketApi.inviteCustomerContact(contact.id);
      if (invitation.status === "active") {
        toast.info("O acesso deste contato já está ativo.");
      } else {
        toast.success("Convite reenviado.");
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setResendingContactId(null);
    }
  };
  return (
    <>
      <RelationshipSection
        title="Contatos"
        count={contacts.length}
        actionLabel="Novo"
        disabled={!customer}
        onAdd={() => setFormState({ initial: null, mode: "create" })}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : contacts.length ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_5.5rem_10rem] gap-x-3 bg-surface-1 px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground lg:grid">
              <span>Nome</span>
              <span>Departamento</span>
              <span>Situação</span>
              <span className="text-center">Ações</span>
            </div>
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="grid gap-2 border-t border-border px-3 py-3 first:border-t-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_5.5rem_10rem] lg:items-center lg:gap-x-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{contact.nome}</p>
                  <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                    <p className="flex min-w-0 items-center gap-1">
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {customerAccessProfileLabel(contact.customerAccessProfile)}
                      </span>
                    </p>
                    <p className="flex min-w-0 items-center gap-1">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{contact.telefone}</span>
                    </p>
                    <p className="flex min-w-0 items-center gap-1">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{contact.email ?? "Sem e-mail"}</span>
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {contact.customerDepartment?.name ?? "Sem departamento"} ·{" "}
                  {contact.customerBranch?.name ?? "Sem filial"}
                </p>
                <div className="justify-self-start">
                  <Badge tone={contact.active === false ? "destructive" : "success"}>
                    {contact.active === false ? "Inativo" : "Ativo"}
                  </Badge>
                </div>
                <div className="flex justify-center gap-1">
                  <Action
                    icon={<SendHorizontal />}
                    label={`Reenviar convite para ${contact.nome}`}
                    success
                    disabled={resendingContactId !== null}
                    onClick={() => void resendInvite(contact)}
                  />
                  <Action
                    icon={<Copy />}
                    label={`Duplicar contato ${contact.nome}`}
                    onClick={() =>
                      setFormState({
                        initial: { ...contact, nome: `${contact.nome} - Cópia` },
                        mode: "duplicate",
                      })
                    }
                  />
                  <Action
                    icon={<Pencil />}
                    label={`Editar contato ${contact.nome}`}
                    onClick={() => setFormState({ initial: contact, mode: "edit" })}
                  />
                  <Action
                    icon={<Trash2 />}
                    label={`Desvincular contato ${contact.nome}`}
                    danger
                    onClick={() => setUnlinking(contact)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyRows
            label={
              customer
                ? "Nenhum contato vinculado a este cliente."
                : "Salve o cliente para cadastrar contatos."
            }
          />
        )}
      </RelationshipSection>
      <ContactFormModal
        customer={customer}
        branches={branches}
        departments={departments}
        initial={formState?.initial ?? null}
        forceCreate={formState?.mode === "duplicate"}
        open={formState !== undefined}
        onClose={() => setFormState(undefined)}
        onSaved={async () => {
          await refresh();
          setFormState(undefined);
        }}
      />
      <ConfirmDialog
        open={!!unlinking}
        title="Remover contato?"
        description={
          <>
            O contato{" "}
            <strong className="font-semibold text-foreground">
              {`"${unlinking?.nome ?? "selecionado"}"`}
            </strong>{" "}
            será removido deste cliente, mas continuará disponível no cadastro de contatos.
          </>
        }
        confirmLabel="Remover"
        destructive
        onClose={() => setUnlinking(null)}
        onConfirm={() => {
          if (!unlinking) return;
          void crmApi
            .updateContact(unlinking.id, { customerId: null })
            .then(refresh)
            .then(() => {
              setUnlinking(null);
              toast.success("Contato desvinculado do cliente.");
            })
            .catch((error: Error) => toast.error(error.message));
        }}
      />
    </>
  );
}

function ContactFormModal({
  customer,
  branches,
  departments,
  initial,
  forceCreate = false,
  open,
  onClose,
  onSaved,
}: {
  customer: TicketCustomer | null;
  branches: ApiCustomerBranch[];
  departments: ApiCustomerDepartment[];
  initial: ApiContact | null;
  forceCreate?: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [countryCode, setCountryCode] = React.useState("55");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [profile, setProfile] = React.useState<CustomerAccessProfile>("COLLABORATOR");
  const [branchId, setBranchId] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [pendingTransfer, setPendingTransfer] = React.useState<{
    details: ContactCustomerTransferDetails;
    payload: CustomerContactPayload;
    sendAccess: boolean;
  } | null>(null);
  const isEditing = Boolean(initial) && !forceCreate;
  React.useEffect(() => {
    if (!open) {
      setPendingTransfer(null);
      return;
    }
    const parsedPhone = splitPhoneByCountry(initial?.telefone ?? "");
    setName(initial?.nome ?? "");
    setActive(initial?.active ?? true);
    setCountryCode(parsedPhone.countryCode);
    setPhone(parsedPhone.localPhone);
    setEmail(initial?.email ?? "");
    setProfile(initial?.customerAccessProfile ?? "COLLABORATOR");
    setBranchId(initial?.customerBranchId ?? "");
    setDepartmentId(initial?.customerDepartmentId ?? "");
  }, [initial, open]);

  const completeSave = async (saved: ApiContact, sendAccess: boolean) => {
    if (sendAccess) {
      try {
        await ticketApi.inviteCustomerContact(saved.id);
      } catch (error) {
        toast.error(`Contato salvo, mas o convite não foi enviado: ${(error as Error).message}`);
        await onSaved();
        return;
      }
    }
    toast.success(
      sendAccess
        ? saved.lifecycle === "linked"
          ? "Contato existente vinculado e acesso processado."
          : "Contato salvo e convite enviado."
        : isEditing
          ? "Contato atualizado."
          : "Contato cadastrado.",
    );
    await onSaved();
  };

  const createContact = async (
    payload: CustomerContactPayload,
    sendAccess: boolean,
    transfer?: { expectedCustomerId: string },
  ) => {
    const saved = await crmApi.createContact({
      ...payload,
      linkExistingToCustomer: true,
      confirmCustomerTransfer: Boolean(transfer),
      expectedCustomerId: transfer?.expectedCustomerId,
    });
    await completeSave(saved, sendAccess);
  };

  const save = async (sendAccess: boolean) => {
    if (!customer) return;
    if (!name.trim()) return toast.error("Informe o nome do contato.");
    if (onlyDigits(phone).length < 10) return toast.error("Informe um WhatsApp válido.");
    if (!email.trim() || !isValidEmail(email.trim()))
      return toast.error("Informe um e-mail válido.");
    const payload: CustomerContactPayload = {
      name: name.trim(),
      active,
      phone: formatPhoneForSubmit(phone, countryCode),
      email: email.trim().toLocaleLowerCase("en-US"),
      customerId: customer.id,
      customerBranchId: branchId || null,
      customerDepartmentId: departmentId || null,
      customerAccessProfile: profile,
    };
    setSaving(true);
    try {
      if (isEditing && initial) {
        await completeSave(await crmApi.updateContact(initial.id, payload), sendAccess);
      } else {
        await createContact(payload, sendAccess);
      }
    } catch (error) {
      const details = contactCustomerTransferDetails(error);
      if (details) {
        setPendingTransfer({ details, payload, sendAccess });
        return;
      }
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmTransfer = async () => {
    if (!pendingTransfer) return;
    setSaving(true);
    try {
      await createContact(pendingTransfer.payload, pendingTransfer.sendAccess, {
        expectedCustomerId: pendingTransfer.details.currentCustomer.id,
      });
    } catch (error) {
      const details = contactCustomerTransferDetails(error);
      if (details) {
        setPendingTransfer((current) => (current ? { ...current, details } : current));
        toast.info("O vínculo do contato mudou. Revise a confirmação atualizada.");
      } else {
        toast.error((error as Error).message);
      }
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setPendingTransfer(null);
    onClose();
  };

  const activeStateChanged = isEditing && initial?.active !== active;
  const saveLabel = activeStateChanged
    ? active
      ? "Reativar contato"
      : "Desativar contato"
    : isEditing
      ? "Salvar alterações"
      : active
        ? "Salvar e enviar acesso"
        : "Salvar contato";
  const savingLabel = activeStateChanged
    ? active
      ? "Reativando…"
      : "Desativando…"
    : active && !isEditing
      ? "Salvando e enviando…"
      : "Salvando…";

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title={isEditing ? "Editar Contato" : "Novo Contato"}
        size="md"
        className="sm:max-w-[33.6rem]"
        layerClassName="z-[260]"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
              Cancelar
            </Button>
            <Button
              className="save-action-button"
              onClick={() => void save(!isEditing && active)}
              disabled={saving}
            >
              {saving ? savingLabel : saveLabel}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              id="customer-contact-active"
              checked={active}
              onCheckedChange={setActive}
              aria-label={active ? "Contato ativo" : "Contato inativo"}
            />
            <label htmlFor="customer-contact-active" className="text-sm text-foreground">
              {active ? "Ativo" : "Inativo"}
            </label>
          </div>
          <Field label="Nome *">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="WhatsApp *">
            <div className="flex h-9 overflow-hidden rounded-md border border-input bg-transparent transition-colors focus-within:border-primary">
              <CountryCodeSelect
                value={countryCode}
                onChange={(value) => setCountryCode(value)}
                compact
                embedded
              />
              <Input
                type="tel"
                inputMode="tel"
                value={countryCode === "55" ? maskBrazilPhone(phone) : phone}
                onChange={(event) =>
                  setPhone(
                    countryCode === "55"
                      ? event.target.value
                      : onlyDigits(event.target.value).slice(0, 15),
                  )
                }
                placeholder={countryCode === "55" ? "(00) 00000-0000" : undefined}
                className="!h-9 !min-h-0 rounded-none border-0 !py-0 !pl-0 leading-normal shadow-none focus-visible:ring-0"
              />
            </div>
          </Field>
          <Field label="E-mail *">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value.toLocaleLowerCase("en-US"))}
              placeholder="email@exemplo.com"
            />
          </Field>
          <Field label="Perfil *">
            <Select
              value={profile}
              onChange={(event) => setProfile(event.target.value as CustomerAccessProfile)}
            >
              {CUSTOMER_ACCESS_PROFILES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Filial">
            <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Todas / não definida</option>
              {branches
                .filter((branch) => branch.status === "ACTIVE" || branch.id === branchId)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Departamento">
            <Select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">Todos / não definido</option>
              {departments
                .filter((department) => department.active || department.id === departmentId)
                .map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            O convite permite ao contato ativar o acesso ao portal do cliente.
          </p>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!pendingTransfer}
        title="Transferir contato?"
        description={
          pendingTransfer ? (
            <>
              O contato{" "}
              <strong className="font-semibold text-foreground">
                {`"${pendingTransfer.details.contact.name}"`}
              </strong>{" "}
              já está vinculado ao cliente{" "}
              <strong className="font-semibold text-foreground">
                {`"${pendingTransfer.details.currentCustomer.name}"`}
              </strong>
              . Deseja transferi-lo para{" "}
              <strong className="font-semibold text-foreground">
                {`"${pendingTransfer.details.targetCustomer.name}"`}
              </strong>
              ?
            </>
          ) : null
        }
        confirmLabel="Transferir contato"
        cancelLabel="Cancelar"
        pendingLabel="Transferindo…"
        destructive
        accent="primary"
        layerClassName="z-[280]"
        onClose={() => setPendingTransfer(null)}
        onConfirm={confirmTransfer}
      />
    </>
  );
}
function BranchesTab({
  customer,
  items,
  loading,
}: {
  customer: TicketCustomer | null;
  items: ApiCustomerBranch[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<ApiCustomerBranch | null | undefined>();
  const [forceCreate, setForceCreate] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ApiCustomerBranch | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["tickets", "customer-branches", customer?.id] });
  const duplicate = (item: ApiCustomerBranch) => {
    setForceCreate(true);
    setEditing({ ...item, name: `${item.name} - Cópia` });
  };
  return (
    <>
      <RelationshipSection
        title="Filiais"
        count={items.length}
        actionLabel="Nova"
        disabled={!customer}
        onAdd={() => {
          setForceCreate(false);
          setEditing(null);
        }}
      >
        {loading && customer ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : items.length ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem] bg-surface-1 px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground sm:grid">
              <span>Filial</span>
              <span>Situação</span>
              <span className="text-center">Ações</span>
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 border-t border-border px-3 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_7rem_8rem] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {[item.city, item.state].filter(Boolean).join(" - ") || "-"}
                    </span>
                  </p>
                </div>
                <div className="justify-self-start">
                  <Badge tone={item.status === "ACTIVE" ? "success" : "destructive"}>
                    {item.status === "ACTIVE" ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
                <div className="flex justify-center gap-1">
                  <Action icon={<Copy />} label="Duplicar filial" onClick={() => duplicate(item)} />
                  <Action
                    icon={<Pencil />}
                    label="Editar filial"
                    onClick={() => {
                      setForceCreate(false);
                      setEditing(item);
                    }}
                  />
                  <Action
                    icon={<Trash2 />}
                    label="Excluir filial"
                    danger
                    onClick={() => setDeleting(item)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyRows
            label={
              customer ? "Nenhuma filial cadastrada." : "Salve o cliente para cadastrar filiais."
            }
          />
        )}
      </RelationshipSection>
      <BranchFormModal
        customer={customer}
        initial={editing ?? null}
        forceCreate={forceCreate}
        open={editing !== undefined}
        onClose={() => {
          setEditing(undefined);
          setForceCreate(false);
        }}
        onSaved={async () => {
          await refresh();
          setEditing(undefined);
          setForceCreate(false);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Excluir filial?"
        description={
          <>
            Deseja realmente excluir a filial{" "}
            <strong className="font-semibold text-foreground">
              {`"${deleting?.name ?? "selecionada"}"`}
            </strong>
            ?
          </>
        }
        destructive
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!customer || !deleting) return;
          void crmApi
            .deleteCustomerBranch(customer.id, deleting.id)
            .then(refresh)
            .then(() => toast.success("Filial excluída."))
            .catch((error: Error) => toast.error(error.message));
        }}
      />
    </>
  );
}

function BranchFormModal({
  customer,
  initial,
  forceCreate = false,
  open,
  onClose,
  onSaved,
}: {
  customer: TicketCustomer | null;
  initial: ApiCustomerBranch | null;
  forceCreate?: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [status, setStatus] = React.useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const isEditing = Boolean(initial) && !forceCreate;
  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setCity(initial?.city ?? "");
      setState(initial?.state ?? "");
      setStatus(initial?.status ?? "ACTIVE");
    }
  }, [initial, open]);
  const save = async () => {
    if (!customer || !name.trim()) return toast.error("Informe o nome da filial.");
    try {
      const payload = {
        name: name.trim(),
        city: city.trim() || null,
        state: state || null,
        status,
      };
      if (isEditing && initial) await crmApi.updateCustomerBranch(customer.id, initial.id, payload);
      else await crmApi.createCustomerBranch(customer.id, payload);
      toast.success(isEditing ? "Filial atualizada." : "Filial cadastrada.");
      await onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar Filial" : "Nova Filial"}
      size="sm"
      layerClassName="z-[260]"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="save-action-button" onClick={() => void save()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="customer-branch-active"
            checked={status === "ACTIVE"}
            onCheckedChange={(checked) => setStatus(checked ? "ACTIVE" : "INACTIVE")}
            aria-label={status === "ACTIVE" ? "Filial ativa" : "Filial inativa"}
          />
          <label htmlFor="customer-branch-active" className="text-sm text-foreground">
            {status === "ACTIVE" ? "Ativa" : "Inativa"}
          </label>
        </div>
        <Field label="Nome da filial *">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
          <Field label="Cidade">
            <Input value={city} onChange={(event) => setCity(event.target.value)} />
          </Field>
          <Field label="UF">
            <Select value={state} onChange={(event) => setState(event.target.value)}>
              <option value="">-</option>
              {STATES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
function DepartmentsTab({
  customer,
  items,
  contacts,
  loading,
}: {
  customer: TicketCustomer | null;
  items: ApiCustomerDepartment[];
  contacts: ApiContact[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<ApiCustomerDepartment | null | undefined>();
  const [forceCreate, setForceCreate] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ApiCustomerDepartment | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["tickets", "customer-departments", customer?.id] });
  const duplicate = (item: ApiCustomerDepartment) => {
    setForceCreate(true);
    setEditing({ ...item, name: `${item.name} - Cópia` });
  };
  return (
    <>
      <RelationshipSection
        title="Departamentos"
        count={items.length}
        actionLabel="Novo"
        disabled={!customer}
        onAdd={() => {
          setForceCreate(false);
          setEditing(null);
        }}
      >
        {loading && customer ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : items.length ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_8rem] bg-surface-1 px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground sm:grid">
              <span>Departamento</span>
              <span>Gestor</span>
              <span>Situação</span>
              <span className="text-center">Ações</span>
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 border-t border-border px-3 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_8rem] sm:items-center"
              >
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="sm:hidden">Gestor: </span>
                  {item.managerContact?.name ?? item.manager?.name ?? "Sem gestor"}
                </p>
                <div className="justify-self-start">
                  <Badge tone={item.active ? "success" : "destructive"}>
                    {item.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex justify-center gap-1">
                  <Action
                    icon={<Copy />}
                    label="Duplicar departamento"
                    onClick={() => duplicate(item)}
                  />
                  <Action
                    icon={<Pencil />}
                    label="Editar departamento"
                    onClick={() => {
                      setForceCreate(false);
                      setEditing(item);
                    }}
                  />
                  <Action
                    icon={<Trash2 />}
                    label="Excluir departamento"
                    danger
                    onClick={() => setDeleting(item)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyRows
            label={
              customer
                ? "Nenhum departamento cadastrado."
                : "Salve o cliente para cadastrar departamentos."
            }
          />
        )}
      </RelationshipSection>
      <DepartmentFormModal
        customer={customer}
        contacts={contacts}
        initial={editing ?? null}
        forceCreate={forceCreate}
        open={editing !== undefined}
        onClose={() => {
          setEditing(undefined);
          setForceCreate(false);
        }}
        onSaved={async () => {
          await refresh();
          setEditing(undefined);
          setForceCreate(false);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Excluir departamento?"
        description={
          <>
            Deseja realmente excluir o departamento{" "}
            <strong className="font-semibold text-foreground">
              {`"${deleting?.name ?? "selecionado"}"`}
            </strong>
            ?
          </>
        }
        destructive
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!customer || !deleting) return;
          void crmApi
            .deleteCustomerDepartment(customer.id, deleting.id)
            .then(refresh)
            .then(() => toast.success("Departamento excluído."))
            .catch((error: Error) => toast.error(error.message));
        }}
      />
    </>
  );
}

function DepartmentFormModal({
  customer,
  contacts,
  initial,
  forceCreate = false,
  open,
  onClose,
  onSaved,
}: {
  customer: TicketCustomer | null;
  contacts: ApiContact[];
  initial: ApiCustomerDepartment | null;
  forceCreate?: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [managerContactId, setManagerContactId] = React.useState("");
  const [active, setActive] = React.useState(true);
  const isEditing = Boolean(initial) && !forceCreate;
  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setManagerContactId(initial?.managerContactId ?? "");
      setActive(initial?.active ?? true);
    }
  }, [initial, open]);
  const save = async () => {
    if (!customer || !name.trim()) return toast.error("Informe o nome do departamento.");
    if (!managerContactId) return toast.error("Selecione o gestor do departamento.");
    try {
      const payload = { name: name.trim(), managerContactId, active };
      if (isEditing && initial)
        await crmApi.updateCustomerDepartment(customer.id, initial.id, payload);
      else await crmApi.createCustomerDepartment(customer.id, payload);
      toast.success(isEditing ? "Departamento atualizado." : "Departamento cadastrado.");
      await onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar Departamento" : "Novo Departamento"}
      size="sm"
      layerClassName="z-[260]"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="save-action-button" onClick={() => void save()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="customer-department-active"
            checked={active}
            onCheckedChange={setActive}
            aria-label={active ? "Departamento ativo" : "Departamento inativo"}
          />
          <label htmlFor="customer-department-active" className="cursor-pointer text-sm">
            {active ? "Ativo" : "Inativo"}
          </label>
        </div>
        <Field label="Departamento *">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Gestor *">
          <Select
            value={managerContactId}
            onChange={(event) => setManagerContactId(event.target.value)}
          >
            <option value="">Selecione</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.nome}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function RelationshipSection({
  title,
  count,
  actionLabel,
  disabled = false,
  onAdd,
  children,
}: {
  title: string;
  count: number;
  actionLabel: string;
  disabled?: boolean;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">
            {count} {count === 1 ? "registro cadastrado" : "registros cadastrados"}.
          </p>
        </div>
        <Button
          size="sm"
          disabled={disabled}
          onClick={onAdd}
          title={
            disabled
              ? onAdd
                ? "Salve o cliente primeiro"
                : "Disponível após a integração do fluxo de convite"
              : undefined
          }
        >
          <Plus className="h-4 w-4" /> {actionLabel}
        </Button>
      </div>
      {children}
    </section>
  );
}
function EmptyRows({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function CustomerViewModal({
  customer,
  onClose,
}: {
  customer: TicketCustomer | null;
  onClose: () => void;
}) {
  if (!customer) return null;
  const rows = [
    ["Situação", <CustomerStatusBadge key="status" status={customerStatus(customer)} />],
    ["Tipo de pessoa", customerPersonType(customer) === "LEGAL" ? "Jurídica" : "Física"],
    ["Nome do cliente", customer.nome],
    [customerPersonType(customer) === "LEGAL" ? "CNPJ" : "CPF", customerDocument(customer)],
    ["Telefone", customer.telefone ? formatPhoneForDisplay(customer.telefone) : "-"],
    ["E-mail", customer.email || "-"],
    ["Observações", customer.notas || "-"],
  ];
  const address = [
    ["Endereço", customer.street || "-"],
    ["Número", customer.addressWithoutNumber ? "S/N" : customer.addressNumber || "-"],
    ["Complemento", customer.complement || "-"],
    ["Bairro", customer.neighborhood || "-"],
    ["Cidade", customer.city || "-"],
    ["UF", customer.state || "-"],
    ["CEP", customer.postalCode || "-"],
    ["País", customer.country || "Brasil"],
  ];
  return (
    <Modal open onClose={onClose} title="Visualizar Cliente" size="lg">
      <ReadonlySection title="Dados gerais" rows={rows} />
      <ReadonlySection title="Endereço" rows={address} />
      <Audit customer={customer} />
    </Modal>
  );
}
function ReadonlySection({ title, rows }: { title: string; rows: Array<Array<React.ReactNode>> }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {rows.map(([label, value], index) => (
        <div
          key={index}
          className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 border-b border-border/70 py-2.5 text-sm"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{value}</span>
        </div>
      ))}
    </section>
  );
}
function Audit({ customer }: { customer: TicketCustomer | null }) {
  return (
    <div className="text-[11px] text-muted-foreground">
      <p>
        <strong className="text-foreground">Criado:</strong>{" "}
        {customer?.createdAt ? new Date(customer.createdAt).toLocaleString("pt-BR") : "---"}
      </p>
      <p>
        <strong className="text-foreground">Editado:</strong>{" "}
        {customer?.updatedAt ? new Date(customer.updatedAt).toLocaleString("pt-BR") : "---"}
      </p>
    </div>
  );
}
function StatusSelect({
  value,
  onChange,
}: {
  value: CustomerStatus;
  onChange: (value: CustomerStatus) => void;
}) {
  return (
    <InstanceFilterSelect
      value={value}
      onChange={(nextValue) => onChange(nextValue as CustomerStatus)}
      options={STATUS_OPTIONS}
      showAllOption={false}
      allLabel="Selecione"
    />
  );
}
function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const option = STATUS_OPTIONS.find((item) => item.value === status) ?? STATUS_OPTIONS[3];
  return <Badge tone={option.tone}>{option.label}</Badge>;
}
function customerStatus(customer: TicketCustomer): CustomerStatus {
  return customer.status ?? "ACTIVE";
}
function customerPersonType(customer: TicketCustomer): PersonType {
  return (
    customer.personType ??
    (onlyDigits(customer.document ?? "").length === 11 ? "PHYSICAL" : "LEGAL")
  );
}
function customerDocument(customer: TicketCustomer) {
  const document = onlyDigits(customer.document ?? "");
  return document ? maskDocument(document, customerPersonType(customer)) : "-";
}
function customerLocation(customer: TicketCustomer) {
  return customer.city && customer.state
    ? `${customer.city} - ${customer.state}`
    : customer.city || customer.state || "-";
}
function formatCustomerRegistrationDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
function maskDocument(value: string, type: PersonType) {
  const digits = onlyDigits(value);
  return type === "LEGAL"
    ? maskCnpj(digits)
    : digits
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskZipCode(value: string) {
  return onlyDigits(value)
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}
function formFromCustomer(customer: TicketCustomer): CustomerForm {
  const parsedPhone = splitPhoneByCountry(customer.telefone ?? "");
  return {
    ...EMPTY_FORM,
    name: customer.nome,
    personType: customerPersonType(customer),
    status: customerStatus(customer),
    document: customer.document ?? "",
    legalName: customer.legalName ?? "",
    responsibleContactName: customer.contato_responsavel ?? "",
    countryCode: parsedPhone.countryCode,
    phone: parsedPhone.localPhone,
    email: customer.email ?? "",
    notes: customer.notas ?? "",
    fullAddress: customer.addressFullEnabled ?? !!(customer.postalCode || customer.street),
    zipCode: customer.postalCode ?? "",
    address: customer.street ?? "",
    addressNumber: customer.addressWithoutNumber ? "SN" : (customer.addressNumber ?? ""),
    addressWithoutNumber: customer.addressWithoutNumber ?? false,
    addressComplement: customer.complement ?? "",
    neighborhood: customer.neighborhood ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    country: customer.country ?? "Brasil",
  };
}
function customerPayload(form: CustomerForm): Parameters<typeof crmApi.createCustomer>[0] {
  return {
    name: form.name.trim(),
    email: form.email.trim() || null,
    phone: form.phone.trim() ? formatPhoneForSubmit(form.phone, form.countryCode) : null,
    notes: form.notes.trim() || null,
    responsibleContactName: form.responsibleContactName.trim() || null,
    color: "#3B82F6",
    personType: form.personType,
    status: form.status,
    document: onlyDigits(form.document) || null,
    legalName: form.legalName.trim() || null,
    city: form.city.trim(),
    state: form.state,
    addressFullEnabled: form.fullAddress,
    postalCode: onlyDigits(form.zipCode) || null,
    street: form.address.trim() || null,
    addressNumber: form.addressNumber.trim() || null,
    addressWithoutNumber: form.addressWithoutNumber,
    complement: form.addressComplement.trim() || null,
    neighborhood: form.neighborhood.trim() || null,
    country: form.country.trim() || "Brasil",
  } as Parameters<typeof crmApi.createCustomer>[0];
}
