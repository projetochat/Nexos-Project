import { selectableConnections } from "@/lib/connection-options";
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
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
import { ClearFiltersButton } from "@/components/clear-filters-button";
import { DeletionConfirmDialog } from "@/components/deletion-confirm-dialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  InstanceFilterSelect,
  SearchInput,
  Select,
  SectionHeader,
  Textarea,
} from "@/components/ui-kit";
import { ConfirmDialog, Modal } from "@/components/modal";
import { CampaignSchedulePicker } from "@/components/campaign-schedule-picker";
import { MessageAttachmentMenu } from "@/components/message-attachment-menu";
import { MessageEmojiPicker } from "@/components/message-emoji-picker";
import { MessageVariablesMenu } from "@/components/message-variables-menu";
import { useDisclosure } from "@/hooks/use-disclosure";
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
  type QuickReplyAttachment,
} from "@/lib/trixus-api";
import { fmtDate, num } from "@/lib/format";
import { sortByOptionLabel } from "@/lib/sort-options";
import { showRequiredFieldsToast } from "@/lib/required-fields";
import { useSession } from "@/lib/session";

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
  COMPLETED: "Concluída",
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

const recipientStatusLabel: Record<string, string> = {
  PENDING: "Pendente",
  QUEUED: "Na fila",
  PROCESSING: "Enviando",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falhou",
  SKIPPED: "Não enviada",
  CANCELLED: "Cancelada",
};
const recipientReasonLabel: Record<string, string> = {
  INVALID_PHONE: "Telefone inválido",
  OPT_OUT: "Não autoriza mensagens",
  BLOCKED: "Contato bloqueado",
  DUPLICATE: "Contato duplicado",
  ARCHIVED_CONTACT: "Contato arquivado",
  TEMPLATE_RENDER_FAILED: "Não foi possível preparar a mensagem",
  CAMPAIGN_CANCELLED: "Campanha cancelada",
};
const campaignSteps = [
  {
    title: "Dados e mensagem",
    description: "Identifique a campanha e escreva a mensagem que os contatos receberão.",
  },
  { title: "Público", description: "Escolha os contatos que receberão a campanha." },
  { title: "Envio", description: "Selecione a instância e, se desejar, agende o envio." },
  { title: "Revisão", description: "Confira o público, a mensagem e o envio antes de salvar." },
];

