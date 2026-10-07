import {
  WEEK_DAYS,
  createWorkPeriod,
  normalizeWorkSchedule,
  workScheduleError,
  workPeriodError,
  type WeekDay,
  type WorkPeriod,
  type WorkSchedule,
} from "@/lib/work-schedule";
import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Check,
  Copy,
  Info,
  Star,
  KeyRound,
  Wifi,
  Network,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  SectionHeader,
  Card,
  Button,
  Field,
  Input,
  Textarea,
  SearchInput,
} from "@/components/ui-kit";
import { Modal, ConfirmDialog } from "@/components/modal";
import { useDisclosure } from "@/hooks/use-disclosure";
import { num } from "@/lib/format";
import { sortByOptionLabel } from "@/lib/sort-options";
import { organizationApi, type ApiRole, type ApiUserMembership } from "@/lib/trixus-api";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { Switch } from "@/components/ui/switch";
import { tenantModules, useTenantEntitlements } from "@/hooks/use-tenant-entitlements";
import {
  delegatedPermissionIds,
  permissionDependencyIssue,
  togglePermissionGroupInTree,
  togglePermissionInTree,
} from "@/lib/access-profile-permission-tree";

export const Route = createFileRoute("/perfis")({
  validateSearch: (search) => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
    tab:
      search.tab === "visualizacao" || search.tab === "acessos" || search.tab === "jornada"
        ? search.tab
        : undefined,
  }),
  component: Page,
});

type PerfilTab = "geral" | "visualizacao" | "acessos" | "jornada";
type PermissionTab = "chat" | "administracao" | "chamados";
type PermissionField = { id: string; label: string; description: string };

const PERMISSION_GROUPS: Array<{
  title: string;
  tab: PermissionTab;
  items: PermissionField[];
}> = [
  {
    title: "Dashboard",
    tab: "chat",
    items: [
      { id: "dashboard.read", label: "Ver", description: "Permite visualizar o dashboard." },
      {
        id: "dashboard.create",
        label: "Criar",
        description: "Permite criar componentes do dashboard.",
      },
      {
        id: "dashboard.update",
        label: "Editar",
        description: "Permite editar os componentes do dashboard.",
      },
      {
        id: "dashboard.delete",
        label: "Excluir",
        description: "Permite excluir os componentes do dashboard.",
      },
    ],
  },
  {
    title: "Chat",
    tab: "chat",
    items: [
      {
        id: "conversations.read",
        label: "Ver conversas",
        description: "Permite visualizar as conversas.",
      },
      {
        id: "messages.send",
        label: "Enviar mensagens",
        description: "Permite enviar mensagens para os contatos.",
      },
      {
        id: "chat.messages.edit",
        label: "Editar mensagens",
        description: "Permite editar as mensagens enviadas.",
      },
      {
        id: "chat.messages.delete",
        label: "Apagar mensagens",
        description: "Permite apagar as mensagens enviadas.",
      },
      {
        id: "chat.agent_name.show",
        label: "Assinar mensagem",
        description: "Apresentar o nome do atendente nas mensagens enviadas.",
      },
      {
        id: "history.read",
        label: "Ver histórico de conversas",
        description: "Permite visualizar o histórico de conversas.",
      },
      {
        id: "conversations.assign",
        label: "Transferir conversas",
        description: "Permite transferir conversa para fila, atendente ou departamento.",
      },
      {
        id: "chat.phone.read",
        label: "Ver telefone",
        description: "Permite visualizar o telefone dos contatos no chat.",
      },
      {
        id: "chat.conversations.view_all_active",
        label: "Ver todas as conversas",
        description: "Permite visualizar conversas de outros atendentes.",
      },
      {
        id: "chat.bulk_actions.execute",
        label: "Executa ações em massa",
        description: "Permite executar ações que afetam várias conversas.",
      },
    ],
  },
  {
    title: "Contatos",
    tab: "chat",
    items: [
      { id: "contacts.read", label: "Ver", description: "Permite visualizar os contatos." },
      {
        id: "contacts.create",
        label: "Criar",
        description: "Permite criar contatos.",
      },
      {
        id: "contacts.update",
        label: "Editar",
        description: "Permite editar contatos.",
      },
      { id: "contacts.delete", label: "Excluir", description: "Permite excluir os contatos." },
      {
        id: "contacts.additional_fields.read",
        label: "Ver campos adicionais",
        description: "Permite visualizar os campos adicionais dos contatos.",
      },
    ],
  },
  {
    title: "Gerenciar Grupos",
    tab: "chat",
    items: [
      { id: "groups.read", label: "Ver", description: "Permite visualizar os grupos." },
      {
        id: "groups.create",
        label: "Criar",
        description: "Permite criar grupos.",
      },
      {
        id: "groups.update",
        label: "Editar",
        description: "Permite editar grupos e seus participantes.",
      },
      {
        id: "groups.leave",
        label: "Sair",
        description: "Permite sair de grupos do WhatsApp.",
      },
    ],
  },
  ...(
    [
      ["Atendentes", "users.read", "users.create", "users.update", "users.delete", "atendentes"],
      [
        "Perfil de Acesso",
        "roles.read",
        "roles.create",
        "roles.update",
        "roles.delete",
        "perfis de acesso",
      ],
      [
        "Departamentos",
        "departments.read",
        "departments.create",
        "departments.update",
        "departments.delete",
        "departamentos",
      ],
      [
        "Etiquetas",
        "chat.tags.read",
        "chat.tags.create",
        "chat.tags.update",
        "chat.tags.delete",
        "etiquetas",
      ],
      [
        "Mensagens Rápidas",
        "chat.quick_replies.read",
        "chat.quick_replies.create",
        "chat.quick_replies.update",
        "chat.quick_replies.delete",
        "mensagens rápidas",
      ],
      [
        "Agendamentos",
        "schedules.read",
        "schedules.create",
        "schedules.update",
        "schedules.delete",
        "agendamentos",
      ],
      [
        "Instâncias",
        "connections.read",
        "connections.create",
        "connections.update",
        "connections.delete",
        "instâncias",
      ],
      [
        "Fluxo de Bot",
        "bot_flows.read",
        "bot_flows.create",
        "bot_flows.update",
        "bot_flows.delete",
        "fluxos de bot",
      ],
      [
        "Automações",
        "automations.read",
        "automations.create",
        "automations.update",
        "automations.delete",
        "automações",
      ],
      [
        "Agente de IA",
        "ai_agents.read",
        "ai_agents.create",
        "ai_agents.update",
        "ai_agents.delete",
        "agentes de IA",
      ],
    ] as const
  ).map(([title, read, create, update, remove, resource]) => ({
    title,
    tab: "administracao" as const,
    items: [
      { id: read, label: "Ver", description: `Permite visualizar ${resource}.` },
      { id: create, label: "Criar", description: `Permite criar ${resource}.` },
      { id: update, label: "Editar", description: `Permite editar ${resource}.` },
      {
        id: remove,
        label: "Excluir",
        description:
          title === "Instâncias"
            ? "Permite excluir/desconectar instâncias."
            : `Permite excluir ${resource}.`,
      },
    ],
  })),
  {
    title: "Configurações",
    tab: "administracao",
    items: [
      {
        id: "settings.manage",
        label: "Configurar",
        description: "Permite acesso geral às configurações.",
      },
    ],
  },
  {
    title: "Campanhas",
    tab: "administracao",
    items: [
      { id: "campaigns.read", label: "Ver", description: "Permite visualizar campanhas." },
      { id: "campaigns.create", label: "Criar", description: "Permite criar campanhas." },
      {
        id: "campaigns.update",
        label: "Editar",
        description: "Permite editar campanhas.",
      },
      { id: "campaigns.delete", label: "Excluir", description: "Permite excluir campanhas." },
    ],
  },
  {
    title: "Chamados",
    tab: "chamados",
    items: [
      { id: "tickets.read", label: "Ver", description: "Permite visualizar os chamados." },
      { id: "tickets.create", label: "Criar", description: "Permite criar chamados." },
      {
        id: "tickets.update",
        label: "Editar",
        description: "Permite editar os chamados.",
      },
      { id: "tickets.delete", label: "Excluir", description: "Permite excluir os chamados." },
    ],
  },
];

