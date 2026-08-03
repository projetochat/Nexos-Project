import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hydrateWithNexosApi, loginWithNexosApi, logoutFromNexosApi } from "@/lib/nexos-api";

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
  impersonating: { empresaId: string; empresaNome: string } | null;
  hydrated: boolean;
  error: string | null;
  loginAs: (user: SessionUser) => void;
  logout: () => void;
  impersonate: (empresaId: string, empresaNome: string) => void;
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
      impersonate: (empresaId, empresaNome) => set({ impersonating: { empresaId, empresaNome } }),
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
  try {
    const user = await hydrateWithNexosApi();
    useSession.setState({ user, hydrated: true, error: null });
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
