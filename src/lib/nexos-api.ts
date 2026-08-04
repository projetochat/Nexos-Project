import type { Role, SessionUser } from "@/lib/session";

const ACCESS_KEY = "nexo.api.accessToken";
const REFRESH_KEY = "nexo.api.refreshToken";
const TENANT_KEY = "nexo.api.tenant";
const IMPERSONATION_KEY = "nexo.api.impersonation";
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

export type NexosHealth = {
  ok: boolean;
  service: string;
  database: "up" | "down";
  redis: "up" | "down";
  timestamp: string;
};

export class NexosApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "NexosApiError";
  }
}

export type ApiDepartment = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
  memberCount?: number;
};

export type ApiRole = {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description: string | null;
  metadata: unknown;
  system: boolean;
  permissionIds: string[];
};

export type ApiUserMembership = {
  id: string;
  status: "ACTIVE" | "DISABLED" | "INVITED";
  user: {
    id: string;
    email: string;
    name: string;
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
};

export type ApiTag = {
  id: string;
  nome: string;
  cor: string;
  archivedAt?: string | null;
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
  nivel_gerencia: "Colaborador" | "Supervisor" | "Gerente" | "Diretoria" | null;
  instancia: string | null;
  customer: Pick<ApiCustomer, "id" | "nome" | "cor"> | null;
  tags: ApiTag[];
  lifecycle?: "created" | "restored";
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
  } | null;
};

export type ApiQuickReply = {
  id: string;
  tenantId: string;
  title: string;
  atalho: string;
  shortcut: string;
  texto: string;
  content: string;
  departmentId: string | null;
  department: { id: string; nome: string; cor: string } | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  close_on_send: false;
};

