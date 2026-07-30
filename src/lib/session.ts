import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearNexosApiSession, hydrateWithNexosApi, loginWithNexosApi } from "@/lib/nexos-api";

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

export const DEMO_ACCOUNTS = [
  {
    id: "demo-admin",
    nome: "Ana Ribeiro",
    email: "admin@nexo.app",
    password: "demo1234",
    role: "admin" as Role,
    empresaNome: "Acme Corp",
  },
  {
    id: "demo-agent",
    nome: "Camila Duarte",
    email: "atendente@nexo.app",
    password: "demo1234",
    role: "operator" as Role,
    empresaNome: "Acme Corp",
  },
];

type SessionState = {
  user: SessionUser | null;
  impersonating: { empresaId: string; empresaNome: string } | null;
  hydrated: boolean;
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
      loginAs: (user) => set({ user, impersonating: null, hydrated: true }),
      logout: () => set({ user: null, impersonating: null }),
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
    useSession.setState({ user, hydrated: true });
  } catch {
    useSession.setState({ user: null, hydrated: true });
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const user = await loginWithNexosApi(email, password);
  useSession.getState().loginAs(user);
}

export async function signOut(): Promise<void> {
  clearNexosApiSession();
  useSession.setState({ user: null, impersonating: null, hydrated: true });
}
