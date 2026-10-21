import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Eye, LayoutGrid, List, Pencil, Plus, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import { GridPaginationFooter } from "@/components/grid-pagination-footer";
import { ClearFiltersButton } from "@/components/clear-filters-button";
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
import { InternationalLocationFields } from "@/components/international-location-fields";
import type { InternationalLocationValue } from "@/components/international-location-value";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatPlatformDateTime } from "@/lib/format";
import { isValidEmail, maskCnpj, onlyDigits } from "@/lib/input-masks";
import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields";
import { platformApi, type PlatformClient, type PlatformClientPayload } from "@/lib/trixus-api";

export const Route = createFileRoute("/admin/empresas")({
  head: () => ({ meta: [{ title: "Clientes | Trixus" }] }),
  component: ClientesAdmin,
});

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

type PlatformClientForm = PlatformClientPayload & {
  addressCountryCode: string;
  addressDivisionId: string;
};

const EMPTY_FORM: PlatformClientForm = {
  name: "",
  document: "",
  responsibleName: "",
  responsibleEmail: "",
  city: "",
  state: "",
  country: "Brasil",
  cityId: null,
  addressCountryCode: "BR",
  addressDivisionId: "",
  registeredAt: toLocalDateTimeValue(new Date()),
  status: "ACTIVE",
  notes: "",
};

const CLIENT_STATUS_OPTIONS: Array<{
  value: string;
  label: string;
  badgeLabel: string;
  tone: "success" | "info" | "warning" | "destructive";
  color: string;
}> = [
  {
    value: "ACTIVE",
    label: "Ativo",
    badgeLabel: "ATIVO",
    tone: "success",
    color: "var(--color-success)",
  },
  {
    value: "SUSPENDED",
    label: "Suspenso",
    badgeLabel: "SUSPENSO",
    tone: "info",
    color: "var(--color-info)",
  },
  {
    value: "CANCELLED",
    label: "Cancelado",
    badgeLabel: "CANCELADO",
    tone: "destructive",
    color: "var(--color-destructive)",
  },
  {
    value: "PROSPECTING",
    label: "Prospect",
    badgeLabel: "PROSPECT",
    tone: "warning",
    color: "var(--color-warning)",
  },
];

