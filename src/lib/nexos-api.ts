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
