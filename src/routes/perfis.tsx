import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ShieldCheck, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  SectionHeader,
  Card,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  SearchInput,
} from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { num } from "@/lib/format";
import { sortByOptionLabel } from "@/lib/sort-options";
import {
  connectionsApi,
  organizationApi,
  type ApiMessagingConnection,
  type ApiRole,
  type ApiUserMembership,
} from "@/lib/nexos-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/perfis")({ component: Page });

type PerfilTab = "geral" | "chat" | "chamados" | "jornada";
type PermissionTab = "chat" | "chamados";
type PermissionField = { id: string; label: string };

const PERMISSION_GROUPS: Array<{ title: string; tab: PermissionTab; items: PermissionField[] }> = [
  {
    title: "Administração",
    tab: "chat",
    items: [
      { id: "users.read", label: "Ver usuários" },
      { id: "users.manage", label: "Gerenciar usuários" },
      { id: "departments.read", label: "Ver departamentos" },
      { id: "departments.manage", label: "Gerenciar departamentos" },
      { id: "roles.read", label: "Ver perfis" },
      { id: "roles.manage", label: "Gerenciar perfis" },
    ],
  },
  {
    title: "CRM e leads",
    tab: "chat",
    items: [
      { id: "crm.read", label: "Ver CRM" },
      { id: "crm.manage", label: "Gerenciar CRM" },
      { id: "chat.contacts.read", label: "Visualizar contatos" },
      { id: "chat.contacts.edit", label: "Editar contato" },
      { id: "chat.contacts.block", label: "Bloquear contatos" },
      { id: "chat.customer_link.edit", label: "Editar vinculo de cliente" },
      { id: "chat.phone.read", label: "Visualizar número" },
      { id: "chat.leads.read", label: "Visualizar leads" },
      { id: "leads.manage", label: "Gerenciar leads" },
    ],
  },
  {
    title: "Atendimento e mensagens",
    tab: "chat",
    items: [
      { id: "conversations.read", label: "Ver conversas" },
      { id: "conversations.assign", label: "Atribuir conversas" },
      { id: "conversations.manage", label: "Gerenciar conversas" },
      { id: "messages.send", label: "Enviar mensagens" },
      { id: "chat.messages.edit", label: "Editar mensagem" },
      { id: "chat.messages.delete", label: "Excluir mensagem" },
      { id: "chat.audio.send", label: "Enviar audio" },
      { id: "chat.agent_name.show", label: "Apresentar nome do atendente" },
      { id: "chat.conversations.view_all_active", label: "Ver todas conversas ativas" },
    ],
  },
  {
    title: "Catalogos e canais",
    tab: "chat",
    items: [
      { id: "connections.read", label: "Ver instancias" },
      { id: "connections.manage", label: "Gerenciar instancias" },
      { id: "chat.tags.use", label: "Usar etiquetas" },
      { id: "chat.tags.manage", label: "Gerenciar etiquetas" },
      { id: "chat.quick_replies.read", label: "Acessar mensagens rapidas" },
      { id: "chat.quick_replies.manage", label: "Gerenciar mensagens rapidas" },
      { id: "notifications.read", label: "Ver notificacoes" },
      { id: "notifications.manage", label: "Gerenciar notificacoes" },
    ],
  },
  {
    title: "Automacoes e campanhas",
    tab: "chat",
    items: [
      { id: "automations.read", label: "Ver automacoes" },
      { id: "automations.manage", label: "Gerenciar automacoes" },
      { id: "campaigns.read", label: "Ver campanhas" },
      { id: "campaigns.create", label: "Criar campanhas" },
      { id: "campaigns.update", label: "Editar campanhas" },
      { id: "campaigns.schedule", label: "Agendar campanhas" },
      { id: "campaigns.start", label: "Iniciar campanhas" },
      { id: "campaigns.pause", label: "Pausar campanhas" },
      { id: "campaigns.cancel", label: "Cancelar campanhas" },
      { id: "campaigns.duplicate", label: "Duplicar campanhas" },
      { id: "campaigns.recipients.read", label: "Ver recipients de campanhas" },
      { id: "campaigns.manage", label: "Gerenciar campanhas" },
    ],
  },
  {
    title: "Chamados",
    tab: "chamados",
    items: [
      { id: "tickets.read", label: "Ver chamados" },
      { id: "tickets.create", label: "Criar chamados" },
      { id: "tickets.update", label: "Atualizar chamados" },
      { id: "tickets.assign", label: "Atribuir chamados" },
      { id: "tickets.status.update", label: "Alterar status de chamados" },
      { id: "tickets.comment", label: "Comentar chamados" },
      { id: "tickets.attachments.upload", label: "Anexar em chamados" },
      { id: "tickets.attachments.delete", label: "Excluir anexos de chamados" },
      { id: "tickets.manage", label: "Gerenciar chamados" },
    ],
  },
];

