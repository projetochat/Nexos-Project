import type { Role, SessionUser } from "@/lib/session";

const ACCESS_KEY = "trixus.api.accessToken";
const REFRESH_KEY = "trixus.api.refreshToken";
const TENANT_KEY = "trixus.api.tenant";
const IMPERSONATION_KEY = "trixus.api.impersonation";
let refreshPromise: Promise<boolean> | null = null;
let sessionAlreadyCleared = false;

type ApiRoleKey = "tenant_admin" | "supervisor" | "agent" | string;

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    presentationName?: string | null;
    avatarUrl?: string | null;
    roleId: string;
    roleKey: ApiRoleKey;
    platformRole: "USER" | "ADMIN" | "SUPPORT" | "READONLY";
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  membership: {
    id: string;
    role: string;
    roleId: string;
  };
  permissions: string[];
};

type MeResponse = {
  user: LoginResponse["user"] & { roleName: string };
  tenant: LoginResponse["tenant"];
  membership: LoginResponse["membership"];
  permissions: string[];
};

export type TrixusHealth = {
  ok: boolean;
  service: string;
  database: "up" | "down";
  redis: "up" | "down";
  timestamp: string;
};

export class TrixusApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "TrixusApiError";
  }
}

export type ApiDepartment = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  memberCount?: number;
  openConversationCount?: number;
};

export type ApiRole = {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description: string | null;
  metadata: unknown;
  system: boolean;
  createdAt?: string;
  updatedAt?: string;
  permissionIds: string[];
};

