import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Eye,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SearchInput,
  Select,
  SectionHeader,
  Textarea,
} from "@/components/ui-kit";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
import { maskBrazilPhone } from "@/lib/input-masks";
import {
  campaignApi,
  connectionsApi,
  crmApi,
  type ApiCampaign,
  type ApiCampaignAudience,
  type ApiCampaignPreview,
  type ApiCampaignStatus,
  type ApiContact,
  type ApiCustomer,
  type ApiMessagingConnection,
  type ApiTag,
} from "@/lib/nexos-api";
import { fmtDate, num } from "@/lib/format";

export const Route = createFileRoute("/campanhas")({ component: Page });

const queryKeys = {
  list: (filters: CampaignFilters) => ["campaigns.list", filters] as const,
  detail: (id: string | null) => ["campaigns.detail", id] as const,
  stats: (id: string | null) => ["campaigns.stats", id] as const,
  recipients: (id: string | null) => ["campaigns.recipients", id] as const,
  preview: ["campaigns.preview"] as const,
};

type CampaignFilters = {
  search: string;
  status: "ALL" | ApiCampaignStatus;
  connectionId: string;
};

const DEFAULT_CAMPAIGN_FILTERS: CampaignFilters = {
  search: "",
  status: "ALL",
  connectionId: "",
};

const STATUS_LABEL: Record<ApiCampaignStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  QUEUED: "Na fila",
  RUNNING: "Executando",
  PAUSED: "Pausada",
  CANCELLING: "Cancelando",
  CANCELLED: "Cancelada",
  COMPLETED: "Concluida",
  FAILED: "Falhou",
};

const STATUS_TONE: Record<
  ApiCampaignStatus,
  "default" | "info" | "brand" | "warning" | "success" | "destructive"
> = {
  DRAFT: "default",
  SCHEDULED: "info",
  QUEUED: "brand",
  RUNNING: "brand",
  PAUSED: "warning",
  CANCELLING: "warning",
  CANCELLED: "default",
  COMPLETED: "success",
  FAILED: "destructive",
};