function ClientesAdmin() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = React.useState<"cards" | "list">("list");
  const viewModeTouched = React.useRef(false);
  const [q, setQ] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [data, setData] = React.useState({
    items: [] as PlatformClient[],
    total: 0,
    totalPages: 1,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<PlatformClient | null>(null);
  const [viewing, setViewing] = React.useState<PlatformClient | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [clientAction, setClientAction] = React.useState<{
    client: PlatformClient;
    kind: "delete" | "cancel";
  } | null>(null);

  React.useEffect(() => {
    if (isMobile) {
      setViewMode("cards");
      return;
    }
    if (!viewModeTouched.current) setViewMode("list");
  }, [isMobile]);

  const load = React.useCallback(() => {
    platformApi
      .clients({
        q: q || undefined,
        city: city || undefined,
        state: state || undefined,
        status: status || undefined,
        page,
        pageSize,
      })
      .then((response) => {
        setData(response);
        setError(null);
      })
      .catch((reason) => setError((reason as Error).message));
  }, [city, page, pageSize, q, state, status]);
  React.useEffect(() => void load(), [load]);
  React.useEffect(() => setPage(1), [q, city, state, status, pageSize]);
  const cities = React.useMemo(
    () =>
      Array.from(new Set(data.items.map((item) => item.city))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [data.items],
  );
  const hasActiveFilters = Boolean(q || city || state || status);

  function clearFilters() {
    setQ("");
    setCity("");
    setState("");
    setStatus("");
    setPage(1);
  }
  const duplicateClient = (client: PlatformClient) => {
    setEditing({
      ...client,
      id: "",
      name: `${client.name} - Cópia`,
      document: "",
      tenantId: null,
      tenant: null,
    });
    setCreating(true);
  };

  const paginationFooter = (
    <GridPaginationFooter
      visible={data.items.length}
      total={data.total}
      page={page}
      totalPages={data.totalPages}
      pageSize={pageSize}
      onPage={(nextPage) => setPage(nextPage)}
      onPageSize={(nextPageSize) => setPageSize(nextPageSize)}
      ariaLabelPrefix="clientes"
    />
  );

  return (
    <AdminContainer>
      <SectionHeader
        title="Clientes"
        subtitle={`${data.total} ${data.total === 1 ? "cliente cadastrado" : "clientes cadastrados"}.`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo cliente
          </Button>
        }
      />
      <Card className="mb-4">
        <div
          className={`grid grid-cols-2 gap-3 md:grid-cols-2 ${
            hasActiveFilters ? "xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]" : "xl:grid-cols-4"
          }`}
          data-platform-filter-grid
        >
          <div className="min-w-0">
            <Field label="Busca">
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder="Buscar por nome, CNPJ ou responsável..."
              />
            </Field>
          </div>
          <div className="col-start-1 row-start-2 min-w-0 md:col-auto md:row-auto">
            <Field label="Cidade">
              <Select value={city} onChange={(event) => setCity(event.target.value)}>
                <option value="">Todas</option>
                {cities.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="col-start-2 row-start-2 min-w-0 md:col-auto md:row-auto">
            <Field label="UF">
              <Select value={state} onChange={(event) => setState(event.target.value)}>
                <option value="">Todas</option>
                {STATES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="col-start-2 row-start-1 min-w-0 md:col-auto md:row-auto">
            <Field label="Situação">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todas</option>
                <option value="ACTIVE">Ativo</option>
                <option value="SUSPENDED">Suspenso</option>
                <option value="CANCELLED">Cancelado</option>
                <option value="PROSPECTING">Prospect</option>
              </Select>
            </Field>
          </div>
          {hasActiveFilters && (
            <div className="col-span-2 flex justify-end xl:col-span-1 xl:items-end">
              <ClearFiltersButton onClick={clearFilters} />
            </div>
          )}
        </div>
      </Card>
      <div className="mb-3 hidden justify-end gap-1 md:flex" aria-label="Visualização dos clientes">
        <Button
          type="button"
          variant={viewMode === "cards" ? "primary" : "secondary"}
          size="icon"
          aria-label="Visualizar clientes em cards"
          aria-pressed={viewMode === "cards"}
          onClick={() => {
            viewModeTouched.current = true;
            setViewMode("cards");
          }}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={viewMode === "list" ? "primary" : "secondary"}
          size="icon"
          aria-label="Visualizar clientes em lista"
          aria-pressed={viewMode === "list"}
          onClick={() => {
            viewModeTouched.current = true;
            setViewMode("list");
          }}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
      {error && <div className="mb-3 text-sm text-destructive">{error}</div>}
      <div
        data-platform-card-shell
        className={
          viewMode === "cards"
            ? "md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:shadow-card"
            : "hidden"
        }
      >
        <div
          data-platform-mobile-list
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:p-4 xl:grid-cols-3"
        >
          {data.items.map((client) => (
            <article key={client.id} className="rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{client.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {client.document ? `CNPJ: ${maskCnpj(client.document)}` : "CNPJ não informado"}
                  </p>
                </div>
                <ClientStatus status={client.status} />
              </div>
              <dl className="mt-3 grid gap-2 border-y border-border/70 py-3 text-sm">
                <MobileDetail label="Responsável" value={client.responsibleName} />
                <MobileDetail label="E-mail" value={client.responsibleEmail} />
                <MobileDetail label="Local" value={`${client.city} - ${client.state}`} />
                <MobileDetail
                  label="Cadastro"
                  value={formatPlatformDateTime(client.registeredAt)}
                />
              </dl>
              <ClientActions
                placement="card"
                client={client}
                onView={() => setViewing(client)}
                onDuplicate={() => duplicateClient(client)}
                onEdit={() => setEditing(client)}
                onDelete={() => setClientAction({ client, kind: "delete" })}
                onCancel={() => setClientAction({ client, kind: "cancel" })}
              />
            </article>
          ))}
          {!data.items.length && (
            <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </div>
          )}
        </div>
        <div className="hidden md:block" data-platform-card-pagination>
          {paginationFooter}
        </div>
      </div>
      <Card padding={false} className={viewMode === "list" ? "overflow-hidden p-0" : "hidden"}>
        <div data-platform-desktop-table className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nome do cliente</th>
                <th className="px-3 py-3 font-medium">CNPJ</th>
                <th className="px-3 py-3 font-medium">Responsável</th>
                <th className="px-3 py-3 font-medium">Cidade - UF</th>
                <th className="px-3 py-3 font-medium">Dt. cadastro</th>
                <th className="px-3 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 text-center font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((client) => (
                <tr key={client.id} className="transition hover:bg-surface-1">
                  <td className="px-4 py-3">
                    <div className="font-medium">{client.name}</div>
                    {client.tenant?.slug && (
                      <div className="text-xs text-muted-foreground">{client.tenant.slug}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {client.document ? maskCnpj(client.document) : "Não informado"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{client.responsibleName}</div>
                    <div className="text-xs text-muted-foreground">{client.responsibleEmail}</div>
                  </td>
                  <td className="px-3 py-3">
                    {client.city} - {client.state}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {formatPlatformDateTime(client.registeredAt)}
                  </td>
                  <td className="px-3 py-3">
                    <ClientStatus status={client.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ClientActions
                      client={client}
                      onView={() => setViewing(client)}
                      onDuplicate={() => duplicateClient(client)}
                      onEdit={() => setEditing(client)}
                      onDelete={() => setClientAction({ client, kind: "delete" })}
                      onCancel={() => setClientAction({ client, kind: "cancel" })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length && (
            <div className="py-14 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </div>
          )}
        </div>
        {paginationFooter}
      </Card>
      <ClientForm
        open={creating || Boolean(editing)}
        initial={editing ?? undefined}
        forceCreate={creating}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />
      <ClientView client={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={Boolean(clientAction)}
        title={clientAction?.kind === "delete" ? "Excluir cliente?" : "Cancelar cliente?"}
        description={
          clientAction?.kind === "delete"
            ? "Esta exclusão é definitiva e só é permitida porque o cliente nunca foi utilizado em uma assinatura."
            : "O registro será preservado e ficará com situação Cancelado. Tenants e assinaturas existentes não serão apagados."
        }
        destructive
        confirmLabel={clientAction?.kind === "delete" ? "Excluir cliente" : "Cancelar cliente"}
        onClose={() => setClientAction(null)}
        onConfirm={() => {
          if (!clientAction) return;
          const request =
            clientAction.kind === "delete"
              ? platformApi.deleteClient(clientAction.client.id)
              : platformApi.cancelClient(clientAction.client.id);
          request
            .then(() => {
              toast.success(
                clientAction.kind === "delete"
                  ? "Cliente excluído definitivamente."
                  : "Cliente cancelado.",
              );
              load();
            })
            .catch((reason) => toast.error((reason as Error).message));
        }}
      />
    </AdminContainer>
  );
}

function ClientView({ client, onClose }: { client: PlatformClient | null; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(client)}
      onClose={onClose}
      title="Visualizar Cliente"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {client && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyDetail label="Nome do cliente" value={client.name} />
          <div>
            <p className="text-xs font-medium text-muted-foreground">Situação</p>
            <div className="mt-2">
              <ClientStatus status={client.status} />
            </div>
          </div>
          <ReadOnlyDetail
            label="CNPJ"
            value={client.document ? maskCnpj(client.document) : "Não informado"}
          />
          <ReadOnlyDetail label="Responsável" value={client.responsibleName} />
          <ReadOnlyDetail label="E-mail do responsável" value={client.responsibleEmail} />
          <ReadOnlyDetail label="Cidade - UF" value={`${client.city} - ${client.state}`} />
          <ReadOnlyDetail
            label="Data de cadastro"
            value={formatPlatformDateTime(client.registeredAt)}
          />
          <ReadOnlyDetail label="Tenant vinculado" value={client.tenant?.slug || "Não vinculado"} />
          <div className="sm:col-span-2">
            <ReadOnlyDetail label="Observações" value={client.notes || "Não informado"} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function ReadOnlyDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function ClientForm({
  open,
  initial,
  forceCreate,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: PlatformClient;
  forceCreate: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<PlatformClientForm>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const isEditing = Boolean(initial?.id) && !forceCreate;
  React.useEffect(() => {
    setErrors({});
    setForm(
      initial
        ? {
            name: initial.name,
            document: initial.document ? maskCnpj(initial.document) : "",
            responsibleName: initial.responsibleName,
            responsibleEmail: initial.responsibleEmail.toLocaleLowerCase("en-US"),
            city: initial.city,
            state: initial.state,
            country: initial.country ?? "Brasil",
            cityId: initial.cityId ?? null,
            addressCountryCode: (initial.country ?? "Brasil") === "Brasil" ? "BR" : "",
            addressDivisionId: "",
            registeredAt: toLocalDateTimeValue(new Date(initial.registeredAt)),
            status: initial.status,
            notes: initial.notes ?? "",
          }
        : { ...EMPTY_FORM, registeredAt: toLocalDateTimeValue(new Date()) },
    );
  }, [initial, open]);
  React.useEffect(() => {
    setErrors((current) => {
      const next = { ...current };
      const isProspect = form.status === "PROSPECTING";
      if (form.name.trim()) delete next.name;
      if (isProspect || onlyDigits(form.document).length === 14) delete next.document;
      if (isProspect || form.responsibleName.trim()) delete next.responsibleName;
      if ((isProspect && !form.responsibleEmail.trim()) || isValidEmail(form.responsibleEmail))
        delete next.responsibleEmail;
      if (form.city.trim() && (isEditing || form.cityId)) delete next.city;
      if (form.registeredAt) delete next.registeredAt;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [form, isEditing]);
  const update = (key: keyof PlatformClientForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    const document = onlyDigits(form.document);
    const requiresRequiredRegistrationData = form.status !== "PROSPECTING";
    const hasInvalidOptionalEmail = Boolean(
      form.responsibleEmail.trim() && !isValidEmail(form.responsibleEmail),
    );
    const nextErrors: Record<string, boolean> = {
      ...(!form.name.trim() ? { name: true } : {}),
      ...(requiresRequiredRegistrationData && document.length !== 14 ? { document: true } : {}),
      ...(requiresRequiredRegistrationData && !form.responsibleName.trim()
        ? { responsibleName: true }
        : {}),
      ...(requiresRequiredRegistrationData && !form.responsibleEmail.includes("@")
        ? { responsibleEmail: true }
        : {}),
      ...(hasInvalidOptionalEmail ? { responsibleEmail: true } : {}),
      ...(!form.city.trim() || (!form.cityId && !form.state) || (!isEditing && !form.cityId)
        ? { city: true }
        : {}),
      ...(!form.registeredAt ? { registeredAt: true } : {}),
    };
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const requiredFields = [
        ["name", "Nome do cliente"],
        ["document", "CNPJ"],
        ["responsibleName", "Responsável"],
        ["responsibleEmail", "E-mail do responsável"],
        ["city", "Cidade"],
        ["registeredAt", "Data de cadastro"],
      ]
        .filter(
          ([key]) =>
            nextErrors[key] && !(key === "responsibleEmail" && !requiresRequiredRegistrationData),
        )
        .map(([, label]) => label);
      if (requiredFields.length) showRequiredFieldsToast(requiredFields);
      else if (hasInvalidOptionalEmail)
        toast.error("Informe um e-mail válido para o responsável.", {
          position: "top-right",
        });
      return;
    }
    if (!form.registeredAt) return;
    setSaving(true);
    try {
      const { addressCountryCode: _countryCode, addressDivisionId: _divisionId, ...fields } = form;
      const payload: PlatformClientPayload = {
        ...fields,
        document,
        registeredAt: new Date(form.registeredAt).toISOString(),
      };
      if (isEditing && initial) await platformApi.updateClient(initial.id, payload);
      else await platformApi.createClient(payload);
      toast.success(isEditing ? "Cliente atualizado." : "Cliente criado.");
      onSaved();
    } catch (reason) {
      toast.error((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar Cliente" : "Novo Cliente"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="save-action-button" disabled={saving} onClick={save}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do cliente *">
          <Input
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Digite o nome do cliente..."
            className={requiredFieldClassName(Boolean(errors.name))}
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label="Situação *">
          <InstanceFilterSelect
            value={form.status ?? "ACTIVE"}
            onChange={(value) => update("status", value)}
            options={CLIENT_STATUS_OPTIONS}
            showAllOption={false}
            allLabel="Selecione"
          />
        </Field>
        <Field label={`CNPJ${form.status === "PROSPECTING" ? "" : " *"}`}>
          <Input
            value={form.document}
            onChange={(event) => update("document", maskCnpj(event.target.value))}
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            className={requiredFieldClassName(Boolean(errors.document))}
            aria-invalid={Boolean(errors.document)}
          />
        </Field>
        <Field label={`Responsável${form.status === "PROSPECTING" ? "" : " *"}`}>
          <Input
            value={form.responsibleName}
            onChange={(event) => update("responsibleName", event.target.value)}
            placeholder="Nome do contato responsável..."
            className={requiredFieldClassName(Boolean(errors.responsibleName))}
            aria-invalid={Boolean(errors.responsibleName)}
          />
        </Field>
        <Field label={`E-mail do responsável${form.status === "PROSPECTING" ? "" : " *"}`}>
          <Input
            type="email"
            value={form.responsibleEmail}
            onChange={(event) =>
              update("responsibleEmail", event.target.value.toLocaleLowerCase("en-US"))
            }
            placeholder="exemplo@empresa.com.br"
            className={requiredFieldClassName(Boolean(errors.responsibleEmail))}
            aria-invalid={Boolean(errors.responsibleEmail)}
          />
        </Field>
        <div className="sm:col-span-2">
          <InternationalLocationFields
            value={{
              cityId: form.cityId ?? "",
              city: form.city,
              divisionId: form.addressDivisionId,
              state: form.state,
              countryCode: form.addressCountryCode,
              country: form.country,
            }}
            onChange={(location: InternationalLocationValue) =>
              setForm((current) => ({
                ...current,
                cityId: location.cityId || null,
                city: location.city,
                addressDivisionId: location.divisionId,
                state: location.state,
                addressCountryCode: location.countryCode,
                country: location.country,
              }))
            }
            cityError={errors.city ? "Cidade obrigatória" : undefined}
            errorPresentation="border"
            cityResultsPlacement="top"
            lockDivision
          />
        </div>
        <Field label="Data de cadastro *">
          <Input
            type="datetime-local"
            value={form.registeredAt}
            onChange={(event) => update("registeredAt", event.target.value)}
            className={requiredFieldClassName(Boolean(errors.registeredAt))}
            aria-invalid={Boolean(errors.registeredAt)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Observações">
            <Textarea
              rows={4}
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Informações adicionais sobre o cliente..."
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function ClientStatus({ status }: { status: string }) {
  const option =
    CLIENT_STATUS_OPTIONS.find((item) => item.value === status) ?? CLIENT_STATUS_OPTIONS[2];
  return <Badge tone={option.tone}>{option.badgeLabel}</Badge>;
}

function ClientActions({
  placement = "table",
  client,
  onView,
  onDuplicate,
  onEdit,
  onDelete,
  onCancel,
}: {
  placement?: "card" | "table";
  client: PlatformClient;
  onView: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className={
        placement === "card"
          ? "mt-3 flex justify-end gap-2"
          : "mt-3 flex justify-end gap-2 md:mt-0 md:justify-center"
      }
    >
      <IconAction label="Visualizar" onClick={onView}>
        <Eye className="h-4 w-4" />
      </IconAction>
      <IconAction label="Duplicar" onClick={onDuplicate}>
        <Copy className="h-4 w-4" />
      </IconAction>
      <IconAction label="Editar" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </IconAction>
      {(client._count?.subscriptions ?? 0) === 0 ? (
        <IconAction label="Excluir" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </IconAction>
      ) : (
        <IconAction label="Cancelar" onClick={onCancel} disabled={client.status === "CANCELLED"}>
          <PowerOff className="h-4 w-4" />
        </IconAction>
      )}
    </div>
  );
}

function MobileDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value || "Não informado"}</dd>
    </div>
  );
}

function toLocalDateTimeValue(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
function IconAction({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const actionClass =
    label.includes("Excluir") || label.includes("Cancelar")
      ? "action-hover-destructive"
      : label.includes("Editar")
        ? "action-hover-warning"
        : label.includes("Duplicar")
          ? "action-hover-success"
          : "action-hover-primary";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1 text-muted-foreground transition disabled:cursor-not-allowed disabled:opacity-40 ${actionClass}`}
      {...props}
    >
      {children}
    </button>
  );
}