const DEFAULT_ROLE_COLOR = "#3B82F6";
function countRoleMembers(memberships: ApiUserMembership[]) {
  return memberships.reduce<Record<string, number>>((acc, membership) => {
    acc[membership.role.id] = (acc[membership.role.id] ?? 0) + 1;
    return acc;
  }, {});
}

function formatMemberCount(count: number) {
  return count === 1 ? "1 atendente" : `${num(count)} atendentes`;
}

function roleColor(role: ApiRole) {
  const metadata = (role.metadata ?? {}) as RoleMetadata;
  return metadata.color ?? DEFAULT_ROLE_COLOR;
}

function roleScopeCounts(role: ApiRole) {
  const metadata = (role.metadata ?? {}) as RoleMetadata;
  const scopes = metadata.chatScopes ?? [];
  const connectionIds = new Set([
    ...(metadata.connectionIds ?? []),
    ...scopes.map((scope) => scope.connectionId),
  ]);
  const departmentIds = new Set([
    ...(metadata.departmentIds ?? []),
    ...scopes.flatMap((scope) => scope.departmentIds),
  ]);
  return { connections: connectionIds.size, departments: departmentIds.size };
}

function permissionCatalogSize(groups: typeof PERMISSION_GROUPS) {
  return new Set(groups.flatMap((group) => group.items.map((permission) => permission.id))).size;
}

function normalizeRoleName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function isAdministratorRole(role: ApiRole) {
  return role.key === "tenant_admin" || normalizeRoleName(role.name) === "administrador";
}

function duplicateRoleDraft(role: ApiRole, roles: ApiRole[]): ApiRole {
  const existingNames = new Set(roles.map((item) => normalizeRoleName(item.name)));
  let name = `${role.name} - Cópia`;
  let count = 2;
  while (existingNames.has(normalizeRoleName(name))) name = `${role.name} - Cópia (${count++})`;
  return {
    ...role,
    id: "",
    key: "",
    name,
  };
}

function roleWithLogFallback(role: ApiRole, previous?: ApiRole | null) {
  const now = new Date().toISOString();
  return {
    ...role,
    createdAt: role.createdAt ?? previous?.createdAt ?? now,
    updatedAt: role.updatedAt ?? now,
  };
}

function defaultWorkSchedule(): WorkSchedule {
  const days = {} as WorkSchedule["days"];
  for (const day of WEEK_DAYS) {
    const weekday = !["Sabado", "Domingo"].includes(day);
    days[day] = {
      active: weekday,
      periods: [createWorkPeriod()],
    };
  }
  return { noSchedule: true, days };
}

export type PerfilFormData = {
  name: string;
  description: string;
  color: string;
  language: string;
  timezone: string;
  permissionIds: string[];
  departmentIds: string[];
  connectionIds: string[];
  chatScopes: ChatScopeForm[];
  workSchedule: WorkSchedule;
};

type RoleMetadata = {
  departmentIds?: string[];
  connectionIds?: string[];
  chatScopes?: ChatScopeForm[];
  workSchedule?: WorkSchedule;
  color?: string;
  language?: string;
  timezone?: string;
};

type ChatScopeForm = {
  connectionId: string;
  departmentIds: string[];
  favoriteDepartmentId: string | null;
};