const WEEK_DAYS = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"] as const;
const SHIFT_LABELS = {
  morning: "Turno manha",
  afternoon: "Turno tarde",
  night: "Turno noite",
} as const;
const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "Fuso horário de São Paulo (GMT-3)" },
  { value: "America/Manaus", label: "Fuso horário de Manaus (GMT-4)" },
  { value: "America/Rio_Branco", label: "Fuso horário do Acre (GMT-5)" },
  { value: "America/Fortaleza", label: "Fuso horário de Fortaleza (GMT-3)" },
  { value: "America/Noronha", label: "Fuso horário de Fernando de Noronha (GMT-2)" },
  { value: "UTC", label: "UTC (GMT+0)" },
];
const LANGUAGE_OPTIONS = [
  { value: "system", label: "Padrão do Sistema" },
  { value: "pt-BR", label: "Portugues (Brasil)" },
  { value: "en-US", label: "Ingles" },
  { value: "es", label: "Espanhol" },
];
const DEFAULT_ROLE_COLOR = "#3B82F6";
type WeekDay = (typeof WEEK_DAYS)[number];
type ShiftKey = keyof typeof SHIFT_LABELS;
type WorkShift = { active: boolean; start: string; end: string };
type WorkSchedule = { noSchedule: boolean; days: Record<WeekDay, Record<ShiftKey, WorkShift>> };

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

function normalizeRoleName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
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
      morning: { active: weekday, start: "08:00", end: "12:00" },
      afternoon: { active: weekday, start: "13:00", end: "18:00" },
      night: { active: false, start: "19:00", end: "22:00" },
    };
  }
  return { noSchedule: false, days };
}

type PerfilFormData = {
  name: string;
  description: string;
  color: string;
  language: string;
  timezone: string;
  permissionIds: string[];
  departmentIds: string[];
  connectionIds: string[];
  workSchedule: WorkSchedule;
};