function Page() {
  const queryClient = useQueryClient();
  const createModal = useDisclosure();
  const [filters, setFilters] = React.useState<CampaignFilters>(DEFAULT_CAMPAIGN_FILTERS);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<null | {
    action: "start" | "cancel";
    campaign: ApiCampaign;
  }>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.list(filters),
    queryFn: () =>
      campaignApi.list({
        search: filters.search || undefined,
        status: filters.status === "ALL" ? undefined : filters.status,
        connectionId: filters.connectionId || undefined,
        pageSize: 50,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const connectionsQuery = useQuery({
    queryKey: ["campaigns.connections"],
    queryFn: connectionsApi.list,
  });
  const selectedCampaign =
    listQuery.data?.items.find((item) => item.id === selectedId) ??
    listQuery.data?.items[0] ??
    null;

  React.useEffect(() => {
    if (!selectedId && listQuery.data?.items[0]) setSelectedId(listQuery.data.items[0].id);
  }, [listQuery.data?.items, selectedId]);

  const detailQuery = useQuery({
    queryKey: queryKeys.detail(selectedCampaign?.id ?? null),
    queryFn: () => campaignApi.get(selectedCampaign!.id),
    enabled: !!selectedCampaign,
    refetchInterval:
      selectedCampaign && ["QUEUED", "RUNNING", "CANCELLING"].includes(selectedCampaign.status)
        ? 5000
        : false,
  });
  const recipientsQuery = useQuery({
    queryKey: queryKeys.recipients(selectedCampaign?.id ?? null),
    queryFn: () => campaignApi.recipients(selectedCampaign!.id, { pageSize: 25 }),
    enabled: !!selectedCampaign,
    refetchInterval:
      selectedCampaign && ["QUEUED", "RUNNING", "CANCELLING"].includes(selectedCampaign.status)
        ? 5000
        : false,
  });

  const invalidateCampaigns = () => {
    queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0]).startsWith("campaigns."),
    });
  };

  const actionMutation = useMutation({
    mutationFn: async ({
      action,
      campaign,
    }: {
      action: "start" | "pause" | "resume" | "cancel" | "duplicate" | "archive";
      campaign: ApiCampaign;
    }) => {
      if (action === "start")
        return campaignApi.start(campaign.id, {
          confirm: true,
          expectedEligibleCount: campaign.counters.eligible || undefined,
        });
      if (action === "pause") return campaignApi.pause(campaign.id);
      if (action === "resume") return campaignApi.resume(campaign.id);
      if (action === "cancel") return campaignApi.cancel(campaign.id);
      if (action === "duplicate") return campaignApi.duplicate(campaign.id);
      return campaignApi.archive(campaign.id);
    },
    onSuccess: () => {
      invalidateCampaigns();
      setConfirming(null);
      toast.success("Campanha atualizada");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel atualizar a campanha.",
      ),
  });

  const campaigns = listQuery.data?.items ?? [];
  const detail = detailQuery.data ?? selectedCampaign;
  const recipients = recipientsQuery.data?.items ?? [];

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Campanhas"
          subtitle="Disparos WhatsApp com audiencia real, snapshot e fila confiavel."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => invalidateCampaigns()}>
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
              <Button variant="primary" size="sm" onClick={createModal.show}>
                <Plus className="h-3.5 w-3.5" /> Nova campanha
              </Button>
            </>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_220px]">
            <SearchInput
              value={filters.search}
              onChange={(search) => setFilters({ ...filters, search })}
              placeholder="Buscar por nome ou descricao"
            />
            <Select
              value={filters.status}
              onChange={(event) =>
                setFilters({ ...filters, status: event.target.value as CampaignFilters["status"] })
              }
            >
              <option value="ALL">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={filters.connectionId}
              onChange={(event) => setFilters({ ...filters, connectionId: event.target.value })}
            >
              <option value="">Todas as conexoes</option>
              {(connectionsQuery.data ?? []).map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(420px,1.05fr)]">
          <div className="space-y-3">
            {listQuery.isLoading ? (
              <Card>Carregando campanhas...</Card>
            ) : campaigns.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="h-5 w-5" />}
                title="Nenhuma campanha encontrada"
                action={
                  <Button size="sm" onClick={createModal.show}>
                    Criar campanha
                  </Button>
                }
              />
            ) : (
              <>
                {listQuery.isFetching && (
                  <p className="px-1 text-xs text-muted-foreground">Atualizando campanhas...</p>
                )}
                {campaigns.map((campaign) => (
                  <CampaignRow
                    key={campaign.id}
                    campaign={campaign}
                    selected={campaign.id === detail?.id}
                    onSelect={() => setSelectedId(campaign.id)}
                  />
                ))}
              </>
            )}
          </div>

          <CampaignDetail
            campaign={detail}
            recipients={recipients}
            loading={detailQuery.isLoading || recipientsQuery.isLoading}
            onAction={(action, campaign) => {
              if (action === "start" || action === "cancel") setConfirming({ action, campaign });
              else actionMutation.mutate({ action, campaign });
            }}
          />
        </div>

        <CampaignEditor
          open={createModal.open}
          onClose={createModal.hide}
          connections={connectionsQuery.data ?? []}
          onCreated={(campaign) => {
            createModal.hide();
            setFilters(DEFAULT_CAMPAIGN_FILTERS);
            setSelectedId(campaign.id);
            invalidateCampaigns();
          }}
        />

        <ConfirmDialog
          open={!!confirming}
          title={confirming?.action === "start" ? "Iniciar campanha?" : "Cancelar campanha?"}
          destructive={confirming?.action === "cancel"}
          description={confirming ? confirmationText(confirming.action, confirming.campaign) : ""}
          confirmLabel={
            confirming?.action === "start" ? "Confirmar inicio" : "Confirmar cancelamento"
          }
          onClose={() => setConfirming(null)}
          onConfirm={() => confirming && actionMutation.mutate(confirming)}
        />
      </PageContainer>
    </AppShell>
  );
}

