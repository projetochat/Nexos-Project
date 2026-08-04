import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  hydrateWithNexosApi,
  loginWithNexosApi,
  logoutFromNexosApi,
  readStoredPlatformImpersonation,
} from "@/lib/nexos-api";

/* ============================================================
   Nexo Session
   Store client-side de sessao, hidratado a partir da Nexos API.
   Mantem API compativel com os componentes existentes.
   ============================================================ */

export type Role = "super_admin" | "admin" | "supervisor" | "operator";

export type SessionUser = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  empresaId?: string;
  empresaNome?: string;
  avatarUrl?: string;
  permissions?: string[];
};

export const ROLE_META: Record<Role, { label: string; scope: string; home: string }> = {
  super_admin: { label: "Super Admin", scope: "Plataforma Nexo", home: "/admin" },
  admin: { label: "Administrador", scope: "Empresa", home: "/" },
  supervisor: { label: "Supervisor", scope: "Empresa", home: "/" },
  operator: { label: "Atendente", scope: "Central de Atendimento", home: "/inbox" },
};

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
    { name: "nexo.session" },
  ),
);

export function currentRoleHome(role: Role | undefined): string {
  if (!role) return "/login";
  return ROLE_META[role].home;
}

export async function hydrateSession(): Promise<void> {
  const impersonation = readStoredPlatformImpersonation();
  try {
    const user = await hydrateWithNexosApi();
    useSession.setState({
      user,
      impersonating: impersonation
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

export async function signIn(email: string, password: string): Promise<void> {
  const user = await loginWithNexosApi(email, password);
  useSession.getState().loginAs(user);
}

export async function signOut(): Promise<void> {
  await logoutFromNexosApi();
  useSession.setState({ user: null, impersonating: null, hydrated: true });
  localStorage.setItem("nexo.session.logoutAt", String(Date.now()));
}