type RoleScopeConnection = {
  id: string;
  name: string;
  status: string;
  departments: Array<{
    id: string;
    name: string;
    description: string | null;
    color: string;
    icon: string;
  }>;
};

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/perfis" });
  const search = Route.useSearch();
  const currentUser = useSession((state) => state.user);
  const entitlements = useTenantEntitlements();
  const enabledModules = tenantModules(entitlements.data?.features);
  const permissionGroups = React.useMemo(
    () =>
      PERMISSION_GROUPS.filter(
        (group) =>
          (group.title !== "Campanhas" || enabledModules.campaigns) &&
          (group.title !== "Chamados" || enabledModules.tickets),
      ),
    [enabledModules.campaigns, enabledModules.tickets],
  );
  const grantedPermissions = React.useMemo(
    () => currentUser?.permissions ?? [],
    [currentUser?.permissions],
  );
  const canCreateRoles = grantedPermissions.includes("roles.create");
  const canUpdateRoles = grantedPermissions.includes("roles.update");
  const canDeleteRoles = grantedPermissions.includes("roles.delete");
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["trixus", "roles"],
    queryFn: organizationApi.listRoles,
  });
  const { data: scopeOptions } = useQuery({
    queryKey: ["trixus", "role-scope-options"],
    queryFn: organizationApi.roleScopeOptions,
  });
  const connections = scopeOptions?.connections ?? [];
  const { data: memberships = [] } = useQuery({
    queryKey: ["trixus", "users"],
    queryFn: organizationApi.listUsers,
    enabled: grantedPermissions.includes("users.read"),
  });
  const grantablePermissionIds = React.useMemo(() => {
    if (currentUser?.role === "admin") return grantedPermissions;
    return items.find((role) => role.id === currentUser?.roleId)?.permissionIds ?? [];
  }, [currentUser?.role, currentUser?.roleId, grantedPermissions, items]);

  const [editing, setEditing] = React.useState<ApiRole | null>(null);
  const [duplicating, setDuplicating] = React.useState<ApiRole | null>(null);
  const [deleting, setDeleting] = React.useState<ApiRole | null>(null);
  const [query, setQuery] = React.useState("");
  const novo = useDisclosure();
  const memberCountByRoleId = React.useMemo(() => countRoleMembers(memberships), [memberships]);

  const closeEditing = React.useCallback(() => {
    setEditing(null);
    if (search.edit) {
      void navigate({ search: { edit: undefined, tab: undefined }, replace: true });
    }
  }, [navigate, search.edit]);

  React.useEffect(() => {
    if (!search.edit || !canUpdateRoles) return;
    const requestedRole = items.find((role) => role.id === search.edit);
    if (!requestedRole || isAdministratorRole(requestedRole)) return;
    setEditing((current) => (current?.id === requestedRole.id ? current : requestedRole));
  }, [canUpdateRoles, items, search.edit]);

  const filtered = sortByOptionLabel(items, (perfil) => perfil.name).filter((p) => {
    if (
      query &&
      !(p.name + " " + (p.description ?? "")).toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const save = useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: PerfilFormData }) => {
      const existingMetadata = id ? items.find((role) => role.id === id)?.metadata : undefined;
      const metadata = {
        ...(existingMetadata &&
        typeof existingMetadata === "object" &&
        !Array.isArray(existingMetadata)
          ? existingMetadata
          : {}),
        departmentIds: data.departmentIds,
        connectionIds: data.connectionIds,
        chatScopes: data.chatScopes,
        workSchedule: data.workSchedule,
        color: data.color,
        language: data.language,
        timezone: data.timezone,
      };
      if (id) {
        return organizationApi.updateRole(id, {
          name: data.name,
          description: data.description,
          permissionIds: data.permissionIds,
          metadata,
        });
      }
      return organizationApi.createRole({
        name: data.name,
        description: data.description,
        permissionIds: data.permissionIds,
        metadata,
      });
    },
    onSuccess: (result, vars) => {
      const previous = vars.id ? editing : null;
      const savedRole = roleWithLogFallback(result, previous);
      qc.setQueryData<ApiRole[]>(["trixus", "roles"], (current = []) => {
        if (vars.id) {
          return current.map((role) =>
            role.id === savedRole.id ? roleWithLogFallback(savedRole, role) : role,
          );
        }
        return [savedRole, ...current];
      });
      qc.invalidateQueries({ queryKey: ["trixus", "roles"] });
      toast.success(vars.id ? "Perfil atualizado" : "Perfil criado");
      novo.hide();
      closeEditing();
      setDuplicating(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => organizationApi.deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trixus", "roles"] });
      toast.success("Perfil removido");
      setDeleting(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Perfil de Acesso"
          subtitle={`${num(items.length)} perfis cadastrados.`}
          actions={
            canCreateRoles ? (
              <Button variant="primary" size="sm" onClick={novo.show}>
                <Plus className="h-3.5 w-3.5" /> Novo Perfil de Acesso
              </Button>
            ) : undefined
          }
        />

        <Card className="mb-4 p-4">
          <Field label="Busca">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar perfil..." />
          </Field>
        </Card>

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            {items.length === 0 ? "Nenhum perfil cadastrado." : "Nenhum resultado."}
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const color = roleColor(p);
              const isAdministrator = isAdministratorRole(p);
              const scopeCounts = roleScopeCounts(p);
              const totalPermissions = permissionCatalogSize(permissionGroups);
              const permissionCount = isAdministrator
                ? totalPermissions
                : p.permissionIds.filter((id) =>
                    permissionGroups.some((group) =>
                      group.items.some((permission) => permission.id === id),
                    ),
                  ).length;

              return (
                <Card
                  key={p.id}
                  className="flex min-h-[166px] flex-col p-4 transition hover:border-primary/35 hover:bg-surface-1"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${color}24`, color }}
                    >
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.description?.trim() || formatMemberCount(memberCountByRoleId[p.id] ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3">
                    <RoleMetric
                      icon={KeyRound}
                      value={`${num(permissionCount)}/${num(totalPermissions)}`}
                      label="permissões"
                    />
                    <RoleMetric
                      icon={Wifi}
                      value={num(scopeCounts.connections)}
                      label={scopeCounts.connections === 1 ? "instância" : "instâncias"}
                    />
                    <RoleMetric
                      icon={Network}
                      value={num(scopeCounts.departments)}
                      label={scopeCounts.departments === 1 ? "departamento" : "departamentos"}
                    />
                  </div>

                  <div className="mt-auto flex min-h-11 items-end justify-end pt-3">
                    {!isAdministrator && (canCreateRoles || canUpdateRoles || canDeleteRoles) && (
                      <div className="flex shrink-0 gap-1.5">
                        {canCreateRoles && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="duplicate-action-button"
                            onClick={() => setDuplicating(duplicateRoleDraft(p, items))}
                            title="Duplicar Perfil de Acesso"
                            aria-label={`Duplicar Perfil de Acesso ${p.name}`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canUpdateRoles && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(p)}
                            title="Editar perfil"
                            aria-label={`Editar perfil ${p.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDeleteRoles && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="trash-action"
                            onClick={() => setDeleting(p)}
                            title="Excluir perfil"
                            aria-label={`Excluir perfil ${p.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <PerfilForm
          open={novo.open}
          roles={items}
          connections={connections}
          grantablePermissionIds={grantablePermissionIds}
          permissionGroups={permissionGroups}
          onClose={novo.hide}
          onSubmit={(data) => save.mutate({ data })}
        />
        <PerfilForm
          open={!!editing}
          roles={items}
          connections={connections}
          grantablePermissionIds={grantablePermissionIds}
          permissionGroups={permissionGroups}
          initial={editing ?? undefined}
          initialTab={
            search.edit === editing?.id
              ? ((search.tab as PerfilTab | undefined) ?? "geral")
              : "geral"
          }
          onClose={closeEditing}
          onSubmit={(data) => editing && save.mutate({ id: editing.id, data })}
        />
        <PerfilForm
          open={!!duplicating}
          roles={items}
          connections={connections}
          grantablePermissionIds={grantablePermissionIds}
          permissionGroups={permissionGroups}
          initial={duplicating ?? undefined}
          clone
          onClose={() => setDuplicating(null)}
          onSubmit={(data) => save.mutate({ data })}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Excluir Perfil?"
          destructive
          description={
            <p>
              Deseja realmente excluir o perfil{" "}
              <strong className="font-semibold text-foreground">"{deleting?.name ?? ""}"</strong>?
            </p>
          }
          confirmLabel="Excluir"
          onClose={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate(deleting.id)}
        />
      </PageContainer>
    </AppShell>
  );
}

function RoleMetric({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-none">{value}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function PerfilForm({
  open,
  onClose,
  onSubmit,
  initial,
  initialTab = "geral",
  clone = false,
  roles,
  connections,
  grantablePermissionIds,
  permissionGroups,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PerfilFormData) => void;
  initial?: ApiRole;
  initialTab?: PerfilTab;
  clone?: boolean;
  roles: ApiRole[];
  connections: RoleScopeConnection[];
  grantablePermissionIds: string[];
  permissionGroups: typeof PERMISSION_GROUPS;
}) {
  const [form, setForm] = React.useState<PerfilFormData>({
    name: "",
    description: "",
    color: DEFAULT_ROLE_COLOR,
    language: "system",
    timezone: "America/Sao_Paulo",
    permissionIds: [],
    departmentIds: [],
    connectionIds: [],
    chatScopes: [],
    workSchedule: defaultWorkSchedule(),
  });
  const [error, setError] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<PerfilTab>("geral");
  const duplicateNameError = (name: string) => {
    const normalizedName = normalizeRoleName(name);
    if (!normalizedName) return "";
    return roles.some(
      (role) => role.id !== initial?.id && normalizeRoleName(role.name) === normalizedName,
    )
      ? "Já existe um perfil de acesso com este nome."
      : "";
  };

  React.useEffect(() => {
    if (!open) return;
    const metadata = (initial?.metadata ?? {}) as RoleMetadata;
    setForm(
      initial
        ? {
            name: initial.name,
            description: initial.description ?? "",
            color: metadata.color ?? DEFAULT_ROLE_COLOR,
            language: metadata.language ?? "system",
            timezone: metadata.timezone ?? "America/Sao_Paulo",
            permissionIds: clone
              ? initial.permissionIds.filter(
                  (permissionId) =>
                    grantablePermissionIds.includes(permissionId) &&
                    permissionGroups.some((group) =>
                      group.items.some((permission) => permission.id === permissionId),
                    ),
                )
              : initial.permissionIds,
            departmentIds: metadata.departmentIds ?? [],
            connectionIds: metadata.connectionIds ?? [],
            chatScopes:
              metadata.chatScopes ??
              (metadata.connectionIds ?? []).map((connectionId) => ({
                connectionId,
                departmentIds: (metadata.departmentIds ?? []).filter((departmentId) =>
                  connections
                    .find((connection) => connection.id === connectionId)
                    ?.departments.some((department) => department.id === departmentId),
                ),
                favoriteDepartmentId: null,
              })),
            workSchedule: normalizeWorkSchedule(metadata.workSchedule ?? defaultWorkSchedule()),
          }
        : {
            name: "",
            description: "",
            color: DEFAULT_ROLE_COLOR,
            language: "system",
            timezone: "America/Sao_Paulo",
            permissionIds: ["departments.read", "contacts.read", "chat.quick_replies.read"].filter(
              (permissionId) => grantablePermissionIds.includes(permissionId),
            ),
            departmentIds: [],
            connectionIds: [],
            chatScopes: [],
            workSchedule: defaultWorkSchedule(),
          },
    );
    setError("");
    setActiveTab(initialTab);
  }, [clone, connections, grantablePermissionIds, initial, initialTab, open, permissionGroups]);

  const submit = () => {
    if (!form.name || form.name.trim().length < 2) {
      setError("Informe o nome.");
      return;
    }
    const duplicateError = duplicateNameError(form.name);
    if (duplicateError) {
      setError(duplicateError);
      setActiveTab("geral");
      return;
    }
    const scheduleError = workScheduleError(form.workSchedule);
    if (scheduleError) {
      setActiveTab("jornada");
      toast.error(scheduleError);
      return;
    }
    const permissionIds = delegatedPermissionIds({
      selectedIds: form.permissionIds,
      originalIds: initial && !clone ? initial.permissionIds : [],
      grantablePermissionIds,
    });
    const dependencyIssue = permissionDependencyIssue(permissionIds, permissionGroups);
    if (dependencyIssue) {
      setActiveTab("acessos");
      toast.error(dependencyIssue);
      return;
    }
    onSubmit({ ...form, permissionIds });
  };

  const togglePermission = (
    group: (typeof PERMISSION_GROUPS)[number],
    id: string,
    checked: boolean,
  ) => {
    const result = togglePermissionInTree({
      selectedIds: form.permissionIds,
      permissionId: id,
      checked,
      group,
      grantablePermissionIds,
    });
    if (result.blockedReason) toast.error(result.blockedReason);
    setForm((current) => ({ ...current, permissionIds: result.permissionIds }));
  };

  const togglePermissionGroup = (group: (typeof PERMISSION_GROUPS)[number], checked: boolean) => {
    const result = togglePermissionGroupInTree({
      selectedIds: form.permissionIds,
      checked,
      group,
      grantablePermissionIds,
    });
    if (result.blockedReason) toast.error(result.blockedReason);
    setForm((current) => ({ ...current, permissionIds: result.permissionIds }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        initial?.id && !clone
          ? "Editar Perfil de Acesso"
          : clone
            ? "Duplicar Perfil de Acesso"
            : "Criar Perfil de Acesso"
      }
      size="xl"
      className="sm:max-w-[51rem]"
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <EntityFormLog
            show={!!initial && !clone}
            createdAt={clone ? undefined : initial?.createdAt}
            updatedAt={clone ? undefined : initial?.updatedAt}
          />
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={submit}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <PerfilTabs active={activeTab} onChange={setActiveTab} />
        {activeTab === "geral" && (
          <GeneralTab
            form={form}
            error={error}
            onChange={(patch) => {
              setForm((current) => ({ ...current, ...patch }));
              if (patch.name !== undefined) setError(duplicateNameError(patch.name));
            }}
          />
        )}

        {activeTab === "acessos" && (
          <div className="space-y-6">
            <PermissionSettings
              form={form}
              permissionGroups={permissionGroups}
              togglePermission={togglePermission}
              togglePermissionGroup={togglePermissionGroup}
              grantablePermissionIds={grantablePermissionIds}
            />
          </div>
        )}

        {activeTab === "visualizacao" && (
          <ScopeSettings
            form={form}
            connections={connections}
            onChange={(chatScopes) => {
              const connectionIds = chatScopes.map((scope) => scope.connectionId);
              const departmentIds = [
                ...new Set(chatScopes.flatMap((scope) => scope.departmentIds)),
              ];
              setForm((current) => ({
                ...current,
                chatScopes,
                connectionIds,
                departmentIds,
              }));
            }}
          />
        )}

        {activeTab === "jornada" && (
          <WorkScheduleEditor
            value={form.workSchedule}
            onChange={(workSchedule) => setForm((current) => ({ ...current, workSchedule }))}
          />
        )}
      </div>
    </Modal>
  );
}

export function OnboardingPerfilForm(
  props: Omit<React.ComponentProps<typeof PerfilForm>, "permissionGroups">,
) {
  return <PerfilForm {...props} permissionGroups={PERMISSION_GROUPS} />;
}

function PerfilTabs({
  active,
  onChange,
}: {
  active: PerfilTab;
  onChange: (tab: PerfilTab) => void;
}) {
  const tabs: Array<{ id: PerfilTab; label: string }> = [
    { id: "geral", label: "Geral" },
    { id: "visualizacao", label: "Visualização do atendimento" },
    { id: "acessos", label: "Acessos" },
    { id: "jornada", label: "Jornada de Trabalho" },
  ];

  return (
    <div className="flex flex-nowrap overflow-x-auto border-b border-border" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "whitespace-nowrap border-b-2 px-4 py-2 text-sm transition",
            active === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function GeneralTab({
  form,
  error,
  onChange,
}: {
  form: PerfilFormData;
  error: string;
  onChange: (patch: Partial<PerfilFormData>) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-[minmax(7rem,1fr)_8.5rem] gap-3 md:gap-4 md:grid-cols-[minmax(0,1fr)_9rem]">
        <Field label="Nome *" error={error || undefined}>
          <Input
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Ex: Atendente Senior"
          />
        </Field>
        <Field label="Cor">
          <div className="flex min-h-10 items-center gap-1 rounded-lg border border-border bg-surface-1 px-1.5">
            <input
              type="color"
              value={form.color}
              onChange={(event) => onChange({ color: event.target.value })}
              className="h-6 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent"
              aria-label="Cor do perfil"
            />
            <Input
              value={form.color}
              onChange={(event) => onChange({ color: event.target.value })}
              className="min-w-0 flex-1 border-0 bg-transparent uppercase focus:border-0 max-sm:!min-h-0 max-sm:!p-0"
            />
          </div>
        </Field>
      </div>

      <Field label="Nota">
        <Textarea
          rows={4}
          value={form.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
    </section>
  );
}

function ScopeSettings({
  form,
  connections,
  onChange,
}: {
  form: PerfilFormData;
  connections: RoleScopeConnection[];
  onChange: (scopes: ChatScopeForm[]) => void;
}) {
  const sortedConnections = sortByOptionLabel(
    connections.filter(
      (connection) => connection.status === "connected" || connection.status === "disconnected",
    ),
    (connection) => connection.name,
  );

  const scopeFor = (connectionId: string) =>
    form.chatScopes.find((scope) => scope.connectionId === connectionId);
  const setConnection = (connection: RoleScopeConnection, checked: boolean) => {
    if (!checked) {
      onChange(form.chatScopes.filter((scope) => scope.connectionId !== connection.id));
      return;
    }
    if (scopeFor(connection.id)) return;
    onChange([
      ...form.chatScopes,
      { connectionId: connection.id, departmentIds: [], favoriteDepartmentId: null },
    ]);
  };
  const setDepartments = (connectionId: string, departmentIds: string[]) => {
    onChange(
      form.chatScopes.map((scope) =>
        scope.connectionId === connectionId
          ? {
              ...scope,
              departmentIds,
              favoriteDepartmentId:
                scope.favoriteDepartmentId && departmentIds.includes(scope.favoriteDepartmentId)
                  ? scope.favoriteDepartmentId
                  : null,
            }
          : scope,
      ),
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <div>
          <p className="font-semibold">Instâncias e departamentos</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            Estas seleções definem quais instâncias, departamentos e conversas o perfil pode
            visualizar e operar no Chat. Elas são independentes dos acessos aos módulos de cadastro
            de Instâncias e Departamentos.
          </p>
        </div>
      </div>

      {sortedConnections.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma instância cadastrada.
        </div>
      ) : (
        sortedConnections.map((connection) => {
          const scope = scopeFor(connection.id);
          const enabled = !!scope;
          const favoriteDepartmentId = scope?.favoriteDepartmentId ?? null;
          const departments = sortByOptionLabel(connection.departments, (item) => item.name).sort(
            (left, right) =>
              Number(right.id === favoriteDepartmentId) - Number(left.id === favoriteDepartmentId),
          );
          const allSelected =
            enabled &&
            departments.length > 0 &&
            departments.every((department) => scope.departmentIds.includes(department.id));
          return (
            <div key={connection.id} className="overflow-hidden rounded-xl border border-border">
              <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 bg-primary/5 px-3 py-1.5 sm:flex sm:flex-wrap sm:justify-between sm:gap-2">
                <strong className="col-start-1 row-start-1 min-w-0 truncate">
                  {connection.name}
                </strong>
                <div className="contents text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                  <label className="contents sm:flex sm:min-h-9 sm:items-center sm:gap-2">
                    <span className="col-start-2 row-start-1 whitespace-nowrap sm:col-auto sm:row-auto">
                      Acesso à instância
                    </span>
                    <Switch
                      className="col-start-3 row-start-1 sm:col-auto sm:row-auto"
                      checked={enabled}
                      onCheckedChange={(checked) => setConnection(connection, checked)}
                    />
                  </label>
                  <label className="contents sm:flex sm:min-h-9 sm:items-center sm:gap-2 sm:border-l sm:border-border sm:pl-3">
                    <span className="col-start-2 row-start-2 whitespace-nowrap sm:col-auto sm:row-auto">
                      Todos os departamentos
                    </span>
                    <Switch
                      className="col-start-3 row-start-2 sm:col-auto sm:row-auto"
                      checked={allSelected}
                      disabled={!enabled || departments.length === 0}
                      onCheckedChange={(checked) =>
                        setDepartments(
                          connection.id,
                          checked ? departments.map((department) => department.id) : [],
                        )
                      }
                    />
                  </label>
                </div>
              </div>
              <div className="grid gap-1.5 p-2 sm:grid-cols-2 sm:pl-6">
                {departments.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground sm:col-span-2">
                    Nenhum departamento vinculado a esta instância.
                  </p>
                ) : (
                  departments.map((department) => {
                    const checked = !!scope?.departmentIds.includes(department.id);
                    const favorite = scope?.favoriteDepartmentId === department.id;
                    return (
                      <div
                        key={department.id}
                        className={`grid min-h-11 grid-cols-[minmax(0,1fr)_2.25rem_2.25rem] items-center gap-2 rounded-lg border px-3 py-1 ${enabled ? "bg-background" : "bg-muted/40 text-muted-foreground"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" title={department.name}>
                            {department.name}
                          </p>
                          {department.description && (
                            <p className="truncate text-xs text-muted-foreground">
                              {department.description}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!enabled || !checked}
                          aria-pressed={favorite}
                          aria-label={`${favorite ? "Remover" : "Definir"} ${department.name} como departamento principal`}
                          onClick={() =>
                            onChange(
                              form.chatScopes.map((item) =>
                                item.connectionId === connection.id
                                  ? {
                                      ...item,
                                      favoriteDepartmentId: favorite ? null : department.id,
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-40"
                        >
                          <Star
                            className={`h-5 w-5 ${favorite ? "fill-warning text-warning" : "text-muted-foreground"}`}
                          />
                        </button>
                        <Switch
                          checked={checked}
                          disabled={!enabled}
                          onCheckedChange={(nextChecked) =>
                            setDepartments(
                              connection.id,
                              nextChecked
                                ? [...new Set([...(scope?.departmentIds ?? []), department.id])]
                                : (scope?.departmentIds ?? []).filter((id) => id !== department.id),
                            )
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

function PermissionSettings({
  form,
  permissionGroups,
  togglePermission,
  togglePermissionGroup,
  grantablePermissionIds,
}: {
  form: PerfilFormData;
  permissionGroups: typeof PERMISSION_GROUPS;
  togglePermission: (
    group: (typeof PERMISSION_GROUPS)[number],
    id: string,
    checked: boolean,
  ) => void;
  togglePermissionGroup: (group: (typeof PERMISSION_GROUPS)[number], checked: boolean) => void;
  grantablePermissionIds: string[];
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Permissões
        </h3>
        <div className="space-y-4">
          {permissionGroups.map((group) => (
            <PermissionGroupBlock
              key={group.title}
              group={group}
              selectedIds={form.permissionIds}
              togglePermission={togglePermission}
              togglePermissionGroup={togglePermissionGroup}
              grantablePermissionIds={grantablePermissionIds}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SelectionSection({
  title,
  ids,
  selectedIds,
  emptyLabel,
  onToggleAll,
  children,
}: {
  title: string;
  ids: string[];
  selectedIds: string[];
  emptyLabel: string;
  onToggleAll: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface-1">
      <div className="flex items-center justify-between gap-3 bg-primary/[0.06] px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h3>
        <PermissionSwitch
          label="Todos"
          compact
          checked={allSelected}
          disabled={ids.length === 0}
          onChange={onToggleAll}
        />
      </div>
      {ids.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div
          className={cn(
            "grid [&>*]:border-t [&>*]:border-border",
            ids.length === 1 ? "sm:grid-cols-1" : "sm:grid-cols-2 sm:[&>*:nth-child(odd)]:border-r",
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function PermissionGroupBlock({
  group,
  selectedIds,
  togglePermission,
  togglePermissionGroup,
  grantablePermissionIds,
}: {
  group: { title: string; tab: PermissionTab; items: PermissionField[] };
  selectedIds: string[];
  togglePermission: (
    group: (typeof PERMISSION_GROUPS)[number],
    id: string,
    checked: boolean,
  ) => void;
  togglePermissionGroup: (group: (typeof PERMISSION_GROUPS)[number], checked: boolean) => void;
  grantablePermissionIds: string[];
}) {
  const ids = group.items.map((permission) => permission.id);
  const grantableIds = ids.filter((id) => grantablePermissionIds.includes(id));
  const allSelected =
    grantableIds.length > 0 && grantableIds.every((id) => selectedIds.includes(id));
  const parentId = ids[0];
  const parentSelected = !!parentId && selectedIds.includes(parentId);
  const canToggleAll =
    grantableIds.length > 0 &&
    !!parentId &&
    (grantablePermissionIds.includes(parentId) || parentSelected);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
      <div className="flex items-center justify-between gap-3 bg-primary/[0.06] px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {group.title}
        </p>
        <PermissionSwitch
          label="Todos"
          compact
          checked={allSelected}
          disabled={!canToggleAll}
          onChange={(checked) => togglePermissionGroup(group, checked)}
        />
      </div>
      <div className="grid sm:grid-cols-2">
        {group.items.map((permission, index) => {
          const isChild = index > 0;
          const isLastOddItem = group.items.length % 2 === 1 && index === group.items.length - 1;
          return (
            <div
              key={permission.id}
              className={cn(
                "border-t border-border",
                isLastOddItem ? "sm:col-span-2" : "sm:[&:nth-child(odd)]:border-r",
              )}
            >
              <PermissionSwitch
                label={permission.label}
                description={permission.description}
                checked={selectedIds.includes(permission.id)}
                disabled={
                  !grantablePermissionIds.includes(permission.id) || (isChild && !parentSelected)
                }
                onChange={(checked) => togglePermission(group, permission.id, checked)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PermissionSwitch({
  label,
  description,
  checked,
  disabled = false,
  compact = false,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        compact ? "min-h-0 p-0" : "min-h-14 px-4 py-2.5",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function WorkScheduleEditor({
  value,
  onChange,
}: {
  value: WorkSchedule;
  onChange: (value: WorkSchedule) => void;
}) {
  const errorPrefix = React.useId();
  const enabledToggleId = React.useId();
  const enabled = !value.noSchedule;
  const [selectedDay, setSelectedDay] = React.useState<WeekDay | null>(null);
  const firstActiveStartRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setSelectedDay(null);
      return;
    }
    if (selectedDay && value.days[selectedDay].active) return;
    setSelectedDay(WEEK_DAYS.find((day) => value.days[day].active) ?? null);
  }, [enabled, selectedDay, value.days]);

  const updateDay = (day: WeekDay, patch: Partial<WorkSchedule["days"][WeekDay]>) => {
    onChange({
      ...value,
      days: {
        ...value.days,
        [day]: {
          ...value.days[day],
          ...patch,
        },
      },
    });
  };

  const updatePeriod = (day: WeekDay, periodId: string, patch: Partial<WorkPeriod>) => {
    updateDay(day, {
      periods: value.days[day].periods.map((period) =>
        period.id === periodId ? { ...period, ...patch } : period,
      ),
    });
  };

  const addPeriod = (day: WeekDay) => {
    const periods = value.days[day].periods;
    const previous = periods[periods.length - 1];
    updateDay(day, { periods: [...periods, createWorkPeriod(previous?.end || "", "")] });
  };

  const removePeriod = (day: WeekDay, periodId: string) => {
    const periods = value.days[day].periods.filter((period) => period.id !== periodId);
    updateDay(day, { periods: periods.length ? periods : [createWorkPeriod()] });
  };

  const copyDayToAll = (sourceDay: WeekDay) => {
    const source = value.days[sourceDay];
    const days = { ...value.days };

    WEEK_DAYS.forEach((day) => {
      if (day === sourceDay || !value.days[day].active) return;
      days[day] = {
        ...value.days[day],
        periods: source.periods.map((period) => createWorkPeriod(period.start, period.end)),
      };
    });

    onChange({ ...value, days });
  };

  const timeInputOrder = (dayIndex: number, periodIndex: number, fieldOffset: 0 | 1) =>
    WEEK_DAYS.slice(0, dayIndex).reduce(
      (total, day) => total + value.days[day].periods.length * 2,
      0,
    ) +
    periodIndex * 2 +
    fieldOffset;

  const handleTimeInputTab = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const table = event.currentTarget.closest("table");
    if (!table) return;
    const inputs = Array.from(
      table.querySelectorAll<HTMLInputElement>("input[data-work-hour-order]:not(:disabled)"),
    ).sort(
      (left, right) => Number(left.dataset.workHourOrder) - Number(right.dataset.workHourOrder),
    );
    const currentIndex = inputs.indexOf(event.currentTarget);
    const target = inputs[currentIndex + (event.shiftKey ? -1 : 1)];
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.select();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          id={enabledToggleId}
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Habilitar Jornada"
          onClick={() => {
            onChange({ ...value, noSchedule: enabled });
            if (!enabled) {
              const firstActiveDay = WEEK_DAYS.find((day) => value.days[day].active) ?? null;
              setSelectedDay(firstActiveDay);
              requestAnimationFrame(() => {
                firstActiveStartRef.current?.focus({ preventScroll: true });
                firstActiveStartRef.current?.select();
              });
            }
          }}
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${enabled ? "bg-blue-600" : "bg-slate-300"}`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
        <label htmlFor={enabledToggleId} className="cursor-pointer text-sm text-muted-foreground">
          Habilitar Jornada
        </label>
      </div>
      <div className="overflow-hidden rounded-lg border border-border sm:overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm sm:min-w-[580px]">
          <colgroup>
            <col className="w-[20%] sm:w-[42%]" />
            <col className="w-[23%] sm:w-[18%]" />
            <col className="w-[23%] sm:w-[18%]" />
            <col className="w-[34%] sm:w-[22%]" />
          </colgroup>
          <thead className="bg-surface-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-widest">
            <tr>
              <th className="px-1 py-2 text-left font-semibold sm:px-3 sm:py-3">
                <span className="sm:hidden">Dia</span>
                <span className="hidden sm:inline">Dia da semana</span>
              </th>
              <th className="!px-0 py-2 text-center font-semibold sm:!px-2 sm:py-3">Início</th>
              <th className="!px-0 py-2 text-center font-semibold sm:!px-2 sm:py-3">Fim</th>
              <th className="!pl-1 !pr-0 py-2 text-center sm:!px-2 sm:py-3" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {WEEK_DAYS.map((day, dayIndex) => {
              const item = value.days[day];
              const errors =
                enabled && item.active
                  ? item.periods.map((period) =>
                      workPeriodError({
                        ...period,
                        start: formatWorkHourDraft(period.start),
                        end: formatWorkHourDraft(period.end),
                      }),
                    )
                  : [];
              const dayError = errors.find(Boolean) ?? "";
              const dayErrorId = `${errorPrefix}-${day}`;
              const dayBorder = dayIndex < WEEK_DAYS.length - 1 ? "border-b border-border" : "";
              const firstActiveDay = WEEK_DAYS.find((candidate) => value.days[candidate].active);
              return (
                <React.Fragment key={day}>
                  <tr className={`transition hover:bg-surface-1/60 ${dayError ? "" : dayBorder}`}>
                    <td className="py-3 pl-1 pr-0.5 align-top text-xs sm:px-3 sm:text-sm">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <input
                          type="checkbox"
                          checked={item.active}
                          disabled={!enabled}
                          onChange={(event) => {
                            setSelectedDay(day);
                            updateDay(day, { active: event.target.checked });
                          }}
                          className="h-4 w-4 shrink-0 accent-primary"
                          aria-label={`Ativar jornada de ${day}`}
                        />
                        <p aria-label={day}>
                          <span aria-hidden="true" className="sm:hidden">
                            {day.slice(0, 3)}
                          </span>
                          <span aria-hidden="true" className="hidden sm:inline">
                            {day}
                          </span>
                        </p>
                      </div>
                    </td>
                    <td className="!px-0 py-2 align-top text-center sm:!px-2">
                      <div className="flex flex-col gap-2">
                        {item.periods.map((period, periodIndex) => {
                          const error = errors[periodIndex];
                          return (
                            <Input
                              key={period.id}
                              ref={
                                day === firstActiveDay && periodIndex === 0
                                  ? firstActiveStartRef
                                  : undefined
                              }
                              type="text"
                              inputMode="numeric"
                              data-work-hour-order={timeInputOrder(dayIndex, periodIndex, 0)}
                              aria-label={`Início do período ${periodIndex + 1} de ${day}`}
                              aria-invalid={!!error}
                              aria-describedby={error ? dayErrorId : undefined}
                              value={period.start}
                              placeholder="00:00"
                              disabled={!enabled || !item.active}
                              onFocus={() => setSelectedDay(day)}
                              onKeyDown={handleTimeInputTab}
                              onChange={(event) =>
                                updatePeriod(day, period.id, {
                                  start: sanitizeWorkHourDraft(event.target.value),
                                })
                              }
                              onBlur={(event) =>
                                updatePeriod(day, period.id, {
                                  start: formatWorkHourDraft(event.target.value),
                                })
                              }
                              className={`!h-9 !min-h-9 w-full min-w-0 px-1 !text-[13px] text-center sm:!h-10 sm:!min-h-10 sm:px-3 sm:!text-sm ${error ? "!border-destructive" : ""}`}
                            />
                          );
                        })}
                      </div>
                    </td>
                    <td className="!px-0 py-2 align-top text-center sm:!px-2">
                      <div className="flex flex-col gap-2">
                        {item.periods.map((period, periodIndex) => {
                          const error = errors[periodIndex];
                          return (
                            <Input
                              key={period.id}
                              type="text"
                              inputMode="numeric"
                              data-work-hour-order={timeInputOrder(dayIndex, periodIndex, 1)}
                              aria-label={`Fim do período ${periodIndex + 1} de ${day}`}
                              aria-invalid={!!error}
                              aria-describedby={error ? dayErrorId : undefined}
                              value={period.end}
                              placeholder="00:00"
                              disabled={!enabled || !item.active}
                              onFocus={() => setSelectedDay(day)}
                              onKeyDown={handleTimeInputTab}
                              onChange={(event) =>
                                updatePeriod(day, period.id, {
                                  end: sanitizeWorkHourDraft(event.target.value),
                                })
                              }
                              onBlur={(event) =>
                                updatePeriod(day, period.id, {
                                  end: formatWorkHourDraft(event.target.value),
                                })
                              }
                              className={`!h-9 !min-h-9 w-full min-w-0 px-1 !text-[13px] text-center sm:!h-10 sm:!min-h-10 sm:px-3 sm:!text-sm ${error ? "!border-destructive" : ""}`}
                            />
                          );
                        })}
                      </div>
                    </td>
                    <td className="!pl-1 !pr-0 py-2 align-top text-center sm:!px-2">
                      <div className="flex flex-col gap-2">
                        {item.periods.map((period, periodIndex) => (
                          <div
                            key={period.id}
                            className="grid h-9 grid-cols-3 items-center gap-0.5 sm:h-10 sm:gap-1"
                          >
                            {enabled && selectedDay === day && item.active && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removePeriod(day, period.id)}
                                  title="Excluir horário"
                                  aria-label={`Excluir período ${periodIndex + 1} de ${day}`}
                                  className="trash-action"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                {periodIndex === 0 && (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyDayToAll(day)}
                                      title="Copiar para todos"
                                      aria-label={`Copiar horários de ${day} para todos os dias ativos`}
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => addPeriod(day)}
                                      title="Incluir novo horário"
                                      aria-label={`Incluir horário em ${day}`}
                                      className="group hover:text-primary"
                                    >
                                      <Plus className="h-3.5 w-3.5 transition-colors group-hover:text-primary" />
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {dayError && (
                    <tr className={dayBorder}>
                      <td className="p-0" aria-hidden="true" />
                      <td colSpan={3} className="px-2 pb-2 pt-0">
                        <p
                          id={dayErrorId}
                          role="alert"
                          className="block w-full whitespace-normal text-[11px] leading-tight text-destructive sm:text-xs"
                        >
                          {dayError}
                        </p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function sanitizeWorkHourDraft(value: string) {
  return value.replace(/[^\d:]/g, "").slice(0, 5);
}

function formatWorkHourDraft(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded =
    digits.length <= 2 ? digits.padStart(2, "0").padEnd(4, "0") : digits.padStart(4, "0");
  const hour = Math.min(23, Number(padded.slice(0, 2)));
  const minute = Math.min(59, Number(padded.slice(2, 4)));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function EntityFormLog({
  show,
  createdAt,
  updatedAt,
}: {
  show: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  if (!show) return <span aria-hidden="true" />;
  return (
    <div className="min-w-0 text-left text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
      <div className="truncate">
        <span className="font-semibold text-foreground">Criado:</span> {formatDateTime(createdAt)}
      </div>
      <div className="truncate">
        <span className="font-semibold text-foreground">Editado:</span> {formatDateTime(updatedAt)}
      </div>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }).replace(",", "");
}
