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
import { InfoTooltip } from "@/components/info-tooltip";
import {
  CityAutocomplete,
  InternationalLocationFields,
} from "@/components/international-location-fields";
import type { InternationalLocationValue } from "@/components/international-location-value";
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
import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields";
import {
  ContactFormModal as ContactRegistryFormModal,
  CountryCodeSelect,
  contactPayload,
} from "@/routes/contatos";
import {
  crmApi,
  locationApi,
  ticketApi,
  TrixusApiError,
  type ApiContact,
  type ApiCustomer,
  type ApiCustomerBranch,
  type ApiCustomerDepartment,
  type ApiCustomerPortalUser,
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
  cityId: string;
  addressCountryCode: string;
  addressDivisionId: string;
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
  { value: "PROSPECT", label: "Prospect", tone: "info", color: "var(--color-info)" },
  { value: "SUSPENDED", label: "Suspenso", tone: "warning", color: "var(--color-warning)" },
  {
    value: "CANCELLED",
    label: "Cancelado",
    tone: "destructive",
    color: "var(--color-destructive)",
  },
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
  cityId: "",
  addressCountryCode: "BR",
  addressDivisionId: "",
  city: "",
  state: "",
  country: "Brasil",
};

const REQUIRED_CUSTOMER_FIELDS = [
  ["name", "Nome do cliente"],
  ["legalName", "Razão Social"],
  ["responsibleContactName", "Responsável"],
  ["phone", "Telefone do responsável"],
  ["email", "E-mail do responsável"],
  ["zipCode", "Código Postal (CEP)"],
  ["address", "Endereço"],
  ["addressNumber", "Número"],
  ["neighborhood", "Bairro"],
  ["city", "Cidade"],
] as const;

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
          <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
            <div className="col-span-2 lg:col-span-1">
              <Field label="Busca">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar por nome, CNPJ, CPF ou responsável..."
                />
              </Field>
            </div>
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
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
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
  const portalUsers = useQuery({
    queryKey: ["tickets", "customer-portal-users", initial?.id],
    queryFn: () => ticketApi.listCustomerPortalUsers(initial!.id),
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
  React.useEffect(() => {
    const satisfiedErrors = new Set<string>();
    const isProspect = form.status === "PROSPECT";
    if (form.name.trim().length >= 2) satisfiedErrors.add("name");
    if (isProspect || form.personType !== "LEGAL" || form.legalName.trim())
      satisfiedErrors.add("legalName");
    if (isProspect || form.personType !== "LEGAL" || form.responsibleContactName.trim())
      satisfiedErrors.add("responsibleContactName");
    if (onlyDigits(form.phone)) satisfiedErrors.add("phone");
    if (isProspect || isValidEmail(form.email)) satisfiedErrors.add("email");
    if (form.city.trim() && (initial || form.cityId)) satisfiedErrors.add("city");
    if (!form.fullAddress || onlyDigits(form.zipCode).length === 8) satisfiedErrors.add("zipCode");
    if (!form.fullAddress || form.address.trim()) satisfiedErrors.add("address");
    if (!form.fullAddress || form.addressWithoutNumber || form.addressNumber.trim())
      satisfiedErrors.add("addressNumber");
    if (!form.fullAddress || form.neighborhood.trim()) satisfiedErrors.add("neighborhood");

    setErrors((current) => {
      const keysToClear = [...satisfiedErrors].filter((key) => current[key]);
      if (!keysToClear.length) return current;
      const next = { ...current };
      keysToClear.forEach((key) => delete next[key]);
      return next;
    });
  }, [form, initial]);
  const save = async () => {
    const nextErrors: Record<string, string> = {};
    const isProspect = form.status === "PROSPECT";
    if (form.name.trim().length < 2) nextErrors.name = "Informe o nome do cliente.";
    if (!isProspect && form.personType === "LEGAL" && !form.legalName.trim())
      nextErrors.legalName = "Informe a razão social.";
    if (!isProspect && form.personType === "LEGAL" && !form.responsibleContactName.trim())
      nextErrors.responsibleContactName = "Informe o responsável.";
    if (!onlyDigits(form.phone)) nextErrors.phone = "Informe o telefone.";
    if (!isProspect && !form.email.trim()) nextErrors.email = "Informe o e-mail.";
    else if (form.email.trim() && !isValidEmail(form.email))
      nextErrors.email = "Informe um e-mail válido.";
    if (!form.city.trim()) nextErrors.city = "Informe a cidade.";
    if (!initial && !form.cityId) nextErrors.city = "Selecione uma cidade da lista.";
    if (form.fullAddress && onlyDigits(form.zipCode).length !== 8)
      nextErrors.zipCode = "Informe um CEP válido.";
    if (form.fullAddress && !form.address.trim()) nextErrors.address = "Informe o endereço.";
    if (form.fullAddress && !form.addressWithoutNumber && !form.addressNumber.trim())
      nextErrors.addressNumber = "Informe o número.";
    if (form.fullAddress && !form.neighborhood.trim())
      nextErrors.neighborhood = "Informe o bairro.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setTab("general");
      const pendingFields = REQUIRED_CUSTOMER_FIELDS.filter(([key]) => nextErrors[key]).map(
        ([, label]) => label,
      );
      showRequiredFieldsToast(pendingFields);
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
          loading={departments.isPending}
        />
      ) : tab === "contacts" ? (
        <ContactsTab
          customer={initial}
          users={portalUsers.data ?? []}
          branches={branches.data ?? []}
          departments={departments.data ?? []}
          loading={portalUsers.isPending && !!initial}
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
  const isProspect = form.status === "PROSPECT";
  const validationBorder = (key: string) => requiredFieldClassName(Boolean(errors[key]));
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
  const locationValue: InternationalLocationValue = {
    cityId: form.cityId,
    city: form.city,
    divisionId: form.addressDivisionId,
    state: form.state,
    countryCode: form.addressCountryCode,
    country: form.country,
  };
  const setLocation = (location: InternationalLocationValue) =>
    setForm((current) => ({
      ...current,
      cityId: location.cityId,
      city: location.city,
      addressDivisionId: location.divisionId,
      state: location.state,
      addressCountryCode: location.countryCode,
      country: location.country,
    }));
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
      let canonicalLocation: InternationalLocationValue | null = null;
      if (address.localidade && address.uf) {
        const result = await locationApi.cities({
          q: address.localidade,
          countryCode: "BR",
          page: 1,
          pageSize: 20,
        });
        const city = result.items.find(
          (item) =>
            normalizeLocationName(item.name) === normalizeLocationName(address.localidade ?? "") &&
            item.divisionCode?.toUpperCase() === address.uf?.toUpperCase(),
        );
        if (city) {
          canonicalLocation = {
            cityId: city.id,
            city: city.name,
            divisionId: city.divisionId ?? "",
            state: city.divisionCode || city.divisionName || address.uf,
            countryCode: city.countryCode,
            country: city.countryName,
          };
        }
      }
      setForm((current) => ({
        ...current,
        address: address.logradouro ?? current.address,
        neighborhood: address.bairro ?? current.neighborhood,
        cityId: canonicalLocation?.cityId ?? "",
        city: canonicalLocation?.city ?? address.localidade ?? current.city,
        addressDivisionId: canonicalLocation?.divisionId ?? "",
        state: canonicalLocation?.state ?? address.uf ?? current.state,
        addressCountryCode: "BR",
        country: canonicalLocation?.country ?? "Brasil",
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
      <Field label="Nome do cliente *">
        <Input
          value={form.name}
          aria-invalid={Boolean(errors.name)}
          className={validationBorder("name")}
          onChange={(event) => set("name", event.target.value)}
        />
      </Field>
      {company ? (
        <Field label={`Razão Social${isProspect ? "" : " *"}`}>
          <Input
            value={form.legalName}
            aria-invalid={Boolean(errors.legalName)}
            className={validationBorder("legalName")}
            onChange={(event) => set("legalName", event.target.value)}
          />
        </Field>
      ) : (
        <Field label="CPF">
          <Input
            value={maskDocument(form.document, "PHYSICAL")}
            onChange={(event) => set("document", onlyDigits(event.target.value))}
          />
        </Field>
      )}
      {company && (
        <Field label="CNPJ">
          <Input
            value={maskDocument(form.document, "LEGAL")}
            onChange={(event) => set("document", onlyDigits(event.target.value))}
          />
        </Field>
      )}
      {company && (
        <Field label={`Responsável${isProspect ? "" : " *"}`}>
          <Input
            value={form.responsibleContactName}
            aria-invalid={Boolean(errors.responsibleContactName)}
            className={validationBorder("responsibleContactName")}
            onChange={(event) => set("responsibleContactName", event.target.value)}
          />
        </Field>
      )}
      <Field label={company ? "Telefone do responsável *" : "Telefone *"}>
        <div
          className={`flex h-9 overflow-hidden rounded-md border bg-transparent transition-colors ${errors.phone ? "border-destructive focus-within:border-destructive" : "border-input focus-within:border-primary"}`}
        >
          <CountryCodeSelect
            value={form.countryCode}
            onChange={(value) => set("countryCode", value)}
            compact
            embedded
          />
          <Input
            type="tel"
            inputMode="tel"
            aria-invalid={Boolean(errors.phone)}
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
      <Field
        label={
          company
            ? `E-mail do responsável${isProspect ? "" : " *"}`
            : `E-mail${isProspect ? "" : " *"}`
        }
      >
        <Input
          type="email"
          value={form.email}
          aria-invalid={Boolean(errors.email)}
          className={validationBorder("email")}
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
          <div className="mb-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(8.5rem,0.6fr)_minmax(0,2.1fr)_minmax(8rem,0.3fr)]">
              <Field label="Código Postal (CEP) *">
                <div className="relative">
                  <Input
                    value={maskZipCode(form.zipCode)}
                    aria-invalid={Boolean(errors.zipCode)}
                    onChange={(event) => set("zipCode", maskZipCode(event.target.value))}
                    onBlur={() => void lookupPostalCode()}
                    placeholder="00000-000"
                    className={`pl-10 ${validationBorder("zipCode")}`}
                  />
                  <button
                    type="button"
                    disabled={onlyDigits(form.zipCode).length !== 8 || loadingPostalCode}
                    onClick={() => void lookupPostalCode()}
                    aria-label="Buscar CEP"
                    className="absolute inset-y-0 left-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </Field>
              <Field label="Endereço *">
                <Input
                  value={form.address}
                  aria-invalid={Boolean(errors.address)}
                  className={validationBorder("address")}
                  onChange={(event) => set("address", event.target.value)}
                  placeholder="Rua, Avenida, etc..."
                />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <Field label="Número *">
                  <Input
                    value={form.addressNumber}
                    disabled={form.addressWithoutNumber}
                    aria-invalid={Boolean(errors.addressNumber)}
                    className={validationBorder("addressNumber")}
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
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Complemento">
                <Input
                  value={form.addressComplement}
                  onChange={(event) => set("addressComplement", event.target.value)}
                />
              </Field>
              <Field label="Bairro *">
                <Input
                  value={form.neighborhood}
                  aria-invalid={Boolean(errors.neighborhood)}
                  className={validationBorder("neighborhood")}
                  onChange={(event) => set("neighborhood", event.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
        <InternationalLocationFields
          value={locationValue}
          onChange={setLocation}
          cityError={errors.city}
          cityResultsPlacement="top"
          lockDivisionAndCountry
          divisionCodeOnly
          errorPresentation="border"
          className="grid gap-4 sm:grid-cols-[minmax(0,2.8225fr)_minmax(5rem,0.2625fr)_minmax(10.2rem,0.765fr)]"
        />
      </div>
    </div>
  );
}

const CUSTOMER_ACCESS_PROFILES = [
  { value: "FULL_ACCESS", label: "Acesso Full" },
  { value: "MANAGER", label: "Gerente" },
  { value: "COLLABORATOR", label: "Colaborador" },
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

function PortalLoginField({
  id,
  value,
  disabled = false,
  autoFocus = false,
  invalid = false,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <label htmlFor={id}>
          Login <span className="text-destructive">*</span>
        </label>
        <InfoTooltip label="Login">
          O e-mail é sugerido automaticamente. Você pode substituí-lo por um login como
          nome.sobrenome.
        </InfoTooltip>
      </div>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value.toLocaleLowerCase("en-US"))}
        placeholder="email@exemplo.com ou nome.sobrenome"
        autoComplete="off"
        autoFocus={autoFocus}
      />
    </div>
  );
}

function ContactsTab({
  customer,
  users,
  branches,
  departments,
  loading,
}: {
  customer: TicketCustomer | null;
  users: ApiCustomerPortalUser[];
  branches: ApiCustomerBranch[];
  departments: ApiCustomerDepartment[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [newContactOpen, setNewContactOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [resultsOpen, setResultsOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<ApiContact | null>(null);
  const [login, setLogin] = React.useState("");
  const [profile, setProfile] = React.useState<CustomerAccessProfile>("COLLABORATOR");
  const [departmentId, setDepartmentId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [linkValidationVisible, setLinkValidationVisible] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiCustomerPortalUser | null>(null);
  const [editingContactDetails, setEditingContactDetails] = React.useState<ApiContact | null>(null);
  const [loadingContactDetails, setLoadingContactDetails] = React.useState(false);
  const [editLogin, setEditLogin] = React.useState("");
  const [editProfile, setEditProfile] = React.useState<CustomerAccessProfile>("COLLABORATOR");
  const [editDepartmentId, setEditDepartmentId] = React.useState("");
  const [editBranchId, setEditBranchId] = React.useState("");
  const [editActive, setEditActive] = React.useState(false);
  const [editValidationVisible, setEditValidationVisible] = React.useState(false);
  const [updatingLogin, setUpdatingLogin] = React.useState(false);
  const [revoking, setRevoking] = React.useState<ApiCustomerPortalUser | null>(null);
  const candidates = useQuery({
    queryKey: ["crm", "portal-contact-candidates", query],
    queryFn: () => crmApi.listContacts({ q: query.trim() || undefined, page: 1, pageSize: 50 }),
    enabled: linkOpen && resultsOpen && query.trim().length >= 1,
  });
  const contactOptions = useQuery({
    queryKey: ["crm", "contact-options", "customer-portal"],
    queryFn: () => crmApi.contactOptions(),
    enabled: newContactOpen,
  });
  const activeBranches = React.useMemo(
    () => branches.filter((branch) => branch.status === "ACTIVE"),
    [branches],
  );
  const activeDepartments = React.useMemo(
    () => departments.filter((department) => department.active),
    [departments],
  );
  React.useEffect(() => {
    if (linkOpen && !branchId && activeBranches.length === 1) {
      setBranchId(activeBranches[0].id);
    }
  }, [activeBranches, branchId, linkOpen]);
  React.useEffect(() => {
    if (linkOpen && profile !== "FULL_ACCESS" && !departmentId && activeDepartments.length === 1) {
      setDepartmentId(activeDepartments[0].id);
    }
  }, [activeDepartments, departmentId, linkOpen, profile]);
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["tickets", "customer-portal-users", customer?.id],
    });
  };
  const closeLink = () => {
    setLinkOpen(false);
    setQuery("");
    setResultsOpen(false);
    setSelected(null);
    setLogin("");
    setProfile("COLLABORATOR");
    setDepartmentId("");
    setBranchId("");
    setLinkValidationVisible(false);
  };
  const choose = (contact: ApiContact) => {
    setSelected(contact);
    setQuery(contact.nome);
    setResultsOpen(false);
    setLogin(contact.email?.trim().toLocaleLowerCase("en-US") ?? "");
    setProfile("COLLABORATOR");
    setDepartmentId(activeDepartments.length === 1 ? activeDepartments[0].id : "");
    setBranchId(activeBranches.length === 1 ? activeBranches[0].id : "");
    setLinkValidationVisible(false);
  };
  const link = async (
    contact: ApiContact,
    requestedLogin: string,
    accessProfile: CustomerAccessProfile,
    requestedDepartmentId: string,
    requestedBranchId: string,
  ) => {
    if (!customer) return;
    const invitation = await ticketApi.linkCustomerPortalUser(customer.id, {
      contactId: contact.id,
      login: requestedLogin,
      accessProfile,
      customerDepartmentId: accessProfile === "FULL_ACCESS" ? null : requestedDepartmentId,
      customerBranchId: requestedBranchId,
    });
    await refresh();
    return invitation;
  };
  const submitLink = async () => {
    setLinkValidationVisible(true);
    const pendingFields = [
      ...(!selected ? ["Contato"] : []),
      ...(login.trim().length < 3 ? ["Login"] : []),
      ...(!branchId ? ["Filial"] : []),
      ...(!profile ? ["Perfil de acesso"] : []),
      ...(profile !== "FULL_ACCESS" && !departmentId ? ["Departamento"] : []),
    ];
    if (pendingFields.length) {
      showRequiredFieldsToast(pendingFields);
      return;
    }
    setSaving(true);
    try {
      const invitation = await link(
        selected!,
        login.trim().toLocaleLowerCase("en-US"),
        profile,
        departmentId,
        branchId,
      );
      if (invitation?.delivery?.provider === "whatsapp" && invitation.delivery.queued) {
        toast.success("Contato vinculado e acesso encaminhado pelo WhatsApp.");
      } else if (invitation?.delivery?.delivered === false) {
        toast.info("Contato vinculado. O envio por e-mail está desativado neste ambiente.");
      } else {
        toast.success("Contato vinculado e convite de acesso enviado.");
      }
      closeLink();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const closeEdit = () => {
    setEditingContactDetails(null);
    setEditing(null);
    setEditLogin("");
    setEditProfile("COLLABORATOR");
    setEditDepartmentId("");
    setEditBranchId("");
    setEditActive(false);
    setEditValidationVisible(false);
  };
  const openLinkedContactEditor = async () => {
    if (!editing) return;
    setLoadingContactDetails(true);
    try {
      const [contact, options] = await Promise.all([
        crmApi.getContact(editing.contact.id),
        contactOptions.refetch(),
      ]);
      if (options.error) throw options.error;
      setEditingContactDetails(contact);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingContactDetails(false);
    }
  };
  const submitAccessUpdate = async () => {
    setEditValidationVisible(true);
    if (!customer || !editing) return;
    const pendingFields = [
      ...(editLogin.trim().length < 3 ? ["Login"] : []),
      ...(!editBranchId ? ["Filial"] : []),
      ...(!editProfile ? ["Perfil de acesso"] : []),
      ...(editProfile !== "FULL_ACCESS" && !editDepartmentId ? ["Departamento"] : []),
    ];
    if (pendingFields.length) {
      showRequiredFieldsToast(pendingFields);
      return;
    }
    setUpdatingLogin(true);
    try {
      const updatedAccess = await ticketApi.updateCustomerPortalUser(
        customer.id,
        editing.contact.id,
        {
          login: editLogin.trim().toLocaleLowerCase("en-US"),
          active: editActive,
          accessProfile: editProfile,
          customerDepartmentId: editProfile === "FULL_ACCESS" ? null : editDepartmentId,
          customerBranchId: editBranchId,
        },
      );
      await refresh();
      closeEdit();
      if (!editActive) toast.success("Acesso ao portal desativado.");
      else if (updatedAccess.delivery || updatedAccess.deliveries)
        toast.success("Acesso ativado e credenciais reenviadas.");
      else toast.success("Acesso do contato atualizado.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdatingLogin(false);
    }
  };
  const status = (value: ApiCustomerPortalUser["accessStatus"]) => {
    if (value === "ACTIVE") return { label: "Ativo", tone: "success" as const };
    if (value === "PENDING") return { label: "Link enviado", tone: "warning" as const };
    if (value === "EXPIRED") return { label: "Link expirado", tone: "destructive" as const };
    return { label: "Inativo", tone: "destructive" as const };
  };
  return (
    <>
      <RelationshipSection
        title="Contatos"
        count={users.length}
        actionLabel="Novo"
        disabled={!customer}
        onAdd={() => setLinkOpen(true)}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : users.length ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_8rem_10rem] gap-x-3 bg-surface-1 px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground lg:grid">
              <span>Nome</span>
              <span>Login</span>
              <span>Situação</span>
              <span className="text-center">Ações</span>
            </div>
            {users.map((user) => {
              const accessStatus = status(user.accessStatus);
              return (
                <div
                  key={user.contact.id}
                  className="grid gap-2 border-t border-border px-3 py-3 first:border-t-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_8rem_10rem] lg:items-center lg:gap-x-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.contact.name}</p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {[user.branch?.name, user.department?.name].filter(Boolean).join(" · ") ||
                          "Sem filial definida"}
                      </span>
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-muted-foreground">{user.login}</p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {customerAccessProfileLabel(user.accessProfile)}
                      </span>
                    </p>
                  </div>
                  <div className="whitespace-nowrap">
                    <Badge tone={accessStatus.tone}>{accessStatus.label}</Badge>
                  </div>
                  <div className="flex justify-center gap-1">
                    {user.accessStatus !== "ACTIVE" && (
                      <Action
                        icon={<SendHorizontal />}
                        label={`Reenviar convite para ${user.contact.name}`}
                        success
                        onClick={() => {
                          if (!customer) return;
                          void ticketApi
                            .inviteCustomerContact(user.contact.id, customer.id)
                            .then(async (invitation) => {
                              await refresh();
                              if (
                                invitation.delivery?.provider === "whatsapp" &&
                                invitation.delivery.queued
                              ) {
                                toast.success("Acesso encaminhado novamente pelo WhatsApp.");
                              } else if (invitation.delivery?.delivered === false) {
                                toast.info(
                                  "Convite gerado. O envio por e-mail está desativado neste ambiente.",
                                );
                              } else {
                                toast.success("Convite reenviado.");
                              }
                            })
                            .catch((error: Error) => toast.error(error.message));
                        }}
                      />
                    )}
                    <Action
                      icon={<Pencil />}
                      label={`Editar login de ${user.contact.name}`}
                      onClick={() => {
                        setEditing(user);
                        setEditLogin(user.login);
                        setEditProfile(user.accessProfile);
                        setEditDepartmentId(user.department?.id ?? "");
                        setEditBranchId(user.branch?.id ?? "");
                        setEditActive(user.accessStatus !== "DISABLED");
                        setEditValidationVisible(false);
                      }}
                    />
                    <Action
                      icon={<Trash2 />}
                      label={`Remover acesso de ${user.contact.name}`}
                      danger
                      onClick={() => setRevoking(user)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyRows
            label={
              customer
                ? "Nenhum usuário do portal vinculado."
                : "Salve o cliente para liberar acessos."
            }
          />
        )}
      </RelationshipSection>
      <Modal
        open={linkOpen}
        onClose={closeLink}
        title="Vincular contato ao portal"
        description="Busque um contato já cadastrado e defina o login de acesso."
        size="md"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeLink}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void submitLink()} disabled={saving}>
              {saving ? "Vinculando..." : "Vincular e convidar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <div
              className="relative flex-1"
              onFocusCapture={() => {
                if (query.trim().length >= 1) setResultsOpen(true);
              }}
            >
              <SearchInput
                value={query}
                invalid={linkValidationVisible && !selected}
                onChange={(value) => {
                  setQuery(value);
                  setResultsOpen(value.trim().length >= 1);
                  if (selected) {
                    setSelected(null);
                    setLogin("");
                  }
                }}
                placeholder="Pesquisar contato..."
              />
              {resultsOpen && query.trim().length >= 1 ? (
                <div className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-20 max-h-56 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                  {candidates.isPending ? (
                    <p className="p-3 text-sm text-muted-foreground">Carregando contatos...</p>
                  ) : candidates.data?.items.length ? (
                    candidates.data.items.map((contact) => {
                      const alreadyLinked = users.some((user) => user.contact.id === contact.id);
                      return (
                        <button
                          key={contact.id}
                          type="button"
                          disabled={alreadyLinked}
                          onClick={() => choose(contact)}
                          className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {contact.nome}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {contact.email ?? "Sem e-mail cadastrado"}
                            </span>
                          </span>
                          {alreadyLinked ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              Já vinculado
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum contato encontrado.</p>
                  )}
                </div>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLinkValidationVisible(true);
                const pendingFields = [
                  ...(!branchId ? ["Filial"] : []),
                  ...(!profile ? ["Perfil de acesso"] : []),
                  ...(profile !== "FULL_ACCESS" && !departmentId ? ["Departamento"] : []),
                ];
                if (pendingFields.length) {
                  showRequiredFieldsToast(pendingFields);
                  return;
                }
                setNewContactOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Novo
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <PortalLoginField
              id="customer-portal-login"
              value={login}
              disabled={!selected}
              invalid={linkValidationVisible && login.trim().length < 3}
              onChange={setLogin}
            />
            <Field label="Filial *">
              <Select
                value={branchId}
                aria-invalid={linkValidationVisible && !branchId}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Selecione...</option>
                {branches
                  .filter((branch) => branch.status === "ACTIVE" || branch.id === branchId)
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Perfil de acesso *">
              <Select
                value={profile}
                aria-invalid={linkValidationVisible && !profile}
                onChange={(event) => {
                  const next = event.target.value as CustomerAccessProfile;
                  setProfile(next);
                  if (next === "FULL_ACCESS") setDepartmentId("");
                }}
              >
                {CUSTOMER_ACCESS_PROFILES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            {profile !== "FULL_ACCESS" ? (
              <Field label="Departamento *">
                <Select
                  value={departmentId}
                  aria-invalid={linkValidationVisible && !departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">Selecione...</option>
                  {departments
                    .filter((department) => department.active || department.id === departmentId)
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </div>
      </Modal>
      <Modal
        open={!!editing}
        onClose={closeEdit}
        title="Editar acesso ao portal"
        description={editing ? `Altere o login e o perfil de ${editing.contact.name}.` : undefined}
        size="md"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeEdit}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void submitAccessUpdate()} disabled={updatingLogin}>
              {updatingLogin ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex items-center gap-2">
          <Switch
            id="customer-portal-access-active"
            checked={editActive}
            onCheckedChange={setEditActive}
            aria-label={editActive ? "Acesso ativo" : "Acesso inativo"}
          />
          <label htmlFor="customer-portal-access-active" className="text-sm text-foreground">
            {editActive ? "Ativo" : "Inativo"}
          </label>
        </div>
        <div className="mb-4 flex items-start gap-2">
          <div
            role="textbox"
            aria-label="Contato vinculado"
            aria-readonly="true"
            className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground"
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{editing?.contact.name ?? "Contato não identificado"}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editing || loadingContactDetails}
            onClick={() => void openLinkedContactEditor()}
          >
            <Pencil className="h-3.5 w-3.5" />
            {loadingContactDetails ? "Abrindo..." : "Editar"}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <PortalLoginField
            id="customer-portal-edit-login"
            value={editLogin}
            invalid={editValidationVisible && editLogin.trim().length < 3}
            onChange={setEditLogin}
            autoFocus
          />
          <Field label="Filial *">
            <Select
              value={editBranchId}
              aria-invalid={editValidationVisible && !editBranchId}
              onChange={(event) => setEditBranchId(event.target.value)}
            >
              <option value="">Selecione...</option>
              {branches
                .filter((branch) => branch.status === "ACTIVE" || branch.id === editBranchId)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Perfil de acesso *">
            <Select
              value={editProfile}
              aria-invalid={editValidationVisible && !editProfile}
              onChange={(event) => {
                const next = event.target.value as CustomerAccessProfile;
                setEditProfile(next);
                if (next === "FULL_ACCESS") setEditDepartmentId("");
              }}
            >
              {CUSTOMER_ACCESS_PROFILES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          {editProfile !== "FULL_ACCESS" ? (
            <Field label="Departamento *">
              <Select
                value={editDepartmentId}
                aria-invalid={editValidationVisible && !editDepartmentId}
                onChange={(event) => setEditDepartmentId(event.target.value)}
              >
                <option value="">Selecione...</option>
                {departments
                  .filter((department) => department.active || department.id === editDepartmentId)
                  .map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </Modal>
      <ContactRegistryFormModal
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        customers={customer ? [customer] : []}
        tags={contactOptions.data?.tags ?? []}
        departments={contactOptions.data?.departments ?? []}
        profiles={contactOptions.data?.profiles ?? []}
        instances={contactOptions.data?.instances ?? []}
        defaultCustomerId={customer?.id}
        lockCustomer
        onCustomerCreated={() => undefined}
        onDepartmentSaved={() => undefined}
        onProfileSaved={() => undefined}
        onSubmit={async (data) => {
          if (!customer) return;
          try {
            const created = await crmApi.createContact(
              contactPayload({ ...data, customer_id: customer.id }),
            );
            const requestedLogin = login.trim() || data.email?.trim().toLocaleLowerCase("en-US");
            if (!requestedLogin) {
              choose(created);
              setNewContactOpen(false);
              toast.info("Contato cadastrado. Informe o login para liberar o acesso ao portal.");
              return;
            }
            const invitation = await link(created, requestedLogin, profile, departmentId, branchId);
            setNewContactOpen(false);
            closeLink();
            if (invitation?.delivery?.delivered === false) {
              toast.info(
                "Contato cadastrado e vinculado. O envio por e-mail está desativado neste ambiente.",
              );
            } else {
              toast.success("Contato cadastrado, vinculado e convidado para o portal.");
            }
          } catch (error) {
            toast.error((error as Error).message);
          }
        }}
      />
      <ContactRegistryFormModal
        open={!!editingContactDetails}
        initial={editingContactDetails ?? undefined}
        onClose={() => setEditingContactDetails(null)}
        customers={customer ? [customer] : []}
        tags={contactOptions.data?.tags ?? []}
        departments={contactOptions.data?.departments ?? []}
        profiles={contactOptions.data?.profiles ?? []}
        instances={contactOptions.data?.instances ?? []}
        defaultCustomerId={customer?.id}
        lockCustomer
        onCustomerCreated={() => undefined}
        onDepartmentSaved={() => undefined}
        onProfileSaved={() => undefined}
        onSubmit={async (data) => {
          if (!editingContactDetails) return;
          try {
            const updated = await crmApi.updateContact(
              editingContactDetails.id,
              contactPayload(data),
            );
            setEditing((current) =>
              current
                ? {
                    ...current,
                    contact: {
                      ...current.contact,
                      name: updated.nome,
                      email: updated.email,
                      phone: updated.telefone,
                      active: updated.active,
                    },
                  }
                : current,
            );
            setEditBranchId(updated.customerBranchId ?? "");
            setEditDepartmentId(updated.customerDepartmentId ?? "");
            setEditingContactDetails(null);
            await refresh();
            toast.success("Contato atualizado.");
          } catch (error) {
            toast.error((error as Error).message);
          }
        }}
      />
      <ConfirmDialog
        open={!!revoking}
        title="Remover acesso ao portal?"
        description="O contato continuará vinculado ao cliente, mas não poderá mais acessar o portal."
        confirmLabel="Remover acesso"
        destructive
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          if (!customer || !revoking) return;
          void ticketApi
            .revokeCustomerPortalUser(customer.id, revoking.contact.id)
            .then(async (result) => {
              await refresh();
              return result;
            })
            .then((result) => {
              setRevoking(null);
              if (result.delivery.queued || result.delivery.delivered) {
                toast.success("Acesso removido e aviso encaminhado pelo WhatsApp.");
              } else {
                toast.info(
                  "Acesso removido, mas não foi possível encaminhar o aviso pelo WhatsApp.",
                );
              }
            })
            .catch((error: Error) => toast.error(error.message));
        }}
      />
    </>
  );
}

function LegacyContactsTab({
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
  const [validationAttempted, setValidationAttempted] = React.useState(false);
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
    setValidationAttempted(false);
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
    setValidationAttempted(true);
    const pendingFields = [
      ...(!name.trim() ? ["Nome"] : []),
      ...(onlyDigits(phone).length < 10 ? ["WhatsApp"] : []),
      ...(!email.trim() || !isValidEmail(email.trim()) ? ["E-mail"] : []),
    ];
    if (pendingFields.length) {
      showRequiredFieldsToast(pendingFields);
      return;
    }
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
            <Input
              value={name}
              aria-invalid={validationAttempted && !name.trim()}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="WhatsApp *">
            <div
              className={`flex h-9 overflow-hidden rounded-md border bg-transparent transition-colors ${
                validationAttempted && onlyDigits(phone).length < 10
                  ? "border-destructive focus-within:border-destructive"
                  : "border-input focus-within:border-primary"
              }`}
            >
              <CountryCodeSelect
                value={countryCode}
                onChange={(value) => setCountryCode(value)}
                compact
                embedded
              />
              <Input
                type="tel"
                inputMode="tel"
                aria-invalid={validationAttempted && onlyDigits(phone).length < 10}
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
              aria-invalid={validationAttempted && (!email.trim() || !isValidEmail(email.trim()))}
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
  const [cityId, setCityId] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [nameMissing, setNameMissing] = React.useState(false);
  const [cityMissing, setCityMissing] = React.useState(false);
  const [status, setStatus] = React.useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const isEditing = Boolean(initial) && !forceCreate;
  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setCityId("");
      setCity(initial?.city ?? "");
      setState(initial?.state ?? "");
      setNameMissing(false);
      setCityMissing(false);
      setStatus(initial?.status ?? "ACTIVE");
    }
  }, [initial, open]);
  const save = async () => {
    if (!customer) return;
    const missingName = !name.trim();
    const missingCity = !city.trim() || !state.trim();
    setNameMissing(missingName);
    setCityMissing(missingCity);
    const pendingFields = [
      ...(missingName ? ["Nome da filial"] : []),
      ...(missingCity ? ["Cidade"] : []),
    ];
    if (pendingFields.length) {
      showRequiredFieldsToast(pendingFields);
      return;
    }
    try {
      const payload = {
        name: name.trim(),
        city: city.trim(),
        state: state.trim(),
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
          <Input
            value={name}
            aria-invalid={nameMissing}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim()) setNameMissing(false);
            }}
          />
        </Field>
        <CityAutocomplete
          value={cityId}
          initialLabel={city}
          initialDivision={state}
          cityFieldLabel={
            <span>
              Cidade <span className="text-destructive">*</span>
            </span>
          }
          invalid={cityMissing}
          selectionLabel="name"
          onChange={setCityId}
          onSearchChange={(value) => {
            setCity(value);
            setState("");
          }}
          onCitySelect={(selectedCity) => {
            setCity(selectedCity.name);
            setState(selectedCity.divisionCode || selectedCity.divisionName || "");
            setCityMissing(false);
          }}
        />
      </div>
    </Modal>
  );
}
function DepartmentsTab({
  customer,
  items,
  loading,
}: {
  customer: TicketCustomer | null;
  items: ApiCustomerDepartment[];
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
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem] bg-surface-1 px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground sm:grid">
              <span>Departamento</span>
              <span>Situação</span>
              <span className="text-center">Ações</span>
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 border-t border-border px-3 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_7rem_8rem] sm:items-center"
              >
                <p className="font-medium">{item.name}</p>
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
  initial,
  forceCreate = false,
  open,
  onClose,
  onSaved,
}: {
  customer: TicketCustomer | null;
  initial: ApiCustomerDepartment | null;
  forceCreate?: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [nameMissing, setNameMissing] = React.useState(false);
  const isEditing = Boolean(initial) && !forceCreate;
  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setActive(initial?.active ?? true);
      setNameMissing(false);
    }
  }, [initial, open]);
  const save = async () => {
    if (!customer) return;
    const missingName = !name.trim();
    setNameMissing(missingName);
    if (missingName) {
      showRequiredFieldsToast(["Departamento"]);
      return;
    }
    try {
      const payload = { name: name.trim(), active };
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
          <Input
            value={name}
            aria-invalid={nameMissing}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim()) setNameMissing(false);
            }}
          />
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
function normalizeLocationName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
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
    zipCode: maskZipCode(customer.postalCode ?? ""),
    address: customer.street ?? "",
    addressNumber: customer.addressWithoutNumber ? "SN" : (customer.addressNumber ?? ""),
    addressWithoutNumber: customer.addressWithoutNumber ?? false,
    addressComplement: customer.complement ?? "",
    neighborhood: customer.neighborhood ?? "",
    cityId: customer.cityId ?? "",
    addressCountryCode: (customer.country ?? "Brasil") === "Brasil" ? "BR" : "",
    addressDivisionId: "",
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
    city: normalizeCustomerCity(form.city, form.state),
    state: form.state,
    addressFullEnabled: form.fullAddress,
    postalCode: onlyDigits(form.zipCode) || null,
    street: form.address.trim() || null,
    addressNumber: form.addressNumber.trim() || null,
    addressWithoutNumber: form.addressWithoutNumber,
    complement: form.addressComplement.trim() || null,
    neighborhood: form.neighborhood.trim() || null,
    cityId: form.cityId || null,
    country: form.country.trim() || "Brasil",
  } as Parameters<typeof crmApi.createCustomer>[0];
}

export function normalizeCustomerCity(city: string, state: string) {
  const normalizedCity = city.trim();
  const normalizedState = state.trim();
  if (!normalizedState) return normalizedCity;
  const escapedState = normalizedState.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizedCity.replace(new RegExp(`\\s+-\\s+${escapedState}$`, "i"), "").trim();
}
