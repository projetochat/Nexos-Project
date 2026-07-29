import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/integrations/supabase/client";

/* ============================================================
   Nexo · Session
   Store client-side de sessão, hidratado a partir do Supabase Auth.
   Mantém API compatível com os componentes existentes.
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
};

export const ROLE_META: Record<Role, { label: string; scope: string; home: string }> = {
  super_admin: { label: "Super Admin", scope: "Plataforma Nexo", home: "/admin" },
  admin: { label: "Administrador", scope: "Empresa", home: "/" },
  supervisor: { label: "Supervisor", scope: "Empresa", home: "/" },
  operator: { label: "Atendente", scope: "Central de Atendimento", home: "/inbox" },
};

// Contas demo para o login rápido (criadas sob demanda no Supabase)
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
      loginAs: (user) => set({ user, impersonating: null }),
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

/** Hidrata a sessão a partir do Supabase (auth + user_roles + agents). */
export async function hydrateSession(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const authUser = data.user;
  if (!authUser) {
    useSession.setState({ user: null, hydrated: true });
    return;
  }
  const [{ data: roles }, { data: agent }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", authUser.id),
    supabase.from("agents").select("nome, avatar_url").eq("id", authUser.id).maybeSingle(),
  ]);
  const isAdmin = roles?.some((r) => r.role === "admin") ?? false;
  useSession.setState({
    user: {
      id: authUser.id,
      nome: agent?.nome ?? authUser.email?.split("@")[0] ?? "Usuário",
      email: authUser.email ?? "",
      role: isAdmin ? "admin" : "operator",
      avatarUrl: agent?.avatar_url ?? undefined,
    },
    hydrated: true,
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await hydrateSession();
  // marca agente como online
  const uid = useSession.getState().user?.id;
  if (uid) await supabase.from("agents").update({ status: "online", last_seen: new Date().toISOString() }).eq("id", uid);
}

export async function signOut(): Promise<void> {
  const uid = useSession.getState().user?.id;
  if (uid) await supabase.from("agents").update({ status: "offline", last_seen: new Date().toISOString() }).eq("id", uid);
  await supabase.auth.signOut();
  useSession.setState({ user: null, impersonating: null });
}
