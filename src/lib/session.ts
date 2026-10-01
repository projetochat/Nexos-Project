import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  acceptTenantInvitationWithTrixusApi,
  completeRequiredPasswordChangeWithTrixusApi,
  hydrateWithTrixusApi,
  loginWithTrixusApi,
  logoutFromTrixusApi,
  readStoredHandoffImpersonation,
  readStoredPlatformImpersonation,
  selectTenantWithTrixusApi,
  type RequiredPasswordChange,
  type TenantSelectionRequired,
} from "@/lib/trixus-api";
import { effectiveSessionPermissions } from "@/lib/access-permissions";

/* ============================================================
   Trixus Session
   Store client-side de sessao, hidratado a partir da Trixus API.
   Mantem API compativel com os componentes existentes.
   ============================================================ */

export type Role = "super_admin" | "admin" | "supervisor" | "operator";

export type SessionUser = {
  id: string;
  roleId?: string;
  nome: string;
  email: string;
  role: Role;
  empresaId?: string;
  empresaNome?: string;
  avatarUrl?: string;
  keepSidebarCollapsed?: boolean;
  permissions?: string[];
};

export const ROLE_META: Record<Role, { label: string; scope: string }> = {
  super_admin: { label: "Super Admin", scope: "Plataforma Trixus" },
  admin: { label: "Administrador", scope: "Empresa" },
  supervisor: { label: "Supervisor", scope: "Empresa" },
  operator: { label: "Atendente", scope: "Central de Atendimento" },
};

export const TENANT_ROUTE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  "/": ["dashboard.read"],
  "/inbox": ["conversations.read"],
  "/clientes": ["crm.read", "crm.manage"],
  "/contatos": ["contacts.read"],
  "/historico": ["history.read"],
  "/atendentes": ["users.read"],
  "/perfis": ["roles.read"],
  "/departamentos": ["departments.read"],
  "/etiquetas": ["chat.tags.read"],
  "/mensagens-rapidas": ["chat.quick_replies.read"],
  "/agendamentos": ["schedules.read"],
  "/campanhas": ["campaigns.read"],
  "/filas": ["conversations.manage"],
  "/bi": ["crm.read", "conversations.read", "campaigns.read", "tickets.read"],
  "/instancias": ["connections.read"],
  "/grupos": ["groups.read"],
  "/chatbot": ["bot_flows.read"],
  "/automacoes": ["automations.read"],
  "/agente-ia": ["ai_agents.read"],
  "/chamados": ["tickets.read"],
  "/configuracoes": ["settings.read"],
  "/relatorios": ["crm.read", "conversations.read", "campaigns.read", "tickets.read"],
};

const TENANT_PUBLIC_ROUTES = new Set(["/perfil", "/ajuda"]);

// Ordem da navegação universal do tenant: dashboard, operação e administração.
const TENANT_HOME_CANDIDATES = [
  "/",
  "/inbox",
  "/contatos",
  "/grupos",
  "/historico",
  "/atendentes",
  "/perfis",
  "/departamentos",
  "/etiquetas",
  "/mensagens-rapidas",
  "/agendamentos",
  "/campanhas",
  "/instancias",
  "/chatbot",
  "/automacoes",
  "/agente-ia",
  "/chamados",
  "/configuracoes",
] as const;

function matchingTenantRoute(pathname: string) {
  return Object.keys(TENANT_ROUTE_PERMISSIONS)
    .filter((candidate) =>
      candidate === "/"
        ? pathname === "/"
        : pathname === candidate || pathname.startsWith(candidate + "/"),
    )
    .sort((left, right) => right.length - left.length)[0];
}

export function canAccessTenantRoute(pathname: string, permissions?: readonly string[]): boolean {
  if (TENANT_PUBLIC_ROUTES.has(pathname)) return true;
  const route = matchingTenantRoute(pathname);
  if (!route) return false;
  const required = TENANT_ROUTE_PERMISSIONS[route];
  return required.some((permission) => permissions?.includes(permission));
}

export function tenantHomeForPermissions(permissions?: readonly string[]): string {
  return (
    TENANT_HOME_CANDIDATES.find((route) => canAccessTenantRoute(route, permissions)) ?? "/perfil"
  );
}

