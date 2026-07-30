import type { Role, SessionUser } from "@/lib/session";

const ACCESS_KEY = "nexo.api.accessToken";
const REFRESH_KEY = "nexo.api.refreshToken";
const TENANT_KEY = "nexo.api.tenant";

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
    platformRole: "USER" | "ADMIN";
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  permissions: string[];
};

type MeResponse = {
  user: LoginResponse["user"] & { roleName: string };
  tenant: LoginResponse["tenant"];
  permissions: string[];
};

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
    platformRole: "USER" | "ADMIN";
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
};

export type ApiConversationStatus = "aberta" | "em_andamento" | "aguardando" | "fechada";

export type ApiConversation = {
  id: string;
  tenantId: string;
  contact_id: string;
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
  status: "created" | "sending" | "sent" | "failed" | "delivered" | "read";
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
  status: "disconnected" | "connecting" | "connected" | "error";
  externalReference: string | null;
  provider?: {
    existsInProvider?: boolean;
    webhookUrl?: string | null;
    reason?: string;
  };
  createdAt: string;
  updatedAt: string;
  qrCodeBase64?: string | null;
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
  assignToSelf?: boolean;
  isGroup?: boolean;
  firstMessagePreview?: string | null;
};

const roleMap: Record<string, Role> = {
  tenant_admin: "admin",
  supervisor: "supervisor",
  agent: "operator",
};

export function nexosApiBaseUrl() {
  return import.meta.env.VITE_NEXOS_API_URL || "http://localhost:3001/api";
}

export async function loginWithNexosApi(email: string, password: string, tenantSlug = "acme") {
  const response = await fetch(`${nexosApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenantSlug }),
  });
  if (!response.ok) throw new Error("API Nexos indisponivel ou credenciais invalidas.");

  const data = (await response.json()) as LoginResponse;
  storeNexosSession(data);

  const user: SessionUser = {
    id: data.user.id,
    nome: data.user.name,
    email: data.user.email,
    role: roleMap[data.user.roleKey] ?? "operator",
    empresaId: data.tenant.id,
    empresaNome: data.tenant.name,
    permissions: data.permissions,
  };
  return user;
}

export async function hydrateWithNexosApi() {
  const data = await apiRequest<MeResponse>("/me");
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

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${nexosApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const message = await readError(response);
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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
  contactOptions: () =>
    apiRequest<{ instances: string[]; departments: string[]; tags: ApiTag[] }>(
      "/crm/contacts/options",
    ),
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

export function clearNexosApiSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(TENANT_KEY);
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(data.message)) return data.message.join(", ");
    return data.message ?? data.error ?? "Erro na API Nexos.";
  } catch {
    return "Erro na API Nexos.";
  }
}

function storeNexosSession(data: LoginResponse) {
  localStorage.setItem(ACCESS_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(TENANT_KEY, JSON.stringify(data.tenant));
}

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}