type RoleMetadata = {
  departmentIds?: string[];
  connectionIds?: string[];
  workSchedule?: WorkSchedule;
  color?: string;
  language?: string;
  timezone?: string;
};

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm hover:bg-surface-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function Page() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["nexos", "roles"],
    queryFn: organizationApi.listRoles,
  });
  const { data: departamentos = [] } = useQuery({
    queryKey: ["nexos", "departments"],
    queryFn: organizationApi.listDepartments,
  });
  const { data: connections = [] } = useQuery({
    queryKey: ["nexos", "messaging-connections"],
    queryFn: connectionsApi.list,
  });
  const { data: memberships = [] } = useQuery({
    queryKey: ["nexos", "users"],
    queryFn: organizationApi.listUsers,
  });

  const [editing, setEditing] = React.useState<ApiRole | null>(null);
  const [duplicating, setDuplicating] = React.useState<ApiRole | null>(null);
  const [deleting, setDeleting] = React.useState<ApiRole | null>(null);
  const [query, setQuery] = React.useState("");
  const novo = useDisclosure();
  const memberCountByRoleId = React.useMemo(() => countRoleMembers(memberships), [memberships]);

  const filtered = items.filter((p) => {
    if (
      query &&
      !(p.name + " " + (p.description ?? "")).toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const save = useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: PerfilFormData }) => {
      const metadata = {
        departmentIds: data.departmentIds,
        connectionIds: data.connectionIds,
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
      qc.setQueryData<ApiRole[]>(["nexos", "roles"], (current = []) => {
        if (vars.id) {
          return current.map((role) =>
            role.id === savedRole.id ? roleWithLogFallback(savedRole, role) : role,
          );
        }
        return [savedRole, ...current];
      });
      qc.invalidateQueries({ queryKey: ["nexos", "roles"] });
      toast.success(vars.id ? "Perfil atualizado" : "Perfil criado");
      novo.hide();
      setEditing(null);
      setDuplicating(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => organizationApi.deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "roles"] });
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
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Novo Perfil de Acesso
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar perfil..." />
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
              const memberCount = memberCountByRoleId[p.id] ?? 0;
              const color = roleColor(p);

              return (
                <Card
                  key={p.id}
                  className="min-h-[86px] p-4 transition hover:border-primary/35 hover:bg-surface-1"
                >
                  <div className="flex items-center justify-between gap-4">
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
                          {formatMemberCount(memberCount)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(p)}
                        title="Editar perfil"
                        aria-label={`Editar perfil ${p.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(p)}
                        title="Excluir perfil"
                        aria-label={`Excluir perfil ${p.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <PerfilForm
          open={novo.open}
          roles={items}
          departamentos={departamentos.map((d) => ({ id: d.id, name: d.name }))}
          connections={connections}
          onClose={novo.hide}
          onSubmit={(data) => save.mutate({ data })}
        />
        <PerfilForm
          open={!!editing}
          roles={items}
          departamentos={departamentos.map((d) => ({ id: d.id, name: d.name }))}
          connections={connections}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={(data) => editing && save.mutate({ id: editing.id, data })}
        />
        <PerfilForm
          open={!!duplicating}
          roles={items}
          departamentos={departamentos.map((d) => ({ id: d.id, name: d.name }))}
          connections={connections}
          initial={duplicating ?? undefined}
          clone
          onClose={() => setDuplicating(null)}
          onSubmit={(data) => save.mutate({ data })}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Excluir perfil?"
          destructive
          description={`Esta acao removera ${deleting?.name ?? ""}.`}
          confirmLabel="Excluir"
          onClose={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate(deleting.id)}
        />
      </PageContainer>
    </AppShell>
  );
}

function PerfilForm({
  open,
  onClose,
  onSubmit,
  initial,
  clone = false,
  roles,
  departamentos,
  connections,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PerfilFormData) => void;
  initial?: ApiRole;
  clone?: boolean;
  roles: ApiRole[];
  departamentos: { id: string; name: string }[];
  connections: ApiMessagingConnection[];
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
    workSchedule: defaultWorkSchedule(),
  });
  const [error, setError] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<PerfilTab>("geral");

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
            permissionIds: initial.permissionIds,
            departmentIds: metadata.departmentIds ?? [],
            connectionIds: metadata.connectionIds ?? [],
            workSchedule: metadata.workSchedule ?? defaultWorkSchedule(),
          }
        : {
            name: "",
            description: "",
            color: DEFAULT_ROLE_COLOR,
            language: "system",
            timezone: "America/Sao_Paulo",
            permissionIds: [
              "departments.read",
              "chat.contacts.read",
              "chat.tags.use",
              "chat.quick_replies.read",
            ],
            departmentIds: [],
            connectionIds: [],
            workSchedule: defaultWorkSchedule(),
          },
    );
    setError("");
    setActiveTab("geral");
  }, [initial, open]);

  const submit = () => {
    if (!form.name || form.name.trim().length < 2) {
      setError("Informe o nome.");
      return;
    }
    const normalizedName = normalizeRoleName(form.name);
    const hasDuplicate = roles.some(
      (role) => role.id !== initial?.id && normalizeRoleName(role.name) === normalizedName,
    );
    if (hasDuplicate) {
      setError("Já existe um perfil de acesso com este nome.");
      setActiveTab("geral");
      return;
    }
    onSubmit(form);
  };

  const togglePermission = (id: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      permissionIds: checked
        ? Array.from(new Set([...current.permissionIds, id]))
        : current.permissionIds.filter((permissionId) => permissionId !== id),
    }));
  };

  const toggleDepartment = (id: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      departmentIds: checked
        ? Array.from(new Set([...current.departmentIds, id]))
        : current.departmentIds.filter((departmentId) => departmentId !== id),
    }));
  };

  const toggleConnection = (id: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      connectionIds: checked
        ? Array.from(new Set([...current.connectionIds, id]))
        : current.connectionIds.filter((connectionId) => connectionId !== id),
    }));
  };

  const toggleMany = (
    field: "permissionIds" | "departmentIds" | "connectionIds",
    ids: string[],
    checked: boolean,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: checked
        ? Array.from(new Set([...current[field], ...ids]))
        : current[field].filter((itemId) => !ids.includes(itemId)),
    }));
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
            : "Novo Perfil de Acesso"
      }
      size="xl"
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
              if (patch.name !== undefined) setError("");
            }}
          />
        )}

        {activeTab === "chat" && (
          <PermissionSettings
            tab="chat"
            form={form}
            departamentos={departamentos}
            connections={connections}
            togglePermission={togglePermission}
            toggleDepartment={toggleDepartment}
            toggleConnection={toggleConnection}
            toggleMany={toggleMany}
          />
        )}

        {activeTab === "chamados" && (
          <PermissionSettings
            tab="chamados"
            form={form}
            departamentos={departamentos}
            connections={connections}
            togglePermission={togglePermission}
            toggleDepartment={toggleDepartment}
            toggleConnection={toggleConnection}
            toggleMany={toggleMany}
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

function PerfilTabs({
  active,
  onChange,
}: {
  active: PerfilTab;
  onChange: (tab: PerfilTab) => void;
}) {
  const tabs: Array<{ id: PerfilTab; label: string }> = [
    { id: "geral", label: "Geral" },
    { id: "chat", label: "Chat" },
    { id: "chamados", label: "Chamados" },
    { id: "jornada", label: "Jornada de Trabalho" },
  ];

  return (
    <div className="flex flex-wrap border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "border-b-2 px-4 py-2 text-sm transition",
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
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,0.65fr)] gap-3 md:gap-4 md:grid-cols-[1fr_220px]">
        <Field label="Nome *">
          <Input
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Ex: Atendente Senior"
          />
          {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
        </Field>
        <Field label="Cor">
          <div className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface-1 px-2">
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
              className="min-h-0 border-0 bg-transparent px-1 py-0 uppercase focus:border-0"
            />
          </div>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Idioma">
          <Select
            value={form.language}
            onChange={(event) => onChange({ language: event.target.value })}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Timezone">
          <Select
            value={form.timezone}
            onChange={(event) => onChange({ timezone: event.target.value })}
          >
            {TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
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

function PermissionSettings({
  tab,
  form,
  departamentos,
  connections,
  togglePermission,
  toggleDepartment,
  toggleConnection,
  toggleMany,
}: {
  tab: PermissionTab;
  form: PerfilFormData;
  departamentos: { id: string; name: string }[];
  connections: ApiMessagingConnection[];
  togglePermission: (id: string, checked: boolean) => void;
  toggleDepartment: (id: string, checked: boolean) => void;
  toggleConnection: (id: string, checked: boolean) => void;
  toggleMany: (
    field: "permissionIds" | "departmentIds" | "connectionIds",
    ids: string[],
    checked: boolean,
  ) => void;
}) {
  const sortedConnections = sortByOptionLabel(connections, (connection) => connection.name);
  const connectionIds = sortedConnections.map((connection) => connection.id);
  const departmentIds = departamentos.map((department) => department.id);

  return (
    <div className="space-y-6">
      <SelectionSection
        title="Instancias"
        ids={connectionIds}
        selectedIds={form.connectionIds}
        emptyLabel="Nenhuma instancia cadastrada."
        onToggleAll={(checked) => toggleMany("connectionIds", connectionIds, checked)}
      >
        {sortedConnections.map((connection) => (
          <CheckField
            key={connection.id}
            label={connection.name}
            checked={form.connectionIds.includes(connection.id)}
            onChange={(checked) => toggleConnection(connection.id, checked)}
          />
        ))}
      </SelectionSection>

      <SelectionSection
        title="Departamentos"
        ids={departmentIds}
        selectedIds={form.departmentIds}
        emptyLabel="Nenhum departamento cadastrado."
        onToggleAll={(checked) => toggleMany("departmentIds", departmentIds, checked)}
      >
        {departamentos.map((department) => (
          <CheckField
            key={department.id}
            label={department.name}
            checked={form.departmentIds.includes(department.id)}
            onChange={(checked) => toggleDepartment(department.id, checked)}
          />
        ))}
      </SelectionSection>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Permissões
        </h3>
        <div className="space-y-4">
          {PERMISSION_GROUPS.filter((group) => group.tab === tab).map((group) => (
            <PermissionGroupBlock
              key={group.title}
              group={group}
              selectedIds={form.permissionIds}
              togglePermission={togglePermission}
              toggleMany={toggleMany}
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
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        <CheckField label="Todos" checked={allSelected} onChange={onToggleAll} />
      </div>
      {ids.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

function PermissionGroupBlock({
  group,
  selectedIds,
  togglePermission,
  toggleMany,
}: {
  group: { title: string; tab: PermissionTab; items: PermissionField[] };
  selectedIds: string[];
  togglePermission: (id: string, checked: boolean) => void;
  toggleMany: (
    field: "permissionIds" | "departmentIds" | "connectionIds",
    ids: string[],
    checked: boolean,
  ) => void;
}) {
  const ids = group.items.map((permission) => permission.id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {group.title}
        </p>
        <CheckField
          label="Todos"
          checked={allSelected}
          onChange={(checked) => toggleMany("permissionIds", ids, checked)}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {group.items.map((permission) => (
          <CheckField
            key={permission.id}
            label={permission.label}
            checked={selectedIds.includes(permission.id)}
            onChange={(checked) => togglePermission(permission.id, checked)}
          />
        ))}
      </div>
    </div>
  );
}

function WorkScheduleEditor({
  value,
  onChange,
}: {
  value: WorkSchedule;
  onChange: (value: WorkSchedule) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [selectedDay, setSelectedDay] = React.useState<WeekDay | null>(null);

  const updateShift = (day: WeekDay, shift: ShiftKey, patch: Partial<WorkShift>) => {
    onChange({
      ...value,
      days: {
        ...value.days,
        [day]: {
          ...value.days[day],
          [shift]: { ...value.days[day][shift], ...patch },
        },
      },
    });
  };

  const copyDayToAll = (sourceDay: WeekDay) => {
    const source = value.days[sourceDay];
    const days = { ...value.days };

    WEEK_DAYS.forEach((day) => {
      if (day === sourceDay) return;
      days[day] = { ...value.days[day] };
      (Object.keys(SHIFT_LABELS) as ShiftKey[]).forEach((shift) => {
        const targetShift = value.days[day][shift];
        if (!targetShift.active) return;
        days[day][shift] = {
          ...targetShift,
          start: source[shift].start,
          end: source[shift].end,
        };
      });
    });

    onChange({ ...value, days });
  };

  const toggleEditing = () => {
    setEditing((current) => !current);
    setSelectedDay(null);
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={value.noSchedule}
            disabled={!editing}
            onChange={(event) => onChange({ ...value, noSchedule: event.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Sem jornada
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={toggleEditing}>
          {editing ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Concluir
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </>
          )}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] table-fixed text-xs">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="w-20 px-2 py-2 text-left">Dia</th>
              {Object.values(SHIFT_LABELS).map((label) => (
                <th key={label} className="px-2 py-2 text-center" colSpan={3}>
                  {label}
                </th>
              ))}
              <th className="w-12 px-2 py-2" aria-label="Ações" rowSpan={2} />
            </tr>
            <tr>
              <th />
              {Object.keys(SHIFT_LABELS).flatMap((shift) => [
                <th key={`${shift}-active`} className="w-12 px-2 py-2 text-center">
                  Ativo
                </th>,
                <th key={`${shift}-start`} className="px-2 py-2 text-center">
                  Inicio
                </th>,
                <th key={`${shift}-end`} className="px-2 py-2 text-center">
                  Fim
                </th>,
              ])}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {WEEK_DAYS.map((day) => (
              <tr key={day}>
                <td className="px-2 py-2 font-medium">{day}</td>
                {(Object.keys(SHIFT_LABELS) as ShiftKey[]).map((shift) => {
                  const item = value.days[day][shift];
                  return (
                    <React.Fragment key={`${day}-${shift}`}>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.active}
                          disabled={!editing || value.noSchedule}
                          onChange={(event) => {
                            setSelectedDay(day);
                            updateShift(day, shift, { active: event.target.checked });
                          }}
                          className="h-4 w-4 accent-primary"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Input
                          type="time"
                          value={item.start}
                          disabled={!editing || value.noSchedule || !item.active}
                          className="w-full appearance-none px-2 text-center [&::-webkit-calendar-picker-indicator]:hidden"
                          onFocus={() => setSelectedDay(day)}
                          onChange={(event) =>
                            updateShift(day, shift, { start: event.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Input
                          type="time"
                          value={item.end}
                          disabled={!editing || value.noSchedule || !item.active}
                          className="w-full appearance-none px-2 text-center [&::-webkit-calendar-picker-indicator]:hidden"
                          onFocus={() => setSelectedDay(day)}
                          onChange={(event) => updateShift(day, shift, { end: event.target.value })}
                        />
                      </td>
                    </React.Fragment>
                  );
                })}
                <td className="px-2 py-2 text-center">
                  {editing && selectedDay === day && !value.noSchedule && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyDayToAll(day)}
                      title="Copiar para todos"
                      aria-label="Copiar para todos"
                      className="px-2"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
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