type SessionState = {
  user: SessionUser | null;
  impersonating: {
    sessionId: string;
    empresaId: string;
    empresaNome: string;
    membershipId: string;
    expiresAt: string;
    actorName: string;
    actorEmail: string;
  } | null;
  hydrated: boolean;
  error: string | null;
  loginAs: (user: SessionUser) => void;
  logout: () => void;
  impersonate: (input: {
    sessionId: string;
    empresaId: string;
    empresaNome: string;
    membershipId: string;
    expiresAt: string;
    actorName: string;
    actorEmail: string;
  }) => void;
  stopImpersonation: () => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      impersonating: null,
      hydrated: false,
      error: null,
      loginAs: (user) => set({ user, impersonating: null, hydrated: true, error: null }),
      logout: () => set({ user: null, impersonating: null, error: null }),
      impersonate: (input) => set({ impersonating: input }),
      stopImpersonation: () => set({ impersonating: null }),
    }),
    {
      name: "trixus.session",
      version: 1,
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SessionState>;
        const user = persisted.user
          ? {
              ...persisted.user,
              permissions: effectiveSessionPermissions(
                persisted.user.role,
                persisted.user.permissions,
              ),
            }
          : null;
        return { ...currentState, ...persisted, user };
      },
    },
  ),
);

export function currentRoleHome(
  role: Role | undefined,
  permissions = useSession.getState().user?.permissions,
): string {
  if (!role) return "/login";
  return role === "super_admin" ? "/admin" : tenantHomeForPermissions(permissions);
}

export async function hydrateSession(): Promise<void> {
  const impersonation = readStoredPlatformImpersonation();
  const handoffImpersonation = readStoredHandoffImpersonation();
  try {
    const user = await hydrateWithTrixusApi();
    useSession.setState({
      user,
      impersonating: handoffImpersonation
        ? {
            sessionId: handoffImpersonation.id,
            empresaId: handoffImpersonation.tenant.id,
            empresaNome: handoffImpersonation.tenant.name,
            membershipId: handoffImpersonation.membershipId,
            expiresAt: handoffImpersonation.expiresAt,
            actorName: handoffImpersonation.actorUser.name,
            actorEmail: handoffImpersonation.actorUser.email,
          }
        : impersonation
          ? {
              sessionId: impersonation.id,
              empresaId: impersonation.tenant.id,
              empresaNome: impersonation.tenant.name,
              membershipId: impersonation.membershipId,
              expiresAt: impersonation.expiresAt,
              actorName: impersonation.actorUser.nome,
              actorEmail: impersonation.actorUser.email,
            }
          : null,
      hydrated: true,
      error: null,
    });
  } catch (error) {
    useSession.setState({ user: null, hydrated: true, error: (error as Error).message });
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<RequiredPasswordChange | TenantSelectionRequired | null> {
  const result = await loginWithTrixusApi(email, password);
  if ("passwordChangeRequired" in result || "tenantSelectionRequired" in result) return result;
  useSession.getState().loginAs(result);
  return null;
}

export async function completeRequiredPasswordChange(input: {
  setupToken: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<TenantSelectionRequired | null> {
  const result = await completeRequiredPasswordChangeWithTrixusApi(input);
  if ("tenantSelectionRequired" in result) return result;
  useSession.getState().loginAs(result);
  return null;
}

export async function selectTenant(input: {
  selectionToken: string;
  tenantId: string;
}): Promise<RequiredPasswordChange | null> {
  const result = await selectTenantWithTrixusApi(input);
  if ("passwordChangeRequired" in result) return result;
  useSession.getState().loginAs(result);
  return null;
}

export async function acceptTenantInvitation(input: {
  token: string;
  password: string;
  name?: string;
}): Promise<void> {
  const user = await acceptTenantInvitationWithTrixusApi(input);
  useSession.getState().loginAs(user);
}

export async function signOut(): Promise<void> {
  await logoutFromTrixusApi();
  useSession.setState({ user: null, impersonating: null, hydrated: true });
  localStorage.setItem("trixus.session.logoutAt", String(Date.now()));
}