function CampaignRow({
  campaign,
  selected,
  onSelect,
}: {
  campaign: ApiCampaign;
  selected: boolean;
  onSelect: () => void;
}) {
  const counters = campaign.counters;
  const progress = counters.eligible
    ? Math.round(
        ((counters.sent + counters.failed + counters.skipped + counters.cancelled) /
          counters.eligible) *
          100,
      )
    : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border bg-card p-4 text-left shadow-card transition hover:border-primary/60 ${selected ? "border-primary" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{campaign.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {campaign.connection?.name ?? "Conexao indisponivel"} ·{" "}
            {fmtDate(Date.parse(campaign.createdAt))}
          </p>
        </div>
        <Badge tone={STATUS_TONE[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <Metric label="Elegiveis" value={counters.eligible} />
        <Metric label="Enviadas" value={counters.sent} />
        <Metric label="Falhas" value={counters.failed} />
        <Metric label="Excluidas" value={counters.skipped + counters.cancelled} />
      </div>
    </button>
  );
}

function CampaignDetail({
  campaign,
  recipients,
  loading,
  onAction,
}: {
  campaign: ApiCampaign | null;
  recipients: Array<{
    id: string;
    contactName: string;
    customerName: string | null;
    phoneMasked: string;
    status: string;
    skipReason: string | null;
    attempts: number;
    lastErrorCode: string | null;
  }>;
  loading: boolean;
  onAction: (
    action: "start" | "pause" | "resume" | "cancel" | "duplicate" | "archive",
    campaign: ApiCampaign,
  ) => void;
}) {
  if (!campaign) return <Card>Selecione uma campanha.</Card>;
  const canStart = campaign.status === "DRAFT";
  const canPause = campaign.status === "QUEUED" || campaign.status === "RUNNING";
  const canResume = campaign.status === "PAUSED";
  const canCancel = ["SCHEDULED", "QUEUED", "RUNNING", "PAUSED"].includes(campaign.status);
  const canArchive = ["DRAFT", "COMPLETED", "CANCELLED", "FAILED"].includes(campaign.status);
  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <h2 className="truncate text-lg font-semibold">{campaign.name}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {campaign.description || "Sem descricao"}
          </p>
        </div>
        <Badge tone={STATUS_TONE[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MetricCard label="Elegiveis" value={campaign.counters.eligible} />
        <MetricCard label="Enviadas" value={campaign.counters.sent} />
        <MetricCard label="Falhas" value={campaign.counters.failed} />
        <MetricCard
          label="Excluidas"
          value={campaign.counters.skipped + campaign.counters.cancelled}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Info label="Connection" value={campaign.connection?.name ?? "Indisponivel"} />
        <Info
          label="Agendamento"
          value={
            campaign.scheduledAt ? fmtDate(Date.parse(campaign.scheduledAt)) : "Envio imediato"
          }
        />
        <Info label="Timezone" value={campaign.timezone} />
        <Info label="Audience" value={audienceLabel(campaign.audience)} />
      </div>

      <div className="mt-5 rounded-lg border border-border bg-surface-1 p-3">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Mensagem</p>
        <p className="whitespace-pre-wrap text-sm">{campaign.messageText}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {canStart && (
          <Button size="sm" onClick={() => onAction("start", campaign)}>
            <Play className="h-3.5 w-3.5" /> Iniciar
          </Button>
        )}
        {canPause && (
          <Button size="sm" variant="outline" onClick={() => onAction("pause", campaign)}>
            <Pause className="h-3.5 w-3.5" /> Pausar
          </Button>
        )}
        {canResume && (
          <Button size="sm" onClick={() => onAction("resume", campaign)}>
            <Play className="h-3.5 w-3.5" /> Retomar
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="destructive" onClick={() => onAction("cancel", campaign)}>
            <Square className="h-3.5 w-3.5" /> Cancelar
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onAction("duplicate", campaign)}>
          <Copy className="h-3.5 w-3.5" /> Duplicar
        </Button>
        {canArchive && (
          <Button size="sm" variant="ghost" onClick={() => onAction("archive", campaign)}>
            <Trash2 className="h-3.5 w-3.5" /> Arquivar
          </Button>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Recipients</p>
          {loading && <span className="text-xs text-muted-foreground">Atualizando...</span>}
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-surface-1 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Contato</th>
                <th className="px-3 py-2 text-left">Telefone</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Erro</th>
              </tr>
            </thead>
            <tbody>
              {recipients.length === 0 ? (
                <tr>
                  <td className="px-3 py-5 text-center text-muted-foreground" colSpan={4}>
                    Sem snapshot de recipients.
                  </td>
                </tr>
              ) : (
                recipients.map((recipient) => (
                  <tr key={recipient.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p>{recipient.contactName}</p>
                      <p className="text-xs text-muted-foreground">
                        {recipient.customerName ?? "Sem customer"}
                      </p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{recipient.phoneMasked}</td>
                    <td className="px-3 py-2">{recipient.status}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {recipient.skipReason ?? recipient.lastErrorCode ?? "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function CampaignEditor({
  open,
  onClose,
  connections,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  connections: ApiMessagingConnection[];
  onCreated: (campaign: ApiCampaign) => void;
}) {
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    messageText: "Ola, {{contact.name}}.",
    connectionId: "",
    audienceType: "ALL" as ApiCampaignAudience["type"],
    tagMatchMode: "ANY" as "ANY" | "ALL",
    tagIds: [] as string[],
    customerIds: [] as string[],
    contactIds: [] as string[],
    scheduledAt: "",
  });
  const [preview, setPreview] = React.useState<ApiCampaignPreview | null>(null);
  const [step, setStep] = React.useState(1);
  const [tagSearch, setTagSearch] = React.useState("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [contactSearch, setContactSearch] = React.useState("");
  const tagsQuery = useQuery({
    queryKey: ["campaigns.tags"],
    queryFn: crmApi.listTags,
    enabled: open,
  });
  const contactsQuery = useQuery({
    queryKey: ["campaigns.contacts"],
    queryFn: () => crmApi.listContacts({ pageSize: 100 }),
    enabled: open,
  });
  const customersQuery = useQuery({
    queryKey: ["campaigns.customers"],
    queryFn: () => crmApi.listCustomers({ pageSize: 100 }),
    enabled: open,
  });

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setPreview(null);
    setForm((current) => ({
      ...current,
      connectionId:
        current.connectionId ||
        connections.find((item) => item.providerType === "evolution" && item.status === "connected")
          ?.id ||
        "",
    }));
  }, [connections, open]);

  const audience = React.useMemo<ApiCampaignAudience>(
    () => ({
      type: form.audienceType,
      tagMatchMode: form.audienceType === "TAGS" ? form.tagMatchMode : null,
      tagIds: form.audienceType === "TAGS" ? form.tagIds : [],
      customerIds: form.audienceType === "CUSTOMERS" ? form.customerIds : [],
      contactIds: form.audienceType === "CONTACTS" ? form.contactIds : [],
    }),
    [form.audienceType, form.contactIds, form.customerIds, form.tagIds, form.tagMatchMode],
  );

  const previewMutation = useMutation({
    mutationFn: () => campaignApi.preview({ messageText: form.messageText, audience }),
    onSuccess: (data) => {
      setPreview(data);
      setStep(5);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel calcular a audiencia.",
      ),
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      const campaign = await campaignApi.create({
        name: form.name,
        description: form.description || null,
        messageText: form.messageText,
        connectionId: form.connectionId,
        audience,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (form.scheduledAt && preview) {
        return campaignApi.schedule(campaign.id, {
          confirm: true,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          expectedEligibleCount: preview.eligibleCount,
        });
      }
      return campaign;
    },
    onSuccess: (campaign) => {
      toast.success(form.scheduledAt ? "Campanha agendada" : "Campanha criada em rascunho");
      onCreated(campaign);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Nao foi possivel criar a campanha."),
  });

  const canPreview =
    form.name.trim().length >= 3 &&
    form.messageText.trim() &&
    form.connectionId &&
    audienceComplete(audience);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova campanha"
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
              Voltar
            </Button>
          )}
          {step < 4 && (
            <Button
              size="sm"
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance(step, form, audience)}
            >
              Proximo
            </Button>
          )}
          {step === 4 && (
            <Button
              size="sm"
              onClick={() => previewMutation.mutate()}
              disabled={!canPreview || previewMutation.isPending}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>
          )}
          {step === 5 && (
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={!preview || preview.eligibleCount < 1 || createMutation.isPending}
            >
              Confirmar
            </Button>
          )}
        </>
      }
    >
      <div className="mb-4 grid grid-cols-5 gap-2 text-center text-xs">
        {["Identificacao", "Mensagem", "Publico", "Conexao", "Revisao"].map((label, index) => (
          <span
            key={label}
            className={`rounded border px-2 py-1 ${step === index + 1 ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            {label}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="grid gap-4">
          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Descricao">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-4">
          <Field
            label="Texto WhatsApp"
            hint="Variaveis permitidas: {{contact.name}} e {{customer.name}}."
          >
            <Textarea
              rows={7}
              value={form.messageText}
              onChange={(event) => setForm({ ...form, messageText: event.target.value })}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            {num(form.messageText.length)} / 4000 caracteres
          </p>
        </div>
      )}
      {step === 3 && (
        <div className="grid gap-4">
          <Field label="Tipo de publico">
            <Select
              value={form.audienceType}
              onChange={(event) =>
                setForm({
                  ...form,
                  audienceType: event.target.value as ApiCampaignAudience["type"],
                })
              }
            >
              <option value="ALL">Todos os Contacts elegiveis</option>
              <option value="TAGS">Tags</option>
              <option value="CUSTOMERS">Customers</option>
              <option value="CONTACTS">Contacts manuais</option>
            </Select>
          </Field>
          {form.audienceType === "TAGS" && (
            <Selector
              title="Tags"
              mode={form.tagMatchMode}
              onMode={(tagMatchMode) => setForm({ ...form, tagMatchMode })}
              items={tagsQuery.data ?? []}
              search={tagSearch}
              onSearch={setTagSearch}
              selected={form.tagIds}
              onChange={(tagIds) => setForm({ ...form, tagIds })}
            />
          )}
          {form.audienceType === "CUSTOMERS" && (
            <CustomerSelector
              items={customersQuery.data?.items ?? []}
              search={customerSearch}
              onSearch={setCustomerSearch}
              selected={form.customerIds}
              onChange={(customerIds) => setForm({ ...form, customerIds })}
            />
          )}
          {form.audienceType === "CONTACTS" && (
            <ContactSelector
              items={contactsQuery.data?.items ?? []}
              search={contactSearch}
              onSearch={setContactSearch}
              selected={form.contactIds}
              onChange={(contactIds) => setForm({ ...form, contactIds })}
            />
          )}
        </div>
      )}
      {step === 4 && (
        <div className="grid gap-4">
          <Field label="Connection">
            <Select
              value={form.connectionId}
              onChange={(event) => setForm({ ...form, connectionId: event.target.value })}
            >
              <option value="">Selecione uma connection</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name} · {connection.providerType} · {connection.status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agendar para">
            <Input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })}
            />
          </Field>
          <Alert tone="warning" title="Confirmacao obrigatoria">
            O start imediato fica disponivel no detalhe apos o rascunho ser criado. Agendamento
            exige preview e confirmacao.
          </Alert>
        </div>
      )}
      {step === 5 && preview && (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-5">
            <MetricCard label="Elegiveis" value={preview.eligibleCount} />
            <MetricCard label="Invalidos" value={preview.invalidPhoneCount} />
            <MetricCard label="Opt-out" value={preview.optedOutCount} />
            <MetricCard label="Duplicados" value={preview.duplicateCount} />
            <MetricCard label="Bloqueados" value={preview.blockedCount} />
          </div>
          <div className="rounded-lg border border-border">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-surface-1 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Amostra</th>
                  <th className="px-3 py-2 text-left">Telefone</th>
                  <th className="px-3 py-2 text-left">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((item) => (
                  <tr key={item.contactId} className="border-t border-border">
                    <td className="px-3 py-2">{item.contactName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.phoneMasked}</td>
                    <td className="px-3 py-2 text-xs">{item.renderedMessage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Selector({
  title,
  mode,
  onMode,
  items,
  search,
  onSearch,
  selected,
  onChange,
}: {
  title: string;
  mode: "ANY" | "ALL";
  onMode: (mode: "ANY" | "ALL") => void;
  items: ApiTag[];
  search: string;
  onSearch: (value: string) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <Select
          className="w-28"
          value={mode}
          onChange={(event) => onMode(event.target.value as "ANY" | "ALL")}
        >
          <option value="ANY">ANY</option>
          <option value="ALL">ALL</option>
        </Select>
      </div>
      <FilterableCheckGrid
        items={items.map((item) => ({ id: item.id, label: item.nome }))}
        search={search}
        onSearch={onSearch}
        selected={selected}
        onChange={onChange}
      />
    </div>
  );
}

function CustomerSelector({
  items,
  search,
  onSearch,
  selected,
  onChange,
}: {
  items: ApiCustomer[];
  search: string;
  onSearch: (value: string) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <FilterableCheckGrid
      items={items.map((item) => ({ id: item.id, label: item.nome }))}
      search={search}
      onSearch={onSearch}
      selected={selected}
      onChange={onChange}
    />
  );
}

function ContactSelector({
  items,
  search,
  onSearch,
  selected,
  onChange,
}: {
  items: ApiContact[];
  search: string;
  onSearch: (value: string) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <FilterableCheckGrid
      items={items.map((item) => ({
        id: item.id,
        label: `${item.nome} · ${maskBrazilPhone(item.telefone)}`,
      }))}
      search={search}
      onSearch={onSearch}
      selected={selected}
      onChange={onChange}
    />
  );
}

function FilterableCheckGrid({
  items,
  search,
  onSearch,
  selected,
  onChange,
}: {
  items: Array<{ id: string; label: string }>;
  search: string;
  onSearch: (value: string) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <SearchInput value={search} onChange={onSearch} placeholder="Filtrar itens..." />
      <div className="grid max-h-64 gap-2 overflow-auto md:grid-cols-2">
        {filtered.map((item) => (
          <label
            key={item.id}
            className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={() => toggle(item.id)}
            />{" "}
            <span className="truncate">{item.label}</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground md:col-span-2">
            Nenhum item encontrado.
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-mono font-semibold">{num(value)}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold">{num(value)}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function audienceLabel(audience: ApiCampaignAudience) {
  if (audience.type === "ALL") return "Todos elegiveis";
  if (audience.type === "TAGS")
    return `Tags ${audience.tagMatchMode ?? "ANY"} (${audience.tagIds.length})`;
  if (audience.type === "CUSTOMERS") return `Customers (${audience.customerIds.length})`;
  return `Contacts (${audience.contactIds.length})`;
}

function audienceComplete(audience: ApiCampaignAudience) {
  if (audience.type === "ALL") return true;
  if (audience.type === "TAGS") return audience.tagIds.length > 0;
  if (audience.type === "CUSTOMERS") return audience.customerIds.length > 0;
  return audience.contactIds.length > 0;
}

function canAdvance(
  step: number,
  form: { name: string; messageText: string; connectionId: string },
  audience: ApiCampaignAudience,
) {
  if (step === 1) return form.name.trim().length >= 3;
  if (step === 2) return form.messageText.trim().length > 0 && form.messageText.length <= 4000;
  if (step === 3) return audienceComplete(audience);
  return !!form.connectionId;
}

function confirmationText(action: "start" | "cancel", campaign: ApiCampaign) {
  if (action === "cancel")
    return `Novos recipients de "${campaign.name}" nao serao iniciados. Mensagens ja enviadas permanecem no historico.`;
  return `${campaign.name} usara ${campaign.connection?.name ?? "a connection selecionada"} para ${num(campaign.counters.eligible)} recipients elegiveis.`;
}