export type ApiMessage = {
  id: string;
  tenantId: string;
  conversation_id: string;
  direction: "inbound" | "outbound" | "system";
  sender: "contact" | "agent";
  author_id: string | null;
  author_membership_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  type: "text" | "image" | "audio" | "system";
  status: "created" | "queued" | "sending" | "sent" | "failed" | "delivered" | "read";
  media_data: null;
  duration_ms: null;
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

export type ApiMessagingConnection = {
  id: string;
  tenantId: string;
  name: string;
  providerType: "development" | "evolution" | "meta_cloud";
  status: "disconnected" | "connecting" | "connected" | "error" | "removed";
  externalReference: string | null;
  ownerPhoneMasked?: string | null;
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
  departmentName?: string | null;
  companyRole?: "COLABORADOR" | "SUPERVISOR" | "GERENTE" | "DIRETORIA" | null;
  instance?: string | null;
  tagIds?: string[];
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

export function nexosApiBaseUrl() {
  return import.meta.env.VITE_NEXOS_API_URL || "http://localhost:3001/api";
}

export function nexosRealtimeBaseUrl() {
  return nexosApiBaseUrl().replace(/\/api\/?$/, "");
}

export function getNexosAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export async function ensureNexosAccessToken() {
  const token = getNexosAccessToken();
  if (token) return token;
  return (await refreshAccessToken()) ? getNexosAccessToken() : null;
}

export async function refreshNexosAccessToken() {
  return (await refreshAccessToken()) ? getNexosAccessToken() : null;
}

export async function loginWithNexosApi(email: string, password: string, tenantSlug?: string) {
  const body: { email: string; password: string; tenantSlug?: string } = { email, password };
  if (tenantSlug) body.tenantSlug = tenantSlug;
  const response = await fetchNexos("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await authErrorFromResponse(response);

  const data = (await response.json()) as LoginResponse;
  storeNexosSession(data);
  return loginResponseToSessionUser(data);
}

export async function hydrateWithNexosApi() {
  const data = await apiRequest<MeResponse>("/auth/me");
  return {
    id: data.user.id,
    nome: data.user.name,
    email: data.user.email,
    role: roleMap[data.user.roleKey] ?? "operator",
    empresaId: data.tenant.id,
    empresaNome: data.tenant.name,
    permissions: data.permissions,
  } satisfies SessionUser;
}

async function hydrateWithPlatformToken(stored: StoredImpersonation) {
  localStorage.setItem(ACCESS_KEY, stored.actorAccessToken);
  localStorage.setItem(REFRESH_KEY, stored.actorRefreshToken);
  localStorage.setItem(
    TENANT_KEY,
    JSON.stringify({ id: "platform", slug: "platform", name: "Nexos Platform" }),
  );
  return {
    id: "platform",
    nome: "Platform",
    email: "",
    role: "super_admin",
    empresaId: "platform",
    empresaNome: "Nexos Platform",
    permissions: [],
  } satisfies SessionUser;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await fetchNexos(path, init, true);
  if (response.status === 401 && canRefresh(path) && (await refreshAccessToken())) {
    response = await fetchNexos(path, init, true);
  }
  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function fetchNexos(path: string, init: RequestInit = {}, attachAuthorization = false) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && (typeof init.body === "string" || init.body == null)) {
    headers.set("Content-Type", "application/json");
  }
  const token = attachAuthorization ? localStorage.getItem(ACCESS_KEY) : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${nexosApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
}

export async function healthCheck() {
  try {
    const response = await fetchNexos("/health");
    if (!response.ok) return null;
    return (await response.json()) as NexosHealth;
  } catch {
    return null;
  }
}

export const organizationApi = {
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
  }) => apiRequest<ApiUserMembership>("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (
    id: string,
    data: {
      email?: string;
      name?: string;
      password?: string;
      roleId?: string;
      departmentIds?: string[];
      status?: "ACTIVE" | "DISABLED";
      membershipStatus?: "ACTIVE" | "DISABLED" | "INVITED";
    },
  ) =>
    apiRequest<ApiUserMembership>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deactivateUser: (id: string) =>
    apiRequest<ApiUserMembership>(`/users/${id}/deactivate`, { method: "PATCH" }),
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
  getContact: (id: string) => apiRequest<ApiContact>(`/crm/contacts/${id}`),
  createContact: (data: ContactPayload) =>
    apiRequest<ApiContact>("/crm/contacts", { method: "POST", body: JSON.stringify(data) }),
  updateContact: (id: string, data: Partial<ContactPayload>) =>
    apiRequest<ApiContact>(`/crm/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteContact: (id: string) =>
    apiRequest<ApiContact>(`/crm/contacts/${id}`, { method: "DELETE" }),
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
    apiRequest<{ instances: string[]; departments: string[]; tags: ApiTag[] }>(
      "/crm/contacts/options",
    ),
};

export const quickReplyApi = {
  list: (
    params: { q?: string; departmentId?: string; status?: "active" | "archived" | "all" } = {},
  ) => apiRequest<ApiQuickReply[]>(`/quick-replies${queryString(params)}`),
  create: (data: {
    title: string;
    shortcut: string;
    content: string;
    departmentId?: string | null;
  }) => apiRequest<ApiQuickReply>("/quick-replies", { method: "POST", body: JSON.stringify(data) }),
  update: (
    id: string,
    data: { title?: string; shortcut?: string; content?: string; departmentId?: string | null },
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

export const messageApi = {
  list: (conversationId: string, params: { limit?: number; cursor?: string } = {}) =>
    apiRequest<MessagePage>(`/conversations/${conversationId}/messages${queryString(params)}`),
  sendText: (conversationId: string, content: string, clientMessageId = crypto.randomUUID()) =>
    apiRequest<ApiMessage>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, clientMessageId }),
    }),
  markRead: (conversationId: string) =>
    apiRequest<{ unreadCount: number; readAt: string }>(
      `/conversations/${conversationId}/messages/read`,
      { method: "PATCH" },
    ),
};

export const connectionsApi = {
  list: () => apiRequest<ApiMessagingConnection[]>("/messaging/connections"),
  createEvolution: (data: { name: string; instanceName?: string }) =>
    apiRequest<ApiMessagingConnection>("/messaging/connections/evolution", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  status: (id: string) => apiRequest<ApiMessagingConnection>(`/messaging/connections/${id}/status`),
  qr: (id: string) =>
    apiRequest<{ connectionId: string; qrCodeBase64: string | null; status: string }>(
      `/messaging/connections/${id}/qr`,
    ),
  logout: (id: string) =>
    apiRequest<ApiMessagingConnection>(`/messaging/connections/${id}/logout`, {
      method: "PATCH",
    }),
  remove: (id: string) =>
    apiRequest<{ id: string; removed: boolean; providerInstanceExisted: boolean }>(
      `/messaging/connections/${id}`,
      { method: "DELETE" },
    ),
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
    let response = await fetchNexos(
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
      response = await fetchNexos(
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
    let response = await fetchNexos(
      `/tickets/${id}/attachments/${attachmentId}/download`,
      {},
      true,
    );
    if (response.status === 401 && (await refreshAccessToken())) {
      response = await fetchNexos(`/tickets/${id}/attachments/${attachmentId}/download`, {}, true);
    }
    if (!response.ok) throw await readError(response);
    return response.blob();
  },
  preview: async (id: string, attachmentId: string) => {
    let response = await fetchNexos(`/tickets/${id}/attachments/${attachmentId}/inline`, {}, true);
    if (response.status === 401 && (await refreshAccessToken())) {
      response = await fetchNexos(`/tickets/${id}/attachments/${attachmentId}/inline`, {}, true);
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
  tenants: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<PlatformTenant>>(`/platform/tenants${queryString(params)}`),
  tenant: (id: string) => apiRequest<PlatformTenantDetail>(`/platform/tenants/${id}`),
  createTenant: (data: {
    name: string;
    slug: string;
    timezone?: string;
    locale?: string;
    planId: string;
    admin: { email: string; name: string; password: string };
  }) =>
    apiRequest<PlatformTenantDetail>("/platform/tenants", {
      method: "POST",
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
  subscriptions: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<PlatformSubscription>>(
      `/platform/subscriptions${queryString(params)}`,
    ),
  subscription: (id: string) => apiRequest<PlatformSubscription>(`/platform/subscriptions/${id}`),
  invoices: (params: ListParams = {}) =>
    apiRequest<PaginatedResponse<PlatformInvoice>>(`/platform/invoices${queryString(params)}`),
  invoice: (id: string) => apiRequest<PlatformInvoice>(`/platform/invoices/${id}`),
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
    throw new NexosApiError("Sessao de plataforma ausente.", 401, "PLATFORM_SESSION_MISSING");
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
  storeNexosSession(data.tokens);
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

export function clearNexosApiSession() {
  sessionAlreadyCleared = true;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(TENANT_KEY);
  localStorage.removeItem(IMPERSONATION_KEY);
}

export async function logoutFromNexosApi() {
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
    await fetchNexos("/auth/logout", { method: "POST" }, true);
  } finally {
    clearNexosApiSession();
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
    const message = Array.isArray(data.message)
      ? data.message.join(", ")
      : data.message || data.error || authMessageFromStatus(response.status, data.code);
    if (message) return new NexosApiError(message, response.status, data.code, data.details);
    const mapped = authMessageFromStatus(response.status, data.code);
    if (mapped) return new NexosApiError(mapped, response.status, data.code, data.details);
    return new NexosApiError("Erro na API Nexos.", response.status, data.code, data.details);
  } catch {
    return new NexosApiError("Erro na API Nexos.", response.status);
  }
}

async function authErrorFromResponse(response: Response) {
  try {
    const data = (await response.json()) as { code?: string; message?: string | string[] };
    return new Error(
      authMessageFromStatus(response.status, data.code) ??
        (Array.isArray(data.message) ? data.message.join(", ") : data.message) ??
        "Ocorreu um erro interno ao autenticar.",
    );
  } catch {
    return new Error(
      authMessageFromStatus(response.status) ?? "Ocorreu um erro interno ao autenticar.",
    );
  }
}

function authMessageFromStatus(status: number, code?: string) {
  if (status === 401) return "E-mail ou senha invalidos.";
  if (status === 403) {
    if (code === "USER_WITHOUT_ACTIVE_MEMBERSHIP") {
      return "Seu usuario nao possui acesso a nenhuma organizacao ativa.";
    }
    if (code === "TENANT_INACTIVE") return "A organizacao vinculada ao usuario esta inativa.";
    return "Seu usuario nao possui permissao para acessar este ambiente.";
  }
  if (status === 429) return "Muitas tentativas de acesso. Aguarde e tente novamente.";
  if (status >= 500) return "Ocorreu um erro interno ao autenticar.";
  return null;
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
    const response = await fetchNexos("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      clearNexosApiSession();
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

function storeNexosSession(data: LoginResponse) {
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
    JSON.stringify({ id: "platform", slug: "platform", name: "Nexos Platform" }),
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