export type ApiUserMembership = {
  id: string;
  status: "ACTIVE" | "DISABLED" | "INVITED";
  presentationName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  user: {
    id: string;
    email: string;
    name: string;
    presentationName?: string | null;
    avatarUrl?: string | null;
    status: "ACTIVE" | "DISABLED";
    platformRole: "USER" | "ADMIN" | "SUPPORT" | "READONLY";
  };
  role: {
    id: string;
    key: string;
    name: string;
  };
  departments: ApiDepartment[];
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ApiCustomer = {
  id: string;
  tenantId: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  notas: string | null;
  contato_responsavel: string | null;
  cor: string;
  contactCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ApiTag = {
  id: string;
  nome: string;
  cor: string;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  conversationCount?: number;
  customerCount?: number;
};

export type ApiContactCatalog = {
  id: string;
  tenantId: string;
  nome: string;
  descricao: string | null;
  cor: string;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ApiContactCustomField = {
  id: string;
  tenantId: string;
  label: string;
  type: "text" | "number" | "checkbox" | "list" | "date";
  required: boolean;
  mask: string | null;
  note: string | null;
  tabName: string;
  groupName: string;
  options: string[];
  position: number;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
};
export type ApiContactInstanceOption = {
  id: string;
  value: string;
  name: string;
  color: string | null;
  externalReference?: string | null;
  ownerPhone?: string | null;
  instanceName?: string | null;
  status?: "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "ERROR" | "REMOVED" | string;
};

export type ApiContact = {
  id: string;
  tenantId: string;
  nome: string;
  telefone: string;
  normalizedPhone: string;
  avatar_url: string | null;
  customer_id: string | null;
  email: string | null;
  departamento: string | null;
  departmentId: string | null;
  contactDepartmentId: string | null;
  contactDepartment: Pick<ApiContactCatalog, "id" | "nome" | "cor"> | null;
  contactProfileId: string | null;
  contactProfile: Pick<ApiContactCatalog, "id" | "nome" | "cor"> | null;
  nivel_gerencia: "Colaborador" | "Supervisor" | "Gerente" | "Diretoria" | null;
  instancia: string | null;
  instanceIds: string[];
  customer: Pick<ApiCustomer, "id" | "nome" | "cor"> | null;
  tags: ApiTag[];
  customFields: Record<string, string>;
  customFieldValues?: Array<{ fieldId: string; label: string; type: string; value: string | null }>;
  createdAt?: string;
  updatedAt?: string;
  lifecycle?: "created" | "restored";
};

export type ApiGroupContactPickerItem = Pick<
  ApiContact,
  "id" | "nome" | "telefone" | "normalizedPhone" | "avatar_url"
>;

export type ApiAgendaImportContact = {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  avatarUrl: string | null;
};

export type ApiAgendaImportIgnoredContact = {
  name: string;
  phone: string;
  normalizedPhone: string | null;
  reason: string;
  importable: boolean;
};

export type ApiAgendaImportPreview = {
  total: number;
  skipped: number;
  items: ApiAgendaImportContact[];
  ignoredItems: ApiAgendaImportIgnoredContact[];
};

export type ApiConversationStatus = "aberta" | "em_andamento" | "aguardando" | "fechada";

export type ApiConversation = {
  id: string;
  tenantId: string;
  contact_id: string;
  connection_id: string | null;
  department_id: string | null;
  assigned_membership_id: string | null;
  agent_id: string | null;
  status: ApiConversationStatus;
  is_group: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  protocolo: string | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  inbox_archived_at: string | null;
  is_lead: boolean;
  contact: ApiContact | null;
  department: { id: string; nome: string; cor: string; descricao: string | null } | null;
  agent: { id: string; membershipId: string; nome: string; email: string } | null;
  connection: {
    id: string;
    name: string;
    providerType: "development" | "evolution" | "meta_cloud";
    status: "disconnected" | "connecting" | "connected" | "error";
    externalReference: string | null;
    color: string | null;
  } | null;
};

export type ApiWhatsappGroupParticipant = {
  id: string;
  name: string;
  phone: string | null;
  externalParticipantId: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  active: boolean;
  lastSeenAt: string;
};

export type ApiWhatsappGroup = {
  id: string;
  tenantId: string;
  conversationId: string;
  name: string;
  externalChatId: string | null;
  imageUrl: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  participantsCount: number;
  connection: {
    id: string;
    name: string;
    externalReference: string | null;
    status: string;
    color: string | null;
  } | null;
  participants: ApiWhatsappGroupParticipant[];
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  warnings?: string[];
};

export type QuickReplyAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};
export type QuickReplyMessage = { text: string; attachment?: QuickReplyAttachment | null };

export type ApiQuickReply = {
  messages?: QuickReplyMessage[] | null;
  intervalSeconds?: number;
  id: string;
  tenantId: string;
  title: string;
  atalho: string;
  shortcut: string;
  texto: string;
  content: string;
  attachmentFileName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
  attachmentDataUrl?: string | null;
  departmentId: string | null;
  department: { id: string; nome: string; cor: string } | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  close_on_send: boolean;
  closeOnSend?: boolean;
};

export type ApiMessage = {
  id: string;
  tenantId: string;
  conversation_id: string;
  direction: "inbound" | "outbound" | "system";
  sender: "contact" | "agent";
  author_id: string | null;
  author_membership_id: string | null;
  author_name?: string | null;
  content: string;
  interactive_data?: {
    kind: "list";
    buttonText: string;
    sections: Array<{
      title?: string | null;
      options: Array<{ title: string; description?: string | null }>;
    }>;
  } | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  type: "text" | "image" | "audio" | "voice" | "video" | "document" | "system";
  status: "pending" | "created" | "queued" | "sending" | "sent" | "failed" | "delivered" | "read";
  provider_message_id?: string | null;
  provider_chat_id?: string | null;
  participant?: {
    external_id: string | null;
    name: string | null;
    phone: string | null;
    lid: string | null;
  } | null;
  quoted?: {
    message_id: string | null;
    provider_message_id: string;
    content_preview: string | null;
    type: ApiMessage["type"] | null;
    media_data?: {
      state?: "pending" | "downloading" | "ready" | "failed";
      mime_type: string | null;
      file_name: string | null;
      size: number | null;
      caption: string | null;
      width: number | null;
      height: number | null;
      checksum: string | null;
      duration_ms?: number | null;
      download_url?: string | null;
      inline_url?: string | null;
    } | null;
  } | null;
  media_data: {
    state?: "pending" | "downloading" | "ready" | "failed";
    mime_type: string | null;
    file_name: string | null;
    size: number | null;
    caption: string | null;
    width: number | null;
    height: number | null;
    checksum: string | null;
    download_url?: string;
    inline_url?: string;
  } | null;
  duration_ms: number | null;
  reactions?: Array<{
    id: string;
    emoji: string;
    actor_type: string;
    actor_membership_id: string | null;
    external_participant_id: string | null;
    external_participant_name: string | null;
    created_at: string;
    removed_at?: string | null;
  }>;
  queued_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
};

export type MessagePage = {
  items: ApiMessage[];
  nextCursor: string | null;
};

export type ConversationCounts = {
  ativas: number;
  standby: number;
  fila: number;
  leads: number;
};

export type ApiLead = {
  id: string;
  tenantId: string;
  status: "new" | "queued" | "assigned" | "converted" | "discarded";
  source: "whatsapp" | "manual" | "campaign" | "bot";
  firstMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    nome: string;
    telefone: string;
    customer: { id: string; nome: string } | null;
  };
  conversation: {
    id: string;
    protocolo: string | null;
    status: string;
  };
  department: { id: string; nome: string; cor: string } | null;
  assignee: { membershipId: string; id: string; nome: string; email: string } | null;
};

export type ApiNotification = {
  id: string;
  kind: string;
  status: "unread" | "read" | "archived";
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type ApiAutomationRule = {
  id: string;
  name: string;
  status: "active" | "disabled";
  actionType: "bot_reply" | "assign_department" | "notify_team";
  matchText: string;
  responseText: string | null;
  department: { id: string; nome: string; cor: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiServiceHoursRow = { day: string; active: boolean; start: string; end: string };

export type ApiMessagingConnection = {
  serviceHours?: ApiServiceHoursRow[] | null;
  timezone?: string;
  id: string;
  tenantId: string;
  name: string;
  providerType: "development" | "evolution" | "meta_cloud";
  status: "disconnected" | "connecting" | "connected" | "error" | "removed";
  externalReference: string | null;
  color?: string | null;
  logoUrl?: string | null;
  welcomeEnabled?: boolean;
  welcomeNewMessage?: string | null;
  welcomeExistingMessage?: string | null;
  absenceEnabled?: boolean;
  absenceMessage?: string | null;
  notes?: string | null;
  importHistoryEnabled?: boolean;
  importHistoryStartDate?: string | null;
  importGroupsEnabled?: boolean;
  importGroupsStartDate?: string | null;
  ownerPhoneMasked?: string | null;
  ownerPhone?: string | null;
  archivedAt?: string | null;
  provider?: {
    existsInProvider?: boolean;
    webhookUrl?: string | null;
    reason?: string;
  };
  createdAt: string;
  updatedAt: string;
  qrCodeBase64?: string | null;
};

export type ApiMessagingHistoryImport = {
  id: string;
  kind: "DIRECT" | "GROUP";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL_FAILED" | "FAILED";
  startDate: string;
  chatsProcessed: number;
  messagesImported: number;
  messagesSkipped: number;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type ApiWebhookAudit = {
  instanceName: string;
  urlCorrect: boolean;
  messagesUpsertPresent: boolean;
  secretBackendConfigured: boolean;
  secretEvolutionConfigured: boolean;
  secretMatch: boolean;
};

export type ApiCompanyProfile = {
  name: string;
  legalName: string | null;
  document: string | null;
  timezone: string;
  locale: string;
  accessEmail: string | null;
  responsibleName: string | null;
  presentationName: string | null;
  administratorAvatarUrl: string | null;
  canManageAdministratorCredentials: boolean;
};

export type ApiFinancialPayment = {
  paymentId: string;
  subscriptionId: string;
  service: string;
  referenceAt: string;
  paidAt: string | null;
  amountCents: number;
  currency: string;
  status: "DRAFT" | "OPEN" | "PAID" | "VOID" | "OVERDUE";
};

export type ApiTicketStatus =
  | "ABERTO"
  | "EM_ANDAMENTO"
  | "AGUARDANDO"
  | "RESOLVIDO"
  | "FECHADO"
  | "CANCELADO";

export type ApiTicketPriority = "BAIXA" | "NORMAL" | "ALTA" | "URGENTE";
export type ApiTicketCategory = "SUPORTE" | "DEV" | "FINANCEIRO" | "OPERACIONAL";

export type ApiTicket = {
  id: string;
  protocol: string;
  title: string;
  descriptionText?: string;
  descriptionHtmlSanitized?: string;
  status: ApiTicketStatus;
  priority: ApiTicketPriority;
  category: ApiTicketCategory;
  department: { id: string; name: string; color: string };
  requesterContact: { id: string; name: string; email: string | null; phone: string } | null;
  customer: { id: string; name: string; email: string | null; phone: string | null } | null;
  conversation: { id: string; protocol: string | null; status: string } | null;
  assignedMembership: { id: string; user: { id: string; name: string; email: string } } | null;
  createdByMembership: { id: string; user: { id: string; name: string; email: string } };
  commentsCount: number;
  attachmentsCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  archivedAt?: string | null;
};

export type ApiTicketComment = {
  id: string;
  bodyText: string;
  bodyHtmlSanitized: string | null;
  internal: boolean;
  createdAt: string;
  updatedAt: string;
  authorMembership: { id: string; user: { id: string; name: string; email: string } };
};

export type ApiTicketAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: "PENDING" | "READY" | "DELETED" | "REJECTED";
  scanStatus: "NOT_SCANNED" | "CLEAN" | "BLOCKED";
  createdAt: string;
  deletedAt: string | null;
};

export type ApiCampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "CANCELLING"
  | "CANCELLED"
  | "COMPLETED"
  | "FAILED";

export type ApiCampaignAudience = {
  type: "ALL" | "TAGS" | "CUSTOMERS" | "CONTACTS";
  tagMatchMode?: "ANY" | "ALL" | null;
  tagIds: string[];
  customerIds: string[];
  contactIds: string[];
};

export type ApiCampaignCounters = {
  campaignId: string;
  status: ApiCampaignStatus;
  total: number;
  eligible: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  cancelled: number;
  updatedAt: string;
};

export type ApiCampaign = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: ApiCampaignStatus;
  messageType: "TEXT";
  messageText: string;
  connectionId: string;
  connection: Pick<ApiMessagingConnection, "id" | "name" | "providerType" | "status"> | null;
  audience: ApiCampaignAudience;
  timezone: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  version: number;
  counters: ApiCampaignCounters;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiCampaignPreview = {
  eligibleCount: number;
  invalidPhoneCount: number;
  optedOutCount: number;
  duplicateCount: number;
  blockedCount: number;
  sample: Array<{
    contactId: string;
    contactName: string;
    customerName: string | null;
    phoneMasked: string;
    renderedMessage: string;
  }>;
};

export type ApiCampaignRecipient = {
  id: string;
  contactId: string;
  contactName: string;
  customerName: string | null;
  phoneMasked: string;
  status: string;
  skipReason: string | null;
  messageId: string | null;
  attempts: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperationalPeriod =
  | "today"
  | "yesterday"
  | "week"
  | "previous_week"
  | "month"
  | "previous_month"
  | "year"
  | "previous_year"
  | "7d"
  | "30d"
  | "custom";

export type OperationalFilters = {
  period: OperationalPeriod;
  start?: string;
  end?: string;
  q?: string;
  departmentId?: string;
  assignedMembershipId?: string;
  status?: ApiConversationStatus;
  customerId?: string;
  connectionId?: string;
  contactId?: string;
};

export type ApiOperationalKpi = {
  value: number | null;
  previous: number | null;
  changePercent: number | null;
};

export type ApiOperationsChartItem = {
  nome: string;
  cor?: string;
  total: number;
  resolvidas?: number;
  percentual?: number;
};

export type ApiOperationsHourlyMessage = {
  hora: string;
  recebidas: number;
  enviadas: number;
  total: number;
};

export type ApiOperationsDashboard = {
  range: { start: string; end: string };
  kpis: Record<string, ApiOperationalKpi>;
  charts: {
    byDepartment: ApiOperationsChartItem[];
    byAgent: ApiOperationsChartItem[];
    byCustomer: ApiOperationsChartItem[];
    byConnection: ApiOperationsChartItem[];
    byTag: ApiOperationsChartItem[];
    messagesByHour: ApiOperationsHourlyMessage[];
  };
  recent: ApiConversation[];
};

export type ApiOperationsReport = {
  range: { start: string; end: string };
  kpis: Record<string, number | null>;
  charts: ApiOperationsDashboard["charts"];
  conversations: PaginatedResponse<ApiConversation>;
};

export type ApiConversationTimeline = {
  conversation: ApiConversation;
  items: Array<{
    at: string;
    event: string;
    origin: string;
    user: string | null;
    description: string;
  }>;
};

export type ApiOperationalQueue = {
  id: string;
  nome: string;
  cor: string;
  prioridade: "alta" | "normal" | "baixa";
  quantidade: number;
  leads: number;
  conversasAtivas: number;
  conversasEncerradas: number;
  transferencias: number;
  atendentes: number;
  capacidade: number;
  sla: number;
  tempoMedioMinutos: number | null;
};

type ListParams = {
  q?: string;
  page?: number;
  pageSize?: number;
};

type ListContactsParams = ListParams & {
  linked?: "all" | "linked" | "unlinked";
  instance?: string;
  department?: string;
  customerId?: string;
  tagId?: string;
};

type CustomerPayload = {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  responsibleContactName?: string | null;
  color?: string;
};

type ContactPayload = {
  name: string;
  phone: string;
  email?: string | null;
  customerId?: string | null;
  departmentId?: string | null;
  contactDepartmentId?: string | null;
  contactProfileId?: string | null;
  departmentName?: string | null;
  companyRole?: "COLABORADOR" | "SUPERVISOR" | "GERENTE" | "DIRETORIA" | null;
  instance?: string | null;
  instanceIds?: string[];
  tagIds?: string[];
  avatarUrl?: string | null;
  customFields?: Record<string, string | number | boolean | null>;
};

type ListConversationsParams = ListParams & {
  tab?: "ativas" | "standby" | "fila" | "leads";
  source?: "todos" | "humano" | "bots";
  onlyUnread?: boolean;
  customerId?: string;
  instance?: string;
  contactId?: string;
  status?: ApiConversationStatus;
  departmentId?: string;
  sort?: "lastMessageAt" | "createdAt" | "status";
  direction?: "asc" | "desc";
};

type ConversationPayload = {
  contactId: string;
  departmentId?: string | null;
  connectionId?: string | null;
  assignToSelf?: boolean;
  isGroup?: boolean;
  firstMessagePreview?: string | null;
};

const roleMap: Record<string, Role> = {
  platform_admin: "super_admin",
  tenant_admin: "admin",
  supervisor: "supervisor",
  agent: "operator",
};

export function trixusApiBaseUrl() {
  return import.meta.env.VITE_TRIXUS_API_URL || "http://localhost:3001/api";
}

export function trixusRealtimeBaseUrl() {
  return trixusApiBaseUrl().replace(/\/api\/?$/, "");
}

export function getTrixusAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export async function ensureTrixusAccessToken() {
  const token = getTrixusAccessToken();
  if (token) return token;
  return (await refreshAccessToken()) ? getTrixusAccessToken() : null;
}

export async function refreshTrixusAccessToken() {
  return (await refreshAccessToken()) ? getTrixusAccessToken() : null;
}

export async function loginWithTrixusApi(email: string, password: string, tenantSlug?: string) {
  const body: { email: string; password: string; tenantSlug?: string } = { email, password };
  if (tenantSlug) body.tenantSlug = tenantSlug;
  const response = await fetchTrixus("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await authErrorFromResponse(response);

  const data = (await response.json()) as LoginResponse;
  storeTrixusSession(data);
  return loginResponseToSessionUser(data);
}

export async function hydrateWithTrixusApi() {
  const data = await apiRequest<MeResponse>("/auth/me");
  return {
    id: data.user.id,
    nome: data.user.name,
    email: data.user.email,
    role: roleMap[data.user.roleKey] ?? "operator",
    empresaId: data.tenant.id,
    empresaNome: data.tenant.name,
    avatarUrl: data.user.avatarUrl ?? undefined,
    permissions: data.permissions,
  } satisfies SessionUser;
}

async function hydrateWithPlatformToken(stored: StoredImpersonation) {
  localStorage.setItem(ACCESS_KEY, stored.actorAccessToken);
  localStorage.setItem(REFRESH_KEY, stored.actorRefreshToken);
  localStorage.setItem(
    TENANT_KEY,
    JSON.stringify({ id: "platform", slug: "platform", name: "Trixus Platform" }),
  );
  return {
    id: "platform",
    nome: "Platform",
    email: "",
    role: "super_admin",
    empresaId: "platform",
    empresaNome: "Trixus Platform",
    permissions: [],
  } satisfies SessionUser;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await fetchTrixus(path, init, true);
  if (response.status === 401 && canRefresh(path) && (await refreshAccessToken())) {
    response = await fetchTrixus(path, init, true);
  }
  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function fetchTrixus(path: string, init: RequestInit = {}, attachAuthorization = false) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && (typeof init.body === "string" || init.body == null)) {
    headers.set("Content-Type", "application/json");
  }
  const token = attachAuthorization ? localStorage.getItem(ACCESS_KEY) : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(`${trixusApiBaseUrl()}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new TrixusApiError(
      "Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.",
      0,
      "NETWORK_ERROR",
    );
  }
}

export async function healthCheck() {
  try {
    const response = await fetchTrixus("/health");
    if (!response.ok) return null;
    return (await response.json()) as TrixusHealth;
  } catch {
    return null;
  }
}

export const organizationApi = {
  getCompany: () => apiRequest<ApiCompanyProfile>("/company"),
  listFinancialPayments: () => apiRequest<ApiFinancialPayment[]>("/company/financial"),
  listDepartments: () => apiRequest<ApiDepartment[]>("/departments"),
  createDepartment: (data: { name: string; description?: string | null; color?: string }) =>
    apiRequest<ApiDepartment>("/departments", { method: "POST", body: JSON.stringify(data) }),
  updateDepartment: (
    id: string,
    data: { name?: string; description?: string | null; color?: string; active?: boolean },
  ) =>
    apiRequest<ApiDepartment>(`/departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteDepartment: (id: string) =>
    apiRequest<ApiDepartment>(`/departments/${id}`, { method: "DELETE" }),

  listRoles: () => apiRequest<ApiRole[]>("/roles"),
  createRole: (data: {
    name: string;
    key?: string;
    description?: string | null;
    permissionIds: string[];
    metadata?: unknown;
  }) => apiRequest<ApiRole>("/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (
    id: string,
    data: {
      name?: string;
      description?: string | null;
      permissionIds?: string[];
      metadata?: unknown;
    },
  ) => apiRequest<ApiRole>(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteRole: (id: string) => apiRequest<{ ok: true }>(`/roles/${id}`, { method: "DELETE" }),

  listUsers: () => apiRequest<ApiUserMembership[]>("/users"),
  createUser: (data: {
    email: string;
    name: string;
    password: string;
    roleId?: string;
    departmentIds?: string[];
    avatarUrl?: string | null;
  }) => apiRequest<ApiUserMembership>("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (
    id: string,
    data: {
      email?: string;
      name?: string;
      password?: string;
      roleId?: string;
      departmentIds?: string[];
      avatarUrl?: string | null;
      status?: "ACTIVE" | "DISABLED";
      membershipStatus?: "ACTIVE" | "DISABLED" | "INVITED";
    },
  ) =>
    apiRequest<ApiUserMembership>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  activateUser: (id: string) =>
    apiRequest<ApiUserMembership>(`/users/${id}/activate`, { method: "PATCH" }),
  deactivateUser: (id: string) =>
    apiRequest<ApiUserMembership>(`/users/${id}/deactivate`, { method: "PATCH" }),
  updateMyProfile: (data: {
    name?: string;
    avatarUrl?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) =>
    apiRequest<ApiUserMembership>("/me/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  updateAdministratorCredentials: (data: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
    presentationName?: string;
    avatarUrl?: string | null;
  }) =>
    apiRequest<{ ok: true; presentationName?: string | null; avatarUrl?: string | null }>("/company/administrator-credentials", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const crmApi = {
  listCustomers: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<ApiCustomer>>(`/crm/customers${queryString(params)}`),
  getCustomer: (id: string) => apiRequest<ApiCustomer>(`/crm/customers/${id}`),
  createCustomer: (data: CustomerPayload) =>
    apiRequest<ApiCustomer>("/crm/customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: Partial<CustomerPayload>) =>
    apiRequest<ApiCustomer>(`/crm/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteCustomer: (id: string) =>
    apiRequest<ApiCustomer>(`/crm/customers/${id}`, { method: "DELETE" }),
  listCustomerContacts: (id: string) => apiRequest<ApiContact[]>(`/crm/customers/${id}/contacts`),

  listContacts: (params: ListContactsParams = {}) =>
    apiRequest<PaginatedResponse<ApiContact>>(`/crm/contacts${queryString(params)}`),
  listContactsForGroupPicker: async (
    params: { q?: string; page?: number; pageSize?: number } = {},
  ): Promise<PaginatedResponse<ApiGroupContactPickerItem>> => {
    try {
      return await apiRequest<PaginatedResponse<ApiGroupContactPickerItem>>(
        `/crm/group-contact-picker${queryString(params)}`,
      );
    } catch (error) {
      // Allows the screen to keep working while an already-running backend is
      // restarted with the lightweight picker endpoint.
      if (!(error instanceof TrixusApiError) || error.status !== 404) throw error;
      const legacyPage = await apiRequest<PaginatedResponse<ApiContact>>(
        `/crm/contacts${queryString(params)}`,
      );
      return legacyPage;
    }
  },
  getContact: (id: string) => apiRequest<ApiContact>(`/crm/contacts/${id}`),
  createContact: (data: ContactPayload) =>
    apiRequest<ApiContact>("/crm/contacts", { method: "POST", body: JSON.stringify(data) }),
  updateContact: (id: string, data: Partial<ContactPayload>) =>
    apiRequest<ApiContact>(`/crm/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteContact: (id: string) =>
    apiRequest<ApiContact>(`/crm/contacts/${id}`, { method: "DELETE" }),
  previewContactsFromAgenda: (data: { connectionId?: string | null } = {}) =>
    apiRequest<ApiAgendaImportPreview>("/crm/contacts/import/agenda/preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  importContactsFromAgenda: (
    data: { connectionId?: string | null; selectedPhones?: string[] } = {},
  ) =>
    apiRequest<{ total: number; imported: number; skipped: number }>(
      "/crm/contacts/import/agenda",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  bulkUpdateContacts: (data: {
    contactIds?: string[];
    allFiltered?: boolean;
    filters?: ListContactsParams;
    customerId?: string | null;
    contactDepartmentId?: string | null;
    contactProfileId?: string | null;
    email?: string | null;
    instanceIds?: string[];
    tagIds?: string[];
    customFields?: Record<string, string | number | boolean | null>;
    delete?: boolean;
  }) =>
    apiRequest<{ updated: number }>("/crm/contacts/bulk", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  listTags: () => apiRequest<ApiTag[]>("/crm/tags"),
  createTag: (data: { name: string; color?: string }) =>
    apiRequest<ApiTag>("/tags", { method: "POST", body: JSON.stringify(data) }),
  updateTag: (id: string, data: { name?: string; color?: string }) =>
    apiRequest<ApiTag>(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archiveTag: (id: string) => apiRequest<ApiTag>(`/tags/${id}`, { method: "DELETE" }),
  assignContactTag: (contactId: string, tagId: string) =>
    apiRequest<ApiTag[]>(`/contacts/${contactId}/tags/${tagId}`, { method: "POST" }),
  removeContactTag: (contactId: string, tagId: string) =>
    apiRequest<ApiTag[]>(`/contacts/${contactId}/tags/${tagId}`, { method: "DELETE" }),
  contactOptions: () =>
    apiRequest<{
      instances: ApiContactInstanceOption[];
      departments: ApiContactCatalog[];
      profiles: ApiContactCatalog[];
      tags: ApiTag[];
    }>("/crm/contacts/options"),
  listContactDepartments: () => apiRequest<ApiContactCatalog[]>("/crm/contact-departments"),
  createContactDepartment: (data: { name: string; description?: string | null; color?: string }) =>
    apiRequest<ApiContactCatalog>("/crm/contact-departments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateContactDepartment: (
    id: string,
    data: { name?: string; description?: string | null; color?: string },
  ) =>
    apiRequest<ApiContactCatalog>(`/crm/contact-departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteContactDepartment: (id: string) =>
    apiRequest<ApiContactCatalog>(`/crm/contact-departments/${id}`, { method: "DELETE" }),
  listContactProfiles: () => apiRequest<ApiContactCatalog[]>("/crm/contact-profiles"),
  createContactProfile: (data: { name: string; description?: string | null; color?: string }) =>
    apiRequest<ApiContactCatalog>("/crm/contact-profiles", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateContactProfile: (
    id: string,
    data: { name?: string; description?: string | null; color?: string },
  ) =>
    apiRequest<ApiContactCatalog>(`/crm/contact-profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteContactProfile: (id: string) =>
    apiRequest<ApiContactCatalog>(`/crm/contact-profiles/${id}`, { method: "DELETE" }),
  listContactCustomFields: () => apiRequest<ApiContactCustomField[]>("/crm/contact-custom-fields"),
  createContactCustomField: (data: {
    label: string;
    type: ApiContactCustomField["type"];
    required?: boolean;
    mask?: string | null;
    note?: string | null;
    tabName?: string;
    groupName?: string;
    options?: string[];
    position?: number;
  }) =>
    apiRequest<ApiContactCustomField>("/crm/contact-custom-fields", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateContactCustomField: (
    id: string,
    data: Partial<{
      label: string;
      type: ApiContactCustomField["type"];
      required: boolean;
      mask: string | null;
      note: string | null;
      tabName: string;
      groupName: string;
      options: string[];
      position: number;
    }>,
  ) =>
    apiRequest<ApiContactCustomField>(`/crm/contact-custom-fields/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteContactCustomField: (id: string) =>
    apiRequest<ApiContactCustomField>(`/crm/contact-custom-fields/${id}`, { method: "DELETE" }),
  reorderContactCustomFields: (fieldIds: string[]) =>
    apiRequest<ApiContactCustomField[]>("/crm/contact-custom-fields/reorder", {
      method: "PATCH",
      body: JSON.stringify({ fieldIds }),
    }),
};

export const groupsApi = {
  list: (params: ListParams & { connectionId?: string } = {}) =>
    apiRequest<PaginatedResponse<ApiWhatsappGroup>>(`/groups${queryString(params)}`),
  detail: (id: string) => apiRequest<ApiWhatsappGroup>(`/groups/${id}`),
  create: (data: {
    name: string;
    connectionId: string;
    participantContactIds: string[];
    description?: string;
    imageDataUrl?: string;
  }) => apiRequest<ApiWhatsappGroup>("/groups", { method: "POST", body: JSON.stringify(data) }),
  updateName: (id: string, data: { name: string }) =>
    apiRequest<ApiWhatsappGroup>(`/groups/${id}/name`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  updateDescription: (id: string, data: { description: string }) =>
    apiRequest<ApiWhatsappGroup>(`/groups/${id}/description`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  updateParticipants: (
    id: string,
    data:
      | { action: "add"; participantContactIds: string[] }
      | { action: "remove"; participantIds: string[] },
  ) =>
    apiRequest<ApiWhatsappGroup>(`/groups/${id}/participants`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateAdmins: (id: string, data: { action: "promote" | "demote"; participantIds: string[] }) =>
    apiRequest<ApiWhatsappGroup>(`/groups/${id}/admins`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  leave: (id: string) =>
    apiRequest<{ id: string; left: boolean }>(`/groups/${id}/leave`, { method: "POST" }),
  sync: (data: { connectionId?: string } = {}) =>
    apiRequest<{
      synced: number;
      created: number;
      updated: number;
      failed: number;
      connections: number;
      groups: number;
      participants: number;
      inactiveParticipants: number;
      participantNamesUpdated: number;
    }>("/groups/sync", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const quickReplyApi = {
  list: (
    params: {
      q?: string;
      departmentId?: string;
      status?: "active" | "archived" | "all";
      scope?: "visible" | "catalog";
    } = {},
  ) => apiRequest<ApiQuickReply[]>(`/quick-replies${queryString(params)}`),
  create: (data: {
    title: string;
    shortcut: string;
    content: string;
    departmentId?: string | null;
    closeOnSend?: boolean;
    messages?: QuickReplyMessage[];
    intervalSeconds?: number;
    attachmentFileName?: string | null;
    attachmentMimeType?: string | null;
    attachmentSize?: number | null;
    attachmentDataUrl?: string | null;
  }) => apiRequest<ApiQuickReply>("/quick-replies", { method: "POST", body: JSON.stringify(data) }),
  update: (
    id: string,
    data: {
      title?: string;
      shortcut?: string;
      content?: string;
      departmentId?: string | null;
      closeOnSend?: boolean;
      messages?: QuickReplyMessage[];
      intervalSeconds?: number;
      attachmentFileName?: string | null;
      attachmentMimeType?: string | null;
      attachmentSize?: number | null;
      attachmentDataUrl?: string | null;
    },
  ) =>
    apiRequest<ApiQuickReply>(`/quick-replies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  archive: (id: string) => apiRequest<ApiQuickReply>(`/quick-replies/${id}`, { method: "DELETE" }),
};

export const conversationApi = {
  list: (params: ListConversationsParams = {}) =>
    apiRequest<PaginatedResponse<ApiConversation> & { counts: ConversationCounts }>(
      `/conversations${queryString(params)}`,
    ),
  get: (id: string) => apiRequest<ApiConversation>(`/conversations/${id}`),
  create: (data: ConversationPayload) =>
    apiRequest<ApiConversation>("/conversations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  assign: (
    id: string,
    data: { membershipId?: string | null; self?: boolean; unassign?: boolean },
  ) =>
    apiRequest<ApiConversation>(`/conversations/${id}/assignee`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  transferDepartment: (id: string, departmentId: string) =>
    apiRequest<ApiConversation>(`/conversations/${id}/department`, {
      method: "PATCH",
      body: JSON.stringify({ departmentId }),
    }),
  updateStatus: (id: string, status: ApiConversationStatus) =>
    apiRequest<ApiConversation>(`/conversations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

export const leadApi = {
  list: (params: { page?: number; pageSize?: number; status?: string } = {}) =>
    apiRequest<PaginatedResponse<ApiLead>>(`/leads${queryString(params)}`),
  assign: (id: string, data: { membershipId?: string; self?: boolean }) =>
    apiRequest<ApiLead>(`/leads/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const notificationApi = {
  list: (params: { page?: number; pageSize?: number; status?: string } = {}) =>
    apiRequest<PaginatedResponse<ApiNotification> & { unread: number }>(
      `/notifications${queryString(params)}`,
    ),
  markRead: (id: string) =>
    apiRequest<{ ok: true }>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () =>
    apiRequest<{ ok: true; updated: number }>("/notifications/read-all", { method: "POST" }),
};

export const automationApi = {
  list: (params: { page?: number; pageSize?: number; status?: string } = {}) =>
    apiRequest<PaginatedResponse<ApiAutomationRule>>(`/automations${queryString(params)}`),
  create: (data: {
    name: string;
    matchText: string;
    responseText?: string;
    actionType?: "BOT_REPLY" | "ASSIGN_DEPARTMENT" | "NOTIFY_TEAM";
    departmentId?: string;
  }) =>
    apiRequest<ApiAutomationRule>("/automations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: {
      name?: string;
      matchText?: string;
      responseText?: string;
      status?: "ACTIVE" | "DISABLED";
      actionType?: "BOT_REPLY" | "ASSIGN_DEPARTMENT" | "NOTIFY_TEAM";
      departmentId?: string;
    },
  ) =>
    apiRequest<ApiAutomationRule>(`/automations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  archive: (id: string) => apiRequest<{ ok: true }>(`/automations/${id}`, { method: "DELETE" }),
};

export const messageApi = {
  get: (conversationId: string, messageId: string) =>
    apiRequest<ApiMessage>(`/conversations/${conversationId}/messages/${messageId}`),
  list: (conversationId: string, params: { limit?: number; cursor?: string } = {}) =>
    apiRequest<MessagePage>(`/conversations/${conversationId}/messages${queryString(params)}`),
  sendText: (
    conversationId: string,
    content: string,
    clientMessageId: string = crypto.randomUUID(),
    quotedMessageId?: string | null,
    mentions?: string[],
  ) =>
    apiRequest<ApiMessage>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, clientMessageId, quotedMessageId, mentions }),
    }),
  markRead: (conversationId: string) =>
    apiRequest<{ unreadCount: number; readAt: string }>(
      `/conversations/${conversationId}/messages/read`,
      { method: "PATCH" },
    ),
  sendMedia: async (
    conversationId: string,
    file: File | Blob,
    options: {
      fileName: string;
      mimeType: string;
      mediaType?: "image" | "audio" | "voice" | "video" | "document";
      caption?: string | null;
      durationMs?: number | null;
      quotedMessageId?: string | null;
      clientMessageId?: string;
    },
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": options.mimeType || "application/octet-stream",
      "X-File-Name": encodeURIComponent(options.fileName),
      "X-File-Size": String(file.size),
      "X-Client-Message-Id": options.clientMessageId ?? crypto.randomUUID(),
    };
    if (options.mediaType) headers["X-Media-Type"] = options.mediaType;
    if (options.caption) headers["X-Caption"] = encodeURIComponent(options.caption);
    if (options.durationMs) headers["X-Duration-Ms"] = String(options.durationMs);
    if (options.quotedMessageId) headers["X-Quoted-Message-Id"] = options.quotedMessageId;
    let response = await fetchTrixus(
      `/conversations/${conversationId}/messages/media`,
      { method: "POST", headers, body: file },
      true,
    );
    if (response.status === 401 && (await refreshAccessToken())) {
      response = await fetchTrixus(
        `/conversations/${conversationId}/messages/media`,
        { method: "POST", headers, body: file },
        true,
      );
    }
    if (!response.ok) throw await readError(response);
    return response.json() as Promise<ApiMessage>;
  },
  react: (conversationId: string, messageId: string, emoji: string | null) =>
    apiRequest(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }),
  downloadMedia: async (conversationId: string, messageId: string, inline = false) => {
    const suffix = inline ? "inline" : "download";
    let response = await fetchTrixus(
      `/conversations/${conversationId}/messages/${messageId}/media/${suffix}`,
      {},
      true,
    );
    if (response.status === 401 && (await refreshAccessToken())) {
      response = await fetchTrixus(
        `/conversations/${conversationId}/messages/${messageId}/media/${suffix}`,
        {},
        true,
      );
    }
    if (!response.ok) throw await readError(response);
    return response.blob();
  },
};

export const operationsApi = {
  dashboard: (params: Partial<OperationalFilters> = {}) =>
    apiRequest<ApiOperationsDashboard>(`/operations/dashboard${queryString(params)}`),
  history: (params: Partial<OperationalFilters> & { page?: number; pageSize?: number } = {}) =>
    apiRequest<PaginatedResponse<ApiConversation>>(
      `/operations/history/conversations${queryString(params)}`,
    ),
  timeline: (conversationId: string) =>
    apiRequest<ApiConversationTimeline>(
      `/operations/history/conversations/${conversationId}/timeline`,
    ),
  report: (params: Partial<OperationalFilters> & { page?: number; pageSize?: number } = {}) =>
    apiRequest<ApiOperationsReport>(`/operations/reports/attendance${queryString(params)}`),
  exportAttendance: async (
    params: Partial<OperationalFilters> & { format?: "csv" | "xlsx" | "pdf" } = {},
  ) => {
    let response = await fetchTrixus(
      `/operations/reports/attendance/export${queryString(params)}`,
      {},
      true,
    );
    if (response.status === 401 && (await refreshAccessToken())) {
      response = await fetchTrixus(
        `/operations/reports/attendance/export${queryString(params)}`,
        {},
        true,
      );
    }
    if (!response.ok) throw await readError(response);
    return response.blob();
  },
  queues: (params: Partial<OperationalFilters> = {}) =>
    apiRequest<{ items: ApiOperationalQueue[] }>(`/operations/queues${queryString(params)}`),
};

export const connectionsApi = {
  list: () => apiRequest<ApiMessagingConnection[]>("/messaging/connections"),
  createEvolution: (data: {
    name: string;
    color?: string;
    instanceName?: string;
    importHistoryEnabled?: boolean;
    importHistoryStartDate?: string;
    importGroupsEnabled?: boolean;
    importGroupsStartDate?: string;
  }) =>
    apiRequest<ApiMessagingConnection>("/messaging/connections/evolution", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: {
      name?: string;
      color?: string | null;
      welcomeEnabled?: boolean;
      welcomeNewMessage?: string | null;
      welcomeExistingMessage?: string | null;
      serviceHours?: ApiServiceHoursRow[];
      timezone?: string;
      absenceEnabled?: boolean;
      absenceMessage?: string | null;
      notes?: string | null;
    },
  ) =>
    apiRequest<ApiMessagingConnection>(`/messaging/connections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  updateProfilePicture: (id: string, imageDataUrl: string) =>
    apiRequest<ApiMessagingConnection>(`/messaging/connections/${id}/profile-picture`, {
      method: "POST",
      body: JSON.stringify({ imageDataUrl }),
    }),
  refreshProfilePicture: (id: string) =>
    apiRequest<ApiMessagingConnection>(`/messaging/connections/${id}/profile-picture/refresh`, {
      method: "POST",
    }),
  removeProfilePicture: (id: string) =>
    apiRequest<ApiMessagingConnection>(`/messaging/connections/${id}/profile-picture`, {
      method: "DELETE",
    }),
  webhookStatus: (id: string) =>
    apiRequest<ApiWebhookAudit>(`/messaging/connections/${id}/webhook`),
  ensureWebhook: (id: string) =>
    apiRequest<ApiWebhookAudit>(`/messaging/connections/${id}/webhook/ensure`, {
      method: "POST",
    }),
  status: (id: string) => apiRequest<ApiMessagingConnection>(`/messaging/connections/${id}/status`),
  importStatus: (id: string) =>
    apiRequest<ApiMessagingHistoryImport[]>(`/messaging/connections/${id}/imports`),
  retryImport: (id: string, kind?: ApiMessagingHistoryImport["kind"]) =>
    apiRequest<ApiMessagingHistoryImport[]>(`/messaging/connections/${id}/imports/retry`, {
      method: "POST",
      body: JSON.stringify(kind ? { kind } : {}),
    }),
  qr: (id: string) =>
    apiRequest<{ connectionId: string; qrCodeBase64: string | null; status: string }>(
      `/messaging/connections/${id}/qr`,
    ),
  logout: (id: string) =>
    apiRequest<ApiMessagingConnection>(`/messaging/connections/${id}/logout`, {
      method: "PATCH",
    }),
  remove: (id: string, options: { removeConversationHistory?: boolean } = {}) =>
    apiRequest<{
      id: string;
      removed: boolean;
      providerInstanceExisted: boolean;
      removedConversationHistoryCount?: number;
      closedChatConversationCount?: number;
    }>(`/messaging/connections/${id}`, {
      method: "DELETE",
      body: JSON.stringify(options),
    }),
};

export const ticketApi = {
  list: (
    params: {
      search?: string;
      status?: ApiTicketStatus;
      priority?: ApiTicketPriority;
      departmentId?: string;
      assignedMembershipId?: string;
      requesterContactId?: string;
      customerId?: string;
      conversationId?: string;
      page?: number;
      pageSize?: number;
      sort?: string;
    } = {},
  ) => apiRequest<PaginatedResponse<ApiTicket>>(`/tickets${queryString(params)}`),
  get: (id: string) => apiRequest<ApiTicket>(`/tickets/${id}`),
  create: (data: {
    title: string;
    descriptionHtml: string;
    priority?: ApiTicketPriority;
    category?: ApiTicketCategory;
    departmentId: string;
    assignedMembershipId?: string | null;
    requesterContactId?: string | null;
    customerId?: string | null;
    conversationId?: string | null;
  }) => apiRequest<ApiTicket>("/tickets", { method: "POST", body: JSON.stringify(data) }),
  update: (
    id: string,
    data: Partial<Pick<ApiTicket, "title" | "priority" | "category">> & {
      descriptionHtml?: string;
      requesterContactId?: string | null;
      customerId?: string | null;
      conversationId?: string | null;
    },
  ) => apiRequest<ApiTicket>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  updateStatus: (id: string, status: ApiTicketStatus) =>
    apiRequest<ApiTicket>(`/tickets/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updateAssignee: (id: string, assignedMembershipId?: string | null) =>
    apiRequest<ApiTicket>(`/tickets/${id}/assignee`, {
      method: "PATCH",
      body: JSON.stringify({ assignedMembershipId }),
    }),
  updateDepartment: (id: string, departmentId: string) =>
    apiRequest<ApiTicket>(`/tickets/${id}/department`, {
      method: "PATCH",
      body: JSON.stringify({ departmentId }),
    }),
  archive: (id: string) => apiRequest<ApiTicket>(`/tickets/${id}`, { method: "DELETE" }),
  comments: (id: string) => apiRequest<ApiTicketComment[]>(`/tickets/${id}/comments`),
  createComment: (id: string, bodyHtml: string) =>
    apiRequest<ApiTicketComment>(`/tickets/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ bodyHtml, internal: true }),
    }),
  attachments: (id: string) => apiRequest<ApiTicketAttachment[]>(`/tickets/${id}/attachments`),
  uploadAttachment: async (id: string, file: File) => {
    let response = await fetchTrixus(
      `/tickets/${id}/attachments`,
      {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Size": String(file.size),
        },
        body: file,
      },
      true,
    );
    if (response.status === 401 && (await refreshAccessToken())) {
      response = await fetchTrixus(
        `/tickets/${id}/attachments`,
        {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-File-Size": String(file.size),
          },
          body: file,
        },
        true,
      );
    }
    if (!response.ok) throw await readError(response);
    return response.json() as Promise<ApiTicketAttachment>;
  },
  deleteAttachment: (id: string, attachmentId: string) =>
    apiRequest<ApiTicketAttachment>(`/tickets/${id}/attachments/${attachmentId}`, {
      method: "DELETE",
    }),
  download: async (id: string, attachmentId: string) => {
    let response = await fetchTrixus(
      `/tickets/${id}/attachments/${attachmentId}/download`,
      {},
      true,
    );
    if (response.status === 401 && (await refreshAccessToken())) {
      response = await fetchTrixus(`/tickets/${id}/attachments/${attachmentId}/download`, {}, true);
    }
    if (!response.ok) throw await readError(response);
    return response.blob();
  },
  preview: async (id: string, attachmentId: string) => {
    let response = await fetchTrixus(`/tickets/${id}/attachments/${attachmentId}/inline`, {}, true);
    if (response.status === 401 && (await refreshAccessToken())) {
      response = await fetchTrixus(`/tickets/${id}/attachments/${attachmentId}/inline`, {}, true);
    }
    if (!response.ok) throw await readError(response);
    return response.blob();
  },
};

export const campaignApi = {
  list: (
    params: {
      search?: string;
      status?: ApiCampaignStatus;
      connectionId?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) => apiRequest<PaginatedResponse<ApiCampaign>>(`/campaigns${queryString(params)}`),
  get: (id: string) => apiRequest<ApiCampaign>(`/campaigns/${id}`),
  create: (data: {
    name: string;
    description?: string | null;
    messageText: string;
    connectionId: string;
    audience: ApiCampaignAudience;
    timezone?: string;
  }) => apiRequest<ApiCampaign>("/campaigns", { method: "POST", body: JSON.stringify(data) }),
  update: (
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      messageText: string;
      connectionId: string;
      audience: ApiCampaignAudience;
      timezone: string;
    }>,
  ) => apiRequest<ApiCampaign>(`/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archive: (id: string) => apiRequest<ApiCampaign>(`/campaigns/${id}`, { method: "DELETE" }),
  preview: (data: { messageText: string; audience: ApiCampaignAudience }) =>
    apiRequest<ApiCampaignPreview>("/campaigns/audience-preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  start: (id: string, data: { confirm: true; expectedEligibleCount?: number }) =>
    apiRequest<ApiCampaign>(`/campaigns/${id}/start`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  schedule: (
    id: string,
    data: {
      confirm: true;
      scheduledAt: string;
      timezone?: string;
      expectedEligibleCount?: number;
    },
  ) =>
    apiRequest<ApiCampaign>(`/campaigns/${id}/schedule`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  pause: (id: string) => apiRequest<ApiCampaign>(`/campaigns/${id}/pause`, { method: "POST" }),
  resume: (id: string) => apiRequest<ApiCampaign>(`/campaigns/${id}/resume`, { method: "POST" }),
  cancel: (id: string) => apiRequest<ApiCampaign>(`/campaigns/${id}/cancel`, { method: "POST" }),
  duplicate: (id: string) =>
    apiRequest<ApiCampaign>(`/campaigns/${id}/duplicate`, { method: "POST" }),
  recipients: (
    id: string,
    params: { status?: string; search?: string; page?: number; pageSize?: number } = {},
  ) =>
    apiRequest<PaginatedResponse<ApiCampaignRecipient>>(
      `/campaigns/${id}/recipients${queryString(params)}`,
    ),
  stats: (id: string) => apiRequest<ApiCampaignCounters>(`/campaigns/${id}/stats`),
};

export type PlatformDashboard = {
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  activeUsers: number;
  activeConnections: number;
  messagesThisPeriod: number;
  campaignsThisPeriod: number;
  openTickets: number;
  openInvoices: number;
  overdueInvoices: number;
  subscriptionsByPlan: Array<{ planId: string; code: string; name: string; subscriptions: number }>;
};

export type PlatformTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: { id: string; code: string; name: string } | null;
  subscriptionStatus: string | null;
  activeUsers: number;
  connections: number;
  createdAt: string;
  updatedAt: string;
};

export type PlatformTenantDetail = PlatformTenant & {
  usage: PlatformUsage;
  detail: {
    id: string;
    name: string;
    legalName: string | null;
    displayName: string | null;
    slug: string;
    status: string;
    timezone: string;
    locale: string;
    billingEmail: string | null;
    technicalEmail: string | null;
    activatedAt: string | null;
    suspendedAt: string | null;
    terminatedAt: string | null;
    suspensionReason: string | null;
    subscriptions: PlatformSubscription[];
    users: ApiUserMembership[];
    departments: ApiDepartment[];
    messagingConnections: ApiMessagingConnection[];
    invoices: PlatformInvoice[];
    auditLogs: PlatformAuditLog[];
  };
};

export type PlatformPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  billingPeriod: string;
  priceCents: number | null;
  currency: string;
  trialDays: number;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  _count?: { subscriptions: number };
};

export type PlatformSubscription = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  plan: { id: string; code: string; name: string };
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

export type PlatformInvoice = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  currency: string;
  dueAt: string;
  tenant: { id: string; name: string; slug: string };
};

export type PlatformAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actor: { id: string; email: string; name: string } | null;
  tenant: { id: string; slug: string; name: string } | null;
  createdAt: string;
};

export type PlatformUsage = {
  activeUsers: number;
  departments: number;
  connections: number;
  contacts: number;
  customers: number;
  conversations: number;
  messagesThisPeriod: number;
  storageBytes: number;
  tickets: number;
  campaignsThisPeriod: number;
  campaignRecipientsThisPeriod: number;
};

export type PlatformHealth = {
  ok: boolean;
  database: "up" | "down";
  redis: "up" | "down";
  outboundQueue: { status: "up" | "down"; configured: boolean };
  campaignQueue: { status: "up" | "down"; configured: boolean };
  workers: { outbound: string; campaign: string };
  realtime: { status: string; adapter: string };
  evolution: { status: string };
  storage: { status: string; provider: string };
  campaignScheduler: string;
  timestamp: string;
};

export type PlatformSettings = {
  defaultTrialDays: number;
  defaultSubscriptionPeriodDays: number;
  defaultCurrency: string;
};

export type PlatformImpersonation = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  membership: ApiUserMembership;
  expiresAt: string;
  tokens: LoginResponse;
};

export type StoredImpersonation = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  membershipId: string;
  expiresAt: string;
  actorAccessToken: string;
  actorRefreshToken: string;
  actorUser: SessionUser;
};

export const platformApi = {
  dashboard: () => apiRequest<PlatformDashboard>("/platform/dashboard"),
  health: () => apiRequest<PlatformHealth>("/platform/health"),
  settings: () => apiRequest<PlatformSettings>("/platform/settings"),
  updateSettings: (data: PlatformSettings) =>
    apiRequest<PlatformSettings>("/platform/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  tenants: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<PlatformTenant>>(`/platform/tenants${queryString(params)}`),
  tenant: (id: string) => apiRequest<PlatformTenantDetail>(`/platform/tenants/${id}`),
  createTenant: (data: {
    name: string;
    slug: string;
    timezone?: string;
    locale?: string;
    planId: string;
    initialStatus?: "TRIAL" | "ACTIVE";
    admin: { email: string; name: string; password: string };
  }) =>
    apiRequest<PlatformTenantDetail>("/platform/tenants", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTenant: (
    id: string,
    data: {
      name?: string;
      legalName?: string;
      displayName?: string;
      billingEmail?: string;
      technicalEmail?: string;
    },
  ) =>
    apiRequest<PlatformTenant>(`/platform/tenants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  suspendTenant: (id: string, reason: string) =>
    apiRequest<PlatformTenant>(`/platform/tenants/${id}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  reactivateTenant: (id: string, reason: string) =>
    apiRequest<PlatformTenant>(`/platform/tenants/${id}/reactivate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  terminateTenant: (id: string, reason: string, confirmSlug: string) =>
    apiRequest<PlatformTenant>(`/platform/tenants/${id}/terminate`, {
      method: "POST",
      body: JSON.stringify({ reason, confirmSlug }),
    }),
  plans: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<PlatformPlan>>(`/platform/plans${queryString(params)}`),
  plan: (id: string) => apiRequest<PlatformPlan>(`/platform/plans/${id}`),
  createPlan: (data: {
    code: string;
    name: string;
    description?: string;
    status?: "DRAFT" | "ACTIVE";
    billingPeriod?: "MONTHLY" | "YEARLY" | "MANUAL";
    priceCents?: number;
    trialDays?: number;
    features: Record<string, boolean>;
    limits: Record<string, number>;
  }) => apiRequest<PlatformPlan>("/platform/plans", { method: "POST", body: JSON.stringify(data) }),
  updatePlan: (
    id: string,
    data: {
      name?: string;
      description?: string;
      status?: "DRAFT" | "ACTIVE";
      trialDays?: number;
      features?: Record<string, boolean>;
      limits?: Record<string, number>;
    },
  ) =>
    apiRequest<PlatformPlan>(`/platform/plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  archivePlan: (id: string) =>
    apiRequest<PlatformPlan>(`/platform/plans/${id}`, { method: "DELETE" }),
  subscriptions: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<PlatformSubscription>>(
      `/platform/subscriptions${queryString(params)}`,
    ),
  subscription: (id: string) => apiRequest<PlatformSubscription>(`/platform/subscriptions/${id}`),
  createSubscription: (
    tenantId: string,
    data: {
      planId: string;
      status?: "TRIALING" | "ACTIVE";
      currentPeriodEnd?: string;
      reason?: string;
    },
  ) =>
    apiRequest<PlatformSubscription>(`/platform/tenants/${tenantId}/subscriptions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSubscription: (
    id: string,
    data: {
      planId?: string;
      status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "EXPIRED";
      reason?: string;
    },
  ) =>
    apiRequest<PlatformSubscription>(`/platform/subscriptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  cancelSubscription: (id: string, data: { reason: string; cancelAtPeriodEnd?: boolean }) =>
    apiRequest<PlatformSubscription>(`/platform/subscriptions/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  invoices: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<PlatformInvoice>>(`/platform/invoices${queryString(params)}`),
  invoice: (id: string) => apiRequest<PlatformInvoice>(`/platform/invoices/${id}`),
  createInvoice: (data: {
    tenantId: string;
    subscriptionId: string;
    currency?: string;
    subtotalCents: number;
    discountCents?: number;
    dueAt: string;
  }) =>
    apiRequest<PlatformInvoice>("/platform/invoices", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateInvoiceStatus: (id: string, status: "DRAFT" | "OPEN" | "PAID" | "VOID" | "OVERDUE") =>
    apiRequest<PlatformInvoice>(`/platform/invoices/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  auditLogs: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<PlatformAuditLog>>(`/platform/audit-logs${queryString(params)}`),
  auditLog: (id: string) => apiRequest<PlatformAuditLog>(`/platform/audit-logs/${id}`),
  startImpersonation: (data: { tenantId: string; membershipId: string; reason: string }) =>
    apiRequest<PlatformImpersonation>("/platform/impersonation/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  stopImpersonation: (id: string) =>
    apiRequest<{ id: string }>(`/platform/impersonation/${id}/stop`, { method: "POST" }),
  currentImpersonation: () =>
    apiRequest<PlatformImpersonation | null>("/platform/impersonation/current"),
};

export function activatePlatformImpersonation(data: PlatformImpersonation, actorUser: SessionUser) {
  const actorAccessToken = localStorage.getItem(ACCESS_KEY);
  const actorRefreshToken = localStorage.getItem(REFRESH_KEY);
  if (!actorAccessToken || !actorRefreshToken) {
    throw new TrixusApiError("Sessao de plataforma ausente.", 401, "PLATFORM_SESSION_MISSING");
  }
  const stored: StoredImpersonation = {
    id: data.id,
    tenant: data.tenant,
    membershipId: data.membership.id,
    expiresAt: data.expiresAt,
    actorAccessToken,
    actorRefreshToken,
    actorUser,
  };
  localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(stored));
  storeTrixusSession(data.tokens);
  return loginResponseToSessionUser(data.tokens);
}

export function readStoredPlatformImpersonation(options: { includeExpired?: boolean } = {}) {
  try {
    const raw = localStorage.getItem(IMPERSONATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredImpersonation;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      if (options.includeExpired) return parsed;
      restorePlatformTokens(parsed);
      localStorage.removeItem(IMPERSONATION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(IMPERSONATION_KEY);
    return null;
  }
}

export async function stopStoredPlatformImpersonation() {
  const stored = readStoredPlatformImpersonation({ includeExpired: true });
  if (!stored) return null;
  restorePlatformTokens(stored);
  try {
    await platformApi.stopImpersonation(stored.id);
  } finally {
    localStorage.removeItem(IMPERSONATION_KEY);
  }
  return stored.actorUser;
}

export function clearTrixusApiSession() {
  sessionAlreadyCleared = true;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(TENANT_KEY);
  localStorage.removeItem(IMPERSONATION_KEY);
}

export async function logoutFromTrixusApi() {
  const storedImpersonation = readStoredPlatformImpersonation({ includeExpired: true });
  try {
    if (storedImpersonation) {
      restorePlatformTokens(storedImpersonation);
      try {
        await platformApi.stopImpersonation(storedImpersonation.id);
      } catch {
        // Local logout must still clear tokens even if the server-side stop was already applied.
      }
    }
    await fetchTrixus("/auth/logout", { method: "POST" }, true);
  } finally {
    clearTrixusApiSession();
  }
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as {
      code?: string;
      message?: string | string[];
      error?: string;
      details?: unknown;
    };
    const candidate = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    const message =
      trixusMessageFromCode(data.code) ||
      (isHelpfulApiMessage(candidate) && candidate) ||
      apiMessageFromStatus(response.status, data.code);
    return new TrixusApiError(message, response.status, data.code, data.details);
  } catch {
    return new TrixusApiError(apiMessageFromStatus(response.status), response.status);
  }
}

async function authErrorFromResponse(response: Response) {
  try {
    const data = (await response.json()) as { code?: string; message?: string | string[] };
    const candidate = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    return new Error(
      authMessageFromStatus(response.status, data.code) ??
        (isHelpfulApiMessage(candidate) ? candidate : null) ??
        "Não foi possível concluir a autenticação. Tente novamente em alguns instantes.",
    );
  } catch {
    return new Error(
      authMessageFromStatus(response.status) ??
        "Não foi possível concluir a autenticação. Tente novamente em alguns instantes.",
    );
  }
}

function trixusMessageFromCode(code?: string) {
  if (code === "PLAN_LIMIT_CONNECTIONS_REACHED") {
    return "Número máximo de conexões excedidas.";
  }
  if (code === "PLAN_FEATURE_NOT_AVAILABLE") {
    return "Recurso não disponível para o plano atual.";
  }
  return null;
}

function authMessageFromStatus(status: number, code?: string) {
  if (status === 401) return "E-mail ou senha inválidos.";
  if (status === 403) {
    if (code === "USER_WITHOUT_ACTIVE_MEMBERSHIP") {
      return "Seu usuário não possui acesso a nenhuma organização ativa.";
    }
    if (code === "TENANT_INACTIVE") return "A organização vinculada ao usuário está inativa.";
    return "Seu usuário não possui permissão para acessar este ambiente.";
  }
  if (status === 429) return "Muitas tentativas de acesso. Aguarde e tente novamente.";
  if (status >= 500)
    return "Não foi possível concluir a autenticação. Tente novamente em alguns instantes.";
  return null;
}

function apiMessageFromStatus(status: number, code?: string) {
  if (status === 0 || code === "NETWORK_ERROR") {
    return "Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.";
  }
  if (status === 400 || status === 422) {
    return "Não foi possível concluir a ação. Revise os dados informados e tente novamente.";
  }
  if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (status === 403) return "Você não possui permissão para realizar esta ação.";
  if (status === 404) return "O registro não foi encontrado ou não está mais disponível.";
  if (status === 409) return "Já existe um registro com essas informações.";
  if (status === 413) return "O arquivo ou conteúdo enviado é maior do que o permitido.";
  if (status === 429)
    return "Muitas solicitações em pouco tempo. Aguarde alguns instantes e tente novamente.";
  if (status === 502 || status === 503 || status === 504) {
    return "O serviço está temporariamente indisponível. Tente novamente em alguns instantes.";
  }
  if (status >= 500)
    return "Não foi possível concluir a ação agora. Tente novamente em alguns instantes.";
  return "Não foi possível concluir a solicitação. Tente novamente.";
}

function isHelpfulApiMessage(message: unknown): message is string {
  if (typeof message !== "string" || !message.trim()) return false;
  return !/(internal( server)? error|erro interno|unexpected error|unknown error|prisma|stack trace)/i.test(
    message,
  );
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshAccessTokenOnce().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function refreshAccessTokenOnce() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const response = await fetchTrixus("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      clearTrixusApiSession();
      return false;
    }
    const data = (await response.json()) as { accessToken: string };
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    sessionAlreadyCleared = false;
    return true;
  } catch {
    return false;
  }
}

function storeTrixusSession(data: LoginResponse) {
  sessionAlreadyCleared = false;
  localStorage.setItem(ACCESS_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(TENANT_KEY, JSON.stringify(data.tenant));
}

function restorePlatformTokens(stored: StoredImpersonation) {
  localStorage.setItem(ACCESS_KEY, stored.actorAccessToken);
  localStorage.setItem(REFRESH_KEY, stored.actorRefreshToken);
  localStorage.setItem(
    TENANT_KEY,
    JSON.stringify({ id: "platform", slug: "platform", name: "Trixus Platform" }),
  );
}

function loginResponseToSessionUser(data: LoginResponse): SessionUser {
  return {
    id: data.user.id,
    nome: data.user.name,
    email: data.user.email,
    role: roleMap[data.user.roleKey] ?? "operator",
    empresaId: data.tenant.id,
    empresaNome: data.tenant.name,
    avatarUrl: data.user.avatarUrl ?? undefined,
    permissions: data.permissions,
  };
}

function canRefresh(path: string) {
  return !(
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/logout") ||
    path.startsWith("/health")
  );
}

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}
