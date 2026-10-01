import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Pencil, Plus, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import {
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
import { ConfirmDialog, Modal } from "@/components/modal";
import { fmtDate } from "@/lib/format";
import { maskCnpj, onlyDigits } from "@/lib/input-masks";
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
const EMPTY_FORM: PlatformClientPayload = {
  name: "",
  document: "",
  responsibleName: "",
  responsibleEmail: "",
  city: "",
  state: "",
  registeredAt: toLocalDateTimeValue(new Date()),
  status: "ACTIVE",
  notes: "",
};

function ClientesAdmin() {
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
  const [creating, setCreating] = React.useState(false);
  const [clientAction, setClientAction] = React.useState<{
    client: PlatformClient;
    kind: "delete" | "cancel";
  } | null>(null);

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

  return (
    <AdminContainer>
      <SectionHeader
        title="Clientes"
        subtitle={`${data.total} ${data.total === 1 ? "cliente cadastrado" : "clientes cadastrados"}.`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        }
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Busca">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Buscar por nome, CNPJ ou responsável..."
            />
          </Field>
          <Field label="Cidade">
            <Select value={city} onChange={(event) => setCity(event.target.value)}>
              <option value="">Todas</option>
              {cities.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label="UF">
            <Select value={state} onChange={(event) => setState(event.target.value)}>
              <option value="">Todas</option>
              {STATES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label="Situação">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todas</option>
              <option value="ACTIVE">Ativo</option>
              <option value="SUSPENDED">Suspenso</option>
              <option value="CANCELLED">Cancelado</option>
              <option value="PROSPECTING">Prospecção</option>
            </Select>
          </Field>
        </div>
      </Card>
      <Card className="p-0">
        {error && (
          <div className="border-b border-border px-4 py-3 text-sm text-destructive">{error}</div>
        )}
        <div className="overflow-x-auto px-4 pt-2">
          <table className="w-full min-w-[1050px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-3">Nome do cliente</th>
                <th className="px-2 py-3">CNPJ</th>
                <th className="px-2 py-3">Responsável</th>
                <th className="px-2 py-3">Cidade - UF</th>
                <th className="px-2 py-3">Dt. cadastro</th>
                <th className="px-2 py-3">Situação</th>
                <th className="px-2 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-border/70 transition hover:bg-surface-1"
                >
                  <td className="px-2 py-3">
                    <div className="font-medium">{client.name}</div>
                    {client.tenant?.slug && (
                      <div className="text-xs text-muted-foreground">{client.tenant.slug}</div>
                    )}
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">
                    {client.document ? maskCnpj(client.document) : "Não informado"}
                  </td>
                  <td className="px-2 py-3">
                    <div className="font-medium">{client.responsibleName}</div>
                    <div className="text-xs text-muted-foreground">{client.responsibleEmail}</div>
                  </td>
                  <td className="px-2 py-3">
                    {client.city} - {client.state}
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">
                    {fmtDate(new Date(client.registeredAt).getTime())}
                  </td>
                  <td className="px-2 py-3">
                    <ClientStatus status={client.status} />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex justify-center gap-2">
                      <IconAction
                        label="Duplicar"
                        onClick={() => {
                          setEditing({
                            ...client,
                            id: "",
                            name: `${client.name} - Cópia`,
                            document: "",
                            tenantId: null,
                            tenant: null,
                          });
                          setCreating(true);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </IconAction>
                      <IconAction label="Editar" onClick={() => setEditing(client)}>
                        <Pencil className="h-4 w-4" />
                      </IconAction>
                      {(client._count?.subscriptions ?? 0) === 0 ? (
                        <IconAction
                          label="Excluir"
                          onClick={() => setClientAction({ client, kind: "delete" })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconAction>
                      ) : (
                        <IconAction
                          label="Cancelar"
                          onClick={() => setClientAction({ client, kind: "cancel" })}
                          disabled={client.status === "CANCELLED"}
                        >
                          <PowerOff className="h-4 w-4" />
                        </IconAction>
                      )}
                    </div>
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
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span>
              Mostrando {data.items.length} de {data.total}
            </span>
            <Select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="h-8 min-h-8 w-20 py-1"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </Button>
            <span>
              {page} / {data.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              ›
            </Button>
          </div>
        </div>
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
  const [form, setForm] = React.useState<PlatformClientPayload>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setForm(
      initial
        ? {
            name: initial.name,
            document: initial.document ? maskCnpj(initial.document) : "",
            responsibleName: initial.responsibleName,
            responsibleEmail: initial.responsibleEmail,
            city: initial.city,
            state: initial.state,
            registeredAt: toLocalDateTimeValue(new Date(initial.registeredAt)),
            status: initial.status,
            notes: initial.notes ?? "",
          }
        : { ...EMPTY_FORM, registeredAt: toLocalDateTimeValue(new Date()) },
    );
  }, [initial, open]);
  const isEditing = Boolean(initial?.id) && !forceCreate;
  const update = (key: keyof PlatformClientPayload, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    const document = onlyDigits(form.document);
    const requiresDocument = form.status !== "PROSPECTING";
    if (
      !form.name.trim() ||
      (requiresDocument && document.length !== 14) ||
      !form.responsibleName.trim() ||
      !form.responsibleEmail.includes("@") ||
      !form.city.trim() ||
      !form.state ||
      !form.registeredAt
    ) {
      toast.error("Preencha corretamente todos os campos obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
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
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={save}>
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
          />
        </Field>
        <Field label="Situação *">
          <Select value={form.status} onChange={(event) => update("status", event.target.value)}>
            <option value="ACTIVE">Ativo</option>
            <option value="SUSPENDED">Suspenso</option>
            <option value="CANCELLED">Cancelado</option>
            <option value="PROSPECTING">Prospecção</option>
          </Select>
        </Field>
        <Field label={`CNPJ${form.status === "PROSPECTING" ? "" : " *"}`}>
          <Input
            value={form.document}
            onChange={(event) => update("document", maskCnpj(event.target.value))}
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
          />
        </Field>
        <Field label="Responsável *">
          <Input
            value={form.responsibleName}
            onChange={(event) => update("responsibleName", event.target.value)}
            placeholder="Nome do contato responsável..."
          />
        </Field>
        <Field label="E-mail do responsável *">
          <Input
            type="email"
            value={form.responsibleEmail}
            onChange={(event) => update("responsibleEmail", event.target.value)}
            placeholder="exemplo@empresa.com.br"
          />
        </Field>
        <Field label="Cidade *">
          <Input
            value={form.city}
            onChange={(event) => update("city", event.target.value)}
            placeholder="Digite a cidade..."
          />
        </Field>
        <Field label="UF *">
          <Select value={form.state} onChange={(event) => update("state", event.target.value)}>
            <option value="">Selecione...</option>
            {STATES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
        </Field>
        <Field label="Data de cadastro *">
          <Input
            type="datetime-local"
            value={form.registeredAt}
            onChange={(event) => update("registeredAt", event.target.value)}
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
  const data =
    status === "ACTIVE"
      ? ["success", "ATIVO"]
      : status === "SUSPENDED"
        ? ["info", "SUSPENSO"]
        : status === "PROSPECTING"
          ? ["warning", "PROSPECÇÃO"]
          : ["destructive", "CANCELADO"];
  return <Badge tone={data[0] as "success" | "info" | "warning" | "destructive"}>{data[1]}</Badge>;
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
