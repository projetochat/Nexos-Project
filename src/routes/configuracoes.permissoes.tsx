import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Pencil } from "lucide-react";
import { Card, Badge, Button } from "@/components/ui-kit";
import { organizationApi, type ApiRole } from "@/lib/trixus-api";
import { useSession } from "@/lib/session";

const PERMISSION_GROUP_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  chat: "Chat",
  conversations: "Chat",
  messages: "Chat",
  contacts: "Contatos",
  groups: "Gerenciar Grupos",
  history: "Histórico de Conversas",
  crm: "Clientes e Campos Adicionais",
  leads: "Leads",
  notifications: "Notificações",
  users: "Atendentes",
  roles: "Perfil de Acesso",
  departments: "Departamentos",
  schedules: "Agendamentos",
  connections: "Instâncias",
  bot_flows: "Fluxo de Bot",
  automations: "Automações",
  ai_agents: "Agente de IA",
  settings: "Configurações",
  campaigns: "Campanhas",
  tickets: "Chamados",
};

function permissionLabel(permission: string) {
  const specificLabels: Record<string, string> = {
    "conversations.read": "Ver conversas",
    "conversations.assign": "Atribuir conversas",
    "conversations.manage": "Gerenciar conversas",
    "messages.send": "Enviar mensagens",
    "chat.contacts.edit": "Editar contato",
    "chat.contacts.create": "Criar contato",
    "chat.contacts.read": "Ver contatos no chat",
    "chat.contacts.block": "Bloquear contatos",
    "chat.phone.read": "Ver telefone",
    "chat.messages.edit": "Editar mensagens",
    "chat.messages.delete": "Apagar mensagens",
    "chat.agent_name.show": "Assinar mensagem",
    "chat.audio.send": "Enviar áudio",
    "chat.customer_link.edit": "Alterar cliente vinculado",
    "chat.tags.use": "Utilizar etiquetas",
    "chat.conversations.view_all_active": "Ver todas as conversas ativas",
    "tickets.create": "Gerar chamado",
    "tickets.status.update": "Alterar status",
    "tickets.attachments.upload": "Enviar anexos",
    "tickets.attachments.delete": "Excluir anexos",
    "campaigns.recipients.read": "Ver destinatários",
  };
  if (specificLabels[permission]) return specificLabels[permission];

  const labels: Record<string, string> = {
    read: "Ver",
    manage: "Criar/Editar",
    create: "Criar",
    update: "Editar",
    delete: "Excluir",
    assign: "Atribuir",
    send: "Enviar mensagens",
    edit: "Editar",
    block: "Bloquear",
    use: "Utilizar",
    show: "Assinar mensagem",
    upload: "Enviar anexos",
    comment: "Comentar",
    schedule: "Agendar",
    start: "Iniciar",
    pause: "Pausar",
    cancel: "Cancelar",
    duplicate: "Duplicar",
    view_all_active: "Ver todas as conversas ativas",
  };
  return labels[permission.split(".").at(-1) ?? ""] ?? permission;
}

function permissionGroupTitle(permission: string) {
  if (permission === "tickets.create" || permission === "chat.tags.use") return "Chat";
  if (permission.startsWith("chat.quick_replies.")) return "Mensagens Rápidas";
  if (permission.startsWith("chat.tags.")) return "Etiquetas";
  if (permission.startsWith("chat.leads.")) return "Leads";
  const root = permission.split(".")[0] ?? permission;
  return PERMISSION_GROUP_LABELS[root] ?? "Outras permissões";
}

function groupedRolePermissions(role: ApiRole) {
  const groups = new Map<string, string[]>();
  for (const permission of role.permissionIds) {
    const title = permissionGroupTitle(permission);
    groups.set(title, [...(groups.get(title) ?? []), permission]);
  }
  return [...groups.entries()].map(([title, permissions]) => ({ title, permissions }));
}

function isAdministratorRole(role: ApiRole) {
  return (
    role.key === "tenant_admin" ||
    role.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase() === "administrador"
  );
}

export const Route = createFileRoute("/configuracoes/permissoes")({
  component: PermissoesSettings,
});

function PermissoesSettings() {
  const navigate = useNavigate();
  const permissions = useSession((state) => state.user?.permissions ?? []);
  const canEditRoles = permissions.includes("roles.read") && permissions.includes("roles.manage");
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["trixus", "roles"],
    queryFn: organizationApi.listRoles,
  });

  if (isLoading)
    return <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>;

  return (
    <div className="space-y-4">
      {roles.map((role) => (
        <Card key={role.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <Badge tone={role.system ? "brand" : "info"} dot={false}>
                {role.name}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {role.permissionIds.length} permissões ativas
              </span>
            </div>
            {!isAdministratorRole(role) && canEditRoles && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start sm:self-auto"
                onClick={() =>
                  void navigate({
                    to: "/perfis",
                    search: { edit: role.id, tab: "acessos" },
                  })
                }
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {groupedRolePermissions(role).map((group) => {
              return (
                <section
                  key={group.title}
                  className="overflow-hidden rounded-xl border border-border bg-surface-1"
                >
                  <div className="bg-primary/[0.06] px-4 py-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      {group.title}
                    </h3>
                  </div>
                  <ul className="grid sm:grid-cols-2">
                    {group.permissions.map((permission) => (
                      <li
                        key={permission}
                        className="flex min-h-14 items-start gap-3 border-t border-border px-4 py-2.5 sm:[&:nth-child(odd)]:border-r"
                      >
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {permissionLabel(permission)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{permission}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