function Page() {
  const queryClient = useQueryClient();
  const permissions = useSession((state) => state.user?.permissions ?? []);
  const canUpdate = permissions.includes("campaigns.update");
  const canCreate = permissions.includes("campaigns.create");
  const canStart = canUpdate;
  const canPause = canUpdate;
  const canCancel = canUpdate;
  const canDuplicate = canCreate;
  const canDelete = permissions.includes("campaigns.delete");
  const canReadRecipients = permissions.includes("campaigns.read");
  const createModal = useDisclosure();
  const [filters, setFilters] = React.useState<CampaignFilters>(DEFAULT_CAMPAIGN_FILTERS);
  const hasFilters = Boolean(
    filters.search.trim() || filters.status !== "ALL" || filters.connectionId,
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailMode, setDetailMode] = React.useState<"view" | "manage">("manage");
  const [confirming, setConfirming] = React.useState<null | {
    action: "start" | "cancel";
    campaign: ApiCampaign;
  }>(null);
  const [removingCampaign, setRemovingCampaign] = React.useState<ApiCampaign | null>(null);

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
  const sortedConnections = React.useMemo(
    () =>
      sortByOptionLabel(
        selectableConnections(connectionsQuery.data ?? []),
        (connection) => connection.name,
      ),
    [connectionsQuery.data],
  );
  const selectedCampaign =
    listQuery.data?.items.find((item) => item.id === selectedId) ??
    listQuery.data?.items[0] ??
    null;

  React.useEffect(() => {
    if (!selectedId && listQuery.data?.items[0]) {
      setSelectedId(listQuery.data.items[0].id);
      setDetailMode("manage");
    }
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
    enabled: !!selectedCampaign && canReadRecipients,
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
      action: "start" | "pause" | "resume" | "cancel" | "duplicate";
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
      return campaignApi.duplicate(campaign.id);
    },
    onSuccess: () => {
      invalidateCampaigns();
      setConfirming(null);
      toast.success("Campanha atualizada");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar a campanha.",
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
          subtitle="Crie, agende e acompanhe mensagens para seus contatos."
          subtitleClassName="hidden sm:block"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => invalidateCampaigns()}>
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
              {canCreate && (
                <Button variant="primary" size="sm" onClick={createModal.show}>
                  <Plus className="h-3.5 w-3.5" /> Nova campanha
                </Button>
              )}
            </>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_220px_auto]">
            <div className="col-span-2 lg:col-span-1">
              <Field label="Busca">
                <SearchInput
                  value={filters.search}
                  onChange={(search) => setFilters({ ...filters, search })}
                  placeholder="Buscar por nome ou descrição"
                />
              </Field>
            </div>
            <Field label="Situação">
              <Select
                value={filters.status}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    status: event.target.value as CampaignFilters["status"],
                  })
                }
              >
                <option value="ALL">Todos</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Instância">
              <InstanceFilterSelect
                value={filters.connectionId}
                allLabel="Todas"
                onChange={(connectionId) => setFilters({ ...filters, connectionId })}
                options={sortedConnections.map((connection) => ({
                  value: connection.id,
                  label: connection.name,
                  color: connection.color,
                }))}
              />
            </Field>
            {hasFilters && (
              <div className="flex items-end">
                <ClearFiltersButton onClick={() => setFilters(DEFAULT_CAMPAIGN_FILTERS)} />
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(420px,1.05fr)]">
          <div className="space-y-3">
            {listQuery.isLoading ? (
              <Card>Carregando campanhas...</Card>
            ) : listQuery.isError ? (
              <Alert tone="destructive" title="Não foi possível carregar as campanhas">
                {(listQuery.error as Error).message}
                <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>
                  Tentar novamente
                </Button>
              </Alert>
            ) : campaigns.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="h-5 w-5" />}
                title="Nenhuma campanha encontrada"
                action={
                  canCreate ? (
                    <Button size="sm" onClick={createModal.show}>
                      Criar campanha
                    </Button>
                  ) : undefined
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
                    canView={canReadRecipients}
                    onSelect={() => {
                      setSelectedId(campaign.id);
                      setDetailMode("manage");
                    }}
                    onView={() => {
                      setSelectedId(campaign.id);
                      setDetailMode("view");
                    }}
                  />
                ))}
              </>
            )}
          </div>

          <CampaignDetail
            campaign={detail}
            recipients={recipients}
            loading={detailQuery.isLoading || recipientsQuery.isLoading}
            canStartAction={detailMode === "manage" && canStart}
            canPauseAction={detailMode === "manage" && canPause}
            canCancelAction={detailMode === "manage" && canCancel}
            canDuplicateAction={detailMode === "manage" && canDuplicate}
            canReadRecipients={canReadRecipients}
            canDelete={detailMode === "manage" && canDelete}
            readOnly={detailMode === "view"}
            onAction={(action, campaign) => {
              if (action === "start" || action === "cancel") setConfirming({ action, campaign });
              else if (action === "remove") setRemovingCampaign(campaign);
              else actionMutation.mutate({ action, campaign });
            }}
          />
        </div>

        {canCreate && (
          <CampaignEditor
            open={createModal.open}
            onClose={createModal.hide}
            connections={sortedConnections}
            onCreated={(campaign) => {
              createModal.hide();
              setFilters(DEFAULT_CAMPAIGN_FILTERS);
              setSelectedId(campaign.id);
              setDetailMode("manage");
              invalidateCampaigns();
            }}
          />
        )}

        <ConfirmDialog
          open={!!confirming}
          title={confirming?.action === "start" ? "Iniciar Campanha?" : "Cancelar Campanha?"}
          destructive={confirming?.action === "cancel"}
          description={confirming ? confirmationText(confirming.action, confirming.campaign) : ""}
          confirmLabel={
            confirming?.action === "start" ? "Confirmar início" : "Confirmar cancelamento"
          }
          onClose={() => setConfirming(null)}
          onConfirm={() => confirming && actionMutation.mutate(confirming)}
        />
        <DeletionConfirmDialog
          open={!!removingCampaign}
          resourceKey={`campaign:${removingCampaign?.id ?? "none"}`}
          onOpenChange={(open) => {
            if (!open) setRemovingCampaign(null);
          }}
          loadImpact={(signal) => campaignApi.deletionImpact(removingCampaign!.id, signal)}
          onConfirm={({ snapshotToken, signal }) =>
            campaignApi.remove(removingCampaign!.id, snapshotToken, signal)
          }
          onDeleted={() => {
            const removedId = removingCampaign?.id;
            if (selectedId === removedId) setSelectedId(null);
            setRemovingCampaign(null);
            invalidateCampaigns();
            toast.success("Campanha excluída.");
          }}
          formatError={(error) =>
            error instanceof Error ? error.message : "Não foi possível excluir a campanha."
          }
        />
      </PageContainer>
    </AppShell>
  );
}

