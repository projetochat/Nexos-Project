import type { Role, SessionUser } from "@/lib/session";

const ACCESS_KEY = "nexo.api.accessToken";
const REFRESH_KEY = "nexo.api.refreshToken";
const TENANT_KEY = "nexo.api.tenant";

type ApiRole = "SUPER_ADMIN" | "ADMIN" | "SUPERVISOR" | "OPERATOR";

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: ApiRole;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
};

const roleMap: Record<ApiRole, Role> = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  OPERATOR: "operator",
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
    role: roleMap[data.user.role],
    empresaId: data.tenant.id,
    empresaNome: data.tenant.name,
  };
  return user;
}

export function clearNexosApiSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(TENANT_KEY);
}

function storeNexosSession(data: LoginResponse) {
  localStorage.setItem(ACCESS_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(TENANT_KEY, JSON.stringify(data.tenant));
}