function CampaignRow({
  campaign,
  selected,
  canView,
  onSelect,
  onView,
}: {
  campaign: ApiCampaign;
  selected: boolean;
  canView: boolean;
  onSelect: () => void;
  onView: () => void;
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
    <div
      role="button"
      tabIndex={0}
      onDoubleClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onSelect();
      }}
      title="Clique duas vezes para visualizar a campanha"
      className={`w-full rounded-lg border bg-card p-4 text-left shadow-card transition hover:border-primary/60 ${selected ? "border-primary" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{campaign.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {campaign.connection?.name ?? "Conexão indisponivel"} ·{" "}
            {fmtDate(Date.parse(campaign.createdAt))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={STATUS_TONE[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
          {canView && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Visualizar campanha"
              aria-label="Visualizar campanha"
              className="h-8 w-8"
              onClick={(event) => {
                event.stopPropagation();
                onView();
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <Metric label="Elegíveis" value={counters.eligible} />
        <Metric label="Enviadas" value={counters.sent} />
        <Metric label="Falhas" value={counters.failed} />
        <Metric label="Excluídas" value={counters.skipped + counters.cancelled} />
      </div>
    </div>
  );
}

function CampaignDetail({
  campaign,
  recipients,
  loading,
  canStartAction,
  canPauseAction,
  canCancelAction,
  canDuplicateAction,
  canReadRecipients,
  canDelete,
  readOnly,
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
  canStartAction: boolean;
  canPauseAction: boolean;
  canCancelAction: boolean;
  canDuplicateAction: boolean;
  canReadRecipients: boolean;
  canDelete: boolean;
  readOnly: boolean;
  onAction: (
    action: "start" | "pause" | "resume" | "cancel" | "duplicate" | "remove",
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
            {campaign.description || "Sem descrição"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {readOnly && <Badge tone="info">Somente leitura</Badge>}
          <Badge tone={STATUS_TONE[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MetricCard label="Elegíveis" value={campaign.counters.eligible} />
        <MetricCard label="Enviadas" value={campaign.counters.sent} />
        <MetricCard label="Falhas" value={campaign.counters.failed} />
        <MetricCard
          label="Excluídas"
          value={campaign.counters.skipped + campaign.counters.cancelled}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Info label="Instância" value={campaign.connection?.name ?? "Indisponível"} />
        <Info
          label="Agendamento"
          value={
            campaign.scheduledAt ? fmtDate(Date.parse(campaign.scheduledAt)) : "Envio imediato"
          }
        />
        <Info label="Fuso horário" value={campaign.timezone} />
        <Info label="Público" value={audienceLabel(campaign.audience)} />
      </div>

      <div className="mt-5 rounded-lg border border-border bg-surface-1 p-3">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Mensagem</p>
        <p className="whitespace-pre-wrap text-sm">{campaign.messageText}</p>
        {campaign.attachment && (
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Anexo: {campaign.attachment.fileName}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {canStartAction && canStart && (
          <Button size="sm" onClick={() => onAction("start", campaign)}>
            <Play className="h-3.5 w-3.5" /> Iniciar
          </Button>
        )}
        {canPauseAction && canPause && (
          <Button size="sm" variant="outline" onClick={() => onAction("pause", campaign)}>
            <Pause className="h-3.5 w-3.5" /> Pausar
          </Button>
        )}
        {canPauseAction && canResume && (
          <Button size="sm" onClick={() => onAction("resume", campaign)}>
            <Play className="h-3.5 w-3.5" /> Retomar
          </Button>
        )}
        {canCancelAction && canCancel && (
          <Button size="sm" variant="destructive" onClick={() => onAction("cancel", campaign)}>
            <Square className="h-3.5 w-3.5" /> Cancelar
          </Button>
        )}
        {canDuplicateAction && (
          <Button
            size="sm"
            variant="outline"
            className="duplicate-action-button"
            onClick={() => onAction("duplicate", campaign)}
          >
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </Button>
        )}
        {canDelete && canArchive && (
          <Button
            size="sm"
            variant="ghost"
            className="trash-action h-8 rounded-lg sm:min-w-20"
            onClick={() => onAction("remove", campaign)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        )}
      </div>

      {canReadRecipients && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Destinatários</p>
            {loading && <span className="text-xs text-muted-foreground">Atualizando...</span>}
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-surface-1 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Contato</th>
                  <th className="px-3 py-2 text-left">Telefone</th>
                  <th className="px-3 py-2 text-left">Situação</th>
                  <th className="px-3 py-2 text-left">Erro</th>
                </tr>
              </thead>
              <tbody>
                {recipients.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-muted-foreground" colSpan={4}>
                      Os destinatários serão registrados ao iniciar ou agendar a campanha.
                    </td>
                  </tr>
                ) : (
                  recipients.map((recipient) => (
                    <tr key={recipient.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <p>{recipient.contactName}</p>
                        <p className="text-xs text-muted-foreground">
                          {recipient.customerName ?? "Sem cliente"}
                        </p>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{recipient.phoneMasked}</td>
                      <td className="px-3 py-2">
                        {recipientStatusLabel[recipient.status] ?? "Não informado"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {recipient.skipReason
                          ? (recipientReasonLabel[recipient.skipReason] ?? "Não enviado")
                          : recipient.lastErrorCode
                            ? "Falha no envio"
                            : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
    messageText: "Olá, {{contact.name}}.",
    connectionId: "",
    audienceType: "ALL" as ApiCampaignAudience["type"],
    tagMatchMode: "ANY" as "ANY" | "ALL",
    tagIds: [] as string[],
    customerIds: [] as string[],
    contactIds: [] as string[],
    scheduledAt: "",
    attachment: null as QuickReplyAttachment | null,
  });
  const [preview, setPreview] = React.useState<ApiCampaignPreview | null>(null);
  const [scheduleValid, setScheduleValid] = React.useState(true);
  const [attachmentBusy, setAttachmentBusy] = React.useState(false);
  const capabilitiesQuery = useQuery({
    queryKey: ["campaigns.capabilities"],
    queryFn: campaignApi.capabilities,
    enabled: open,
  });
  const attachmentsEnabled = capabilitiesQuery.data?.attachmentsEnabled === true;
  const messageInput = React.useRef<HTMLTextAreaElement>(null);
  const insertMessageText = (text: string) => {
    const input = messageInput.current;
    const start = input?.selectionStart ?? form.messageText.length;
    const end = input?.selectionEnd ?? start;
    const value = form.messageText.slice(0, start) + text + form.messageText.slice(end);
    if (value.length > 4000) return;
    setForm((current) => ({ ...current, messageText: value }));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + text.length, start + text.length);
    });
  };
  const [step, setStep] = React.useState(1);
  const [completedSteps, setCompletedSteps] = React.useState<number[]>([]);
  const [tagSearch, setTagSearch] = React.useState("");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [contactSearch, setContactSearch] = React.useState("");
  const [requiredErrors, setRequiredErrors] = React.useState<Record<string, boolean>>({});
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
  const sortedTags = React.useMemo(
    () => sortByOptionLabel(tagsQuery.data ?? [], (tag) => tag.nome),
    [tagsQuery.data],
  );
  const sortedContacts = React.useMemo(
    () =>
      sortByOptionLabel(
        (contactsQuery.data?.items ?? []).filter((contact) => contact.active !== false),
        (contact) => contact.nome,
      ),
    [contactsQuery.data?.items],
  );
  const sortedCustomers = React.useMemo(
    () => sortByOptionLabel(customersQuery.data?.items ?? [], (customer) => customer.nome),
    [customersQuery.data?.items],
  );

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setCompletedSteps([]);
    setPreview(null);
    setRequiredErrors({});
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
    mutationFn: () =>
      campaignApi.preview({
        messageText: form.messageText,
        audience,
        ...(form.attachment ? { attachment: form.attachment } : {}),
      }),
    onSuccess: (data) => {
      setPreview(data);
      setCompletedSteps([1, 2, 3]);
      setStep(4);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível calcular o público."),
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      if (
        form.scheduledAt &&
        (!scheduleValid || new Date(form.scheduledAt).getTime() <= Date.now())
      )
        throw new Error("Escolha uma data e um horário futuros válidos.");
      const campaign = await campaignApi.create({
        name: form.name,
        description: form.description || null,
        messageText: form.messageText,
        ...(form.attachment ? { attachment: form.attachment } : {}),
        connectionId: form.connectionId,
        audience,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (form.scheduledAt && preview) {
        try {
          return await campaignApi.schedule(campaign.id, {
            confirm: true,
            scheduledAt: new Date(form.scheduledAt).toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            expectedEligibleCount: preview.eligibleCount,
          });
        } catch (error) {
          toast.warning("Campanha salva em rascunho, mas não foi possível agendar.", {
            description: (error as Error).message,
          });
          return campaign;
        }
      }
      return campaign;
    },
    onSuccess: (campaign) => {
      toast.success(
        campaign.status === "SCHEDULED" ? "Campanha agendada" : "Campanha criada em rascunho",
      );
      onCreated(campaign);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a campanha."),
  });

  React.useEffect(() => {
    setRequiredErrors((current) => {
      const next = { ...current };
      if (form.name.trim().length >= 3) delete next.name;
      if (form.messageText.trim() || form.attachment) delete next.messageText;
      if (audienceComplete(audience)) delete next.audience;
      if (form.connectionId) delete next.connectionId;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [audience, form.connectionId, form.messageText, form.name, form.attachment]);

  const validateStep = (targetStep: number) => {
    const nextErrors: Record<string, boolean> = {};
    const pendingFields: string[] = [];
    if (targetStep === 1 && form.name.trim().length < 3) {
      nextErrors.name = true;
      pendingFields.push("Nome");
    }
    if (targetStep === 1 && !form.messageText.trim() && !form.attachment) {
      nextErrors.messageText = true;
      pendingFields.push("Texto WhatsApp");
    }
    if (targetStep === 2 && !audienceComplete(audience)) {
      nextErrors.audience = true;
      pendingFields.push("Público");
    }
    if (targetStep === 3 && !form.connectionId) {
      nextErrors.connectionId = true;
      pendingFields.push("Instância");
    }
    if (pendingFields.length) {
      setRequiredErrors((current) => ({ ...current, ...nextErrors }));
      showRequiredFieldsToast(pendingFields);
      return false;
    }
    return true;
  };

  const advance = () => {
    if (validateStep(step)) {
      setCompletedSteps((current) => [...new Set([...current, step])]);
      setStep(step + 1);
    }
  };

  const previewCampaign = () => {
    if (
      !scheduleValid ||
      (form.scheduledAt &&
        (!Number.isFinite(new Date(form.scheduledAt).getTime()) ||
          new Date(form.scheduledAt).getTime() <= Date.now()))
    ) {
      toast.error(
        "Escolha uma data e um horário futuros válidos, ou limpe o agendamento para criar um rascunho.",
      );
      return;
    }
    const pendingFields: string[] = [];
    if (form.name.trim().length < 3) pendingFields.push("Nome");
    if (!form.messageText.trim() && !form.attachment) pendingFields.push("Texto WhatsApp");
    if (!audienceComplete(audience)) pendingFields.push("Público");
    if (!form.connectionId) pendingFields.push("Instância");
    if (pendingFields.length) {
      setRequiredErrors({
        name: form.name.trim().length < 3,
        messageText: !form.messageText.trim() && !form.attachment,
        audience: !audienceComplete(audience),
        connectionId: !form.connectionId,
      });
      showRequiredFieldsToast(pendingFields);
      return;
    }
    previewMutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova campanha"
      size="xl"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={previewMutation.isPending || createMutation.isPending || attachmentBusy}
          >
            Cancelar
          </Button>
          {step > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(step - 1)}
              disabled={previewMutation.isPending || createMutation.isPending || attachmentBusy}
            >
              Voltar
            </Button>
          )}
          {step < 3 && (
            <Button size="sm" onClick={advance} disabled={attachmentBusy}>
              Continuar
            </Button>
          )}
          {step === 3 && (
            <Button
              size="sm"
              onClick={previewCampaign}
              disabled={previewMutation.isPending || attachmentBusy || !scheduleValid}
            >
              <Eye className="h-3.5 w-3.5" /> Revisar campanha
            </Button>
          )}
          {step === 4 && (
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={
                !preview || preview.eligibleCount < 1 || createMutation.isPending || attachmentBusy
              }
            >
              {createMutation.isPending
                ? "Salvando…"
                : form.scheduledAt
                  ? "Agendar campanha"
                  : "Criar rascunho"}
            </Button>
          )}
        </>
      }
    >
      <nav aria-label="Etapas da campanha" className="mb-5">
        <p className="mb-2 text-sm font-semibold" aria-live="polite">
          Etapa {step} de {campaignSteps.length} · {campaignSteps[step - 1].title}
        </p>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {campaignSteps.map((item, index) => {
            const number = index + 1;
            const active = step === number;
            const valid =
              number === 1
                ? form.name.trim().length >= 3 &&
                  Boolean(form.messageText.trim() || form.attachment)
                : number === 2
                  ? audienceComplete(audience)
                  : number === 3
                    ? Boolean(form.connectionId)
                    : Boolean(preview);
            const completed = completedSteps.includes(number) && valid;
            return (
              <li key={item.title} className="min-w-0">
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  aria-label={`${item.title}${completed ? " — configurado" : active ? " — etapa atual" : " — pendente"}`}
                  disabled={
                    (!completed && !active) || previewMutation.isPending || createMutation.isPending
                  }
                  onClick={() => setStep(number)}
                  className={`flex h-full w-full items-center gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default ${active ? "border-primary bg-primary/5 text-primary shadow-sm" : completed ? "border-primary/25 bg-card text-foreground hover:bg-surface-1" : "border-border text-muted-foreground"}`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${active || completed ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white" : "bg-surface-2"}`}
                  >
                    {completed ? <Check className="h-4 w-4" aria-hidden="true" /> : number}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{item.title}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {active ? "Em edição" : completed ? "Configurado" : "Pendente"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">{campaignSteps[step - 1].description}</p>
      </nav>

      {step === 1 && (
        <div className="grid gap-4">
          <Field label="Nome *">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              aria-invalid={Boolean(requiredErrors.name)}
            />
          </Field>
          <Field label="Descrição">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <Field
            label="Texto WhatsApp"
            hint="Variáveis disponíveis: {{contact.name}} e {{customer.name}}."
          >
            <div
              className={`overflow-hidden rounded-xl border bg-card focus-within:border-primary/50 ${requiredErrors.messageText ? "border-destructive" : "border-border"}`}
            >
              <textarea
                ref={messageInput}
                rows={5}
                maxLength={4000}
                value={form.messageText}
                disabled={createMutation.isPending || previewMutation.isPending}
                onChange={(event) => setForm({ ...form, messageText: event.target.value })}
                aria-label="Texto WhatsApp"
                aria-required={!form.attachment}
                aria-invalid={Boolean(requiredErrors.messageText)}
                className="block min-h-24 w-full resize-y border-0 bg-transparent px-3 py-3 text-sm outline-none"
                placeholder="Escreva a mensagem da campanha"
              />
              <div className="flex flex-wrap items-center gap-1.5 overflow-visible rounded-b-lg border-t border-border bg-surface-1 px-2 py-1.5">
                <MessageEmojiPicker
                  disabled={createMutation.isPending || previewMutation.isPending}
                  onSelect={insertMessageText}
                />
                <MessageVariablesMenu
                  disabled={createMutation.isPending || previewMutation.isPending}
                  variables={[
                    { token: "{{contact.name}}", description: "Nome do contato" },
                    { token: "{{customer.name}}", description: "Nome do cliente" },
                  ]}
                  onSelect={insertMessageText}
                />
                <MessageAttachmentMenu
                  variant="segmented"
                  attachment={form.attachment}
                  disabled={
                    !attachmentsEnabled || createMutation.isPending || previewMutation.isPending
                  }
                  fileInputLabel="Anexar arquivo à campanha"
                  onLoadingChange={setAttachmentBusy}
                  onAttachment={(attachment) => setForm((current) => ({ ...current, attachment }))}
                  onRemove={() => setForm((current) => ({ ...current, attachment: null }))}
                />
              </div>
            </div>
          </Field>
          {!attachmentsEnabled && (
            <p className="text-xs text-muted-foreground">
              {capabilitiesQuery.isError
                ? "Não foi possível verificar a disponibilidade dos anexos."
                : "O envio de anexos ainda não está habilitado neste ambiente."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {num(form.messageText.length)} / 4000 caracteres. Escreva uma mensagem ou inclua um
            anexo.
          </p>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Tipo de público</legend>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {(
                [
                  ["ALL", "Todos os contatos", "Contatos aptos para receber mensagens."],
                  ["TAGS", "Por etiquetas", "Contatos com as etiquetas escolhidas."],
                  ["CUSTOMERS", "Por clientes", "Contatos dos clientes escolhidos."],
                  ["CONTACTS", "Selecionar contatos", "Escolha os contatos individualmente."],
                ] as const
              ).map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={form.audienceType === value}
                  onClick={() => setForm((current) => ({ ...current, audienceType: value }))}
                  className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${form.audienceType === value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-surface-1"}`}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {form.audienceType === "TAGS" && (
            <div
              className={`rounded-lg border p-1 ${requiredErrors.audience ? "border-destructive" : "border-transparent"}`}
            >
              <Selector
                title="Etiquetas"
                mode={form.tagMatchMode}
                onMode={(tagMatchMode) => setForm({ ...form, tagMatchMode })}
                items={sortedTags}
                search={tagSearch}
                onSearch={setTagSearch}
                selected={form.tagIds}
                onChange={(tagIds) => setForm({ ...form, tagIds })}
              />
            </div>
          )}
          {form.audienceType === "CUSTOMERS" && (
            <div
              className={`rounded-lg border p-1 ${requiredErrors.audience ? "border-destructive" : "border-transparent"}`}
            >
              <CustomerSelector
                items={sortedCustomers}
                search={customerSearch}
                onSearch={setCustomerSearch}
                selected={form.customerIds}
                onChange={(customerIds) => setForm({ ...form, customerIds })}
              />
            </div>
          )}
          {form.audienceType === "CONTACTS" && (
            <div
              className={`rounded-lg border p-1 ${requiredErrors.audience ? "border-destructive" : "border-transparent"}`}
            >
              <ContactSelector
                items={sortedContacts}
                search={contactSearch}
                onSearch={setContactSearch}
                selected={form.contactIds}
                onChange={(contactIds) => setForm({ ...form, contactIds })}
              />
            </div>
          )}
        </div>
      )}
      {step === 3 && (
        <div className="grid gap-4">
          <Field label="Instância de envio *">
            <Select
              value={form.connectionId}
              onChange={(event) => setForm({ ...form, connectionId: event.target.value })}
              aria-invalid={Boolean(requiredErrors.connectionId)}
            >
              <option value="">Selecione uma instância</option>
              {selectableConnections(connections).map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name} ·{" "}
                  {
                    {
                      connected: "Conectada",
                      disconnected: "Desconectada",
                      connecting: "Conectando",
                      error: "Com erro",
                      removed: "Removida",
                    }[connection.status]
                  }
                </option>
              ))}
            </Select>
          </Field>
          <CampaignSchedulePicker
            value={form.scheduledAt}
            onChange={(scheduledAt) => setForm((current) => ({ ...current, scheduledAt }))}
            onValidityChange={setScheduleValid}
            disabled={previewMutation.isPending || createMutation.isPending}
          />
          <Alert tone="warning" title="Confirmação obrigatória">
            Sem uma data, a campanha será salva como rascunho. Para enviar, clique em Iniciar nos
            detalhes. Com uma data, o envio será agendado após a revisão.
          </Alert>
        </div>
      )}
      {step === 4 && preview && (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            <Info label="Campanha" value={form.name} />
            <Info label="Público" value={audienceLabel(audience)} />
            <Info
              label="Instância"
              value={
                connections.find((item) => item.id === form.connectionId)?.name ?? "Indisponível"
              }
            />
            <Info
              label="Envio"
              value={
                form.scheduledAt
                  ? fmtDate(Date.parse(form.scheduledAt))
                  : "Rascunho — envio manual após salvar"
              }
            />
          </div>
          <div className="rounded-lg border border-border bg-surface-1 p-3">
            <p className="mb-2 text-sm font-semibold">Mensagem que será enviada</p>
            <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">
              {form.messageText}
            </p>
            {form.attachment && (
              <p className="mt-2 break-all text-sm">
                Anexo: {form.attachment.fileName} · {num(form.attachment.size)} bytes
              </p>
            )}
          </div>
          {preview.eligibleCount < 1 && (
            <Alert tone="warning" title="Nenhum contato apto para envio">
              Volte à etapa Público e ajuste a seleção antes de salvar.
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <MetricCard label="Elegíveis" value={preview.eligibleCount} />
            <MetricCard label="Telefones inválidos" value={preview.invalidPhoneCount} />
            <MetricCard label="Não autorizam mensagens" value={preview.optedOutCount} />
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <Select
          className="w-full sm:w-52"
          value={mode}
          onChange={(event) => onMode(event.target.value as "ANY" | "ALL")}
        >
          <option value="ANY">Qualquer etiqueta</option>
          <option value="ALL">Todas as etiquetas</option>
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
      <SearchInput value={search} onChange={onSearch} placeholder="Buscar na lista..." />
      <p className="text-xs text-muted-foreground">
        {num(selected.length)} selecionado(s). A busca apenas filtra a lista; mantém suas seleções.
      </p>
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
  if (audience.type === "ALL") return "Todos os contatos elegíveis";
  if (audience.type === "TAGS")
    return `${audience.tagMatchMode === "ALL" ? "Todas as etiquetas" : "Qualquer etiqueta"} (${audience.tagIds.length})`;
  if (audience.type === "CUSTOMERS") return `Clientes (${audience.customerIds.length})`;
  return `Contatos selecionados (${audience.contactIds.length})`;
}

function audienceComplete(audience: ApiCampaignAudience) {
  if (audience.type === "ALL") return true;
  if (audience.type === "TAGS") return audience.tagIds.length > 0;
  if (audience.type === "CUSTOMERS") return audience.customerIds.length > 0;
  return audience.contactIds.length > 0;
}

function confirmationText(action: "start" | "cancel", campaign: ApiCampaign) {
  if (action === "cancel")
    return `Novos envios de "${campaign.name}" não serão iniciados. Mensagens já enviadas permanecem no histórico.`;
  return `${campaign.name} usará ${campaign.connection?.name ?? "a instância selecionada"} para ${num(campaign.counters.eligible)} destinatários elegíveis.`;
}
