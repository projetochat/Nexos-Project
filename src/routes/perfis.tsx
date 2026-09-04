import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ShieldCheck, Copy } from "lucide-react";
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
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { num } from "@/lib/format";
import { sortByOptionLabel } from "@/lib/sort-options";
import {
  connectionsApi,
  organizationApi,
  type ApiMessagingConnection,
  type ApiRole,
} from "@/lib/nexos-api";

export const Route = createFileRoute("/perfis")({ component: Page });

type PermissionTab = "chat" | "chamados";
type PermissionField = { id: string; label: string };

const PERMISSION_GROUPS: Array<{ title: string; tab: PermissionTab; items: PermissionField[] }> = [
  {
    title: "Administracao",
    tab: "chat",
    items: [
      { id: "users.read", label: "Ver usuarios" },
      { id: "users.manage", label: "Gerenciar usuarios" },
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
      { id: "chat.phone.read", label: "Visualizar numero" },
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

const PERM_FIELDS = PERMISSION_GROUPS.flatMap((group) => group.items);
const WEEK_DAYS = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"] as const;
const SHIFT_LABELS = {
  morning: "Turno manha",
  afternoon: "Turno tarde",
  night: "Turno noite",
} as const;
type WeekDay = (typeof WEEK_DAYS)[number];
type ShiftKey = keyof typeof SHIFT_LABELS;
type WorkShift = { active: boolean; start: string; end: string };
type WorkSchedule = { noSchedule: boolean; days: Record<WeekDay, Record<ShiftKey, WorkShift>> };

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
  permissionIds: string[];
  departmentIds: string[];
  connectionIds: string[];
  workSchedule: WorkSchedule;
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

  const [editing, setEditing] = React.useState<ApiRole | null>(null);
  const [deleting, setDeleting] = React.useState<ApiRole | null>(null);
  const [query, setQuery] = React.useState("");
  const novo = useDisclosure();

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
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["nexos", "roles"] });
      toast.success(vars.id ? "Perfil atualizado" : "Perfil criado");
      novo.hide();
      setEditing(null);
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

  const duplicate = useMutation({
    mutationFn: (p: ApiRole) => {
      const existentes = new Set(items.map((x) => x.name));
      let name = `Copia de ${p.name}`;
      let n = 2;
      while (existentes.has(name)) name = `Copia (${n++}) de ${p.name}`;
      return organizationApi.createRole({
        name,
        description: p.description,
        permissionIds: p.permissionIds,
        metadata: p.metadata,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "roles"] });
      toast.success("Perfil duplicado");
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
              <Plus className="h-3.5 w-3.5" /> Novo perfil
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
            {filtered.map((p) => (
              <Card key={p.id}>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="duplicate-action-button"
                      onClick={() => duplicate.mutate(p)}
                      title="Duplicar"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(p)}
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="mt-4 font-semibold">{p.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {p.description || "Sem descricao"}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-mono text-xs text-muted-foreground">
                  <span>
                    {p.permissionIds.length}/{PERM_FIELDS.length} permissoes
                  </span>
                  <span>{p.system ? "sistema" : "custom"}</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        <PerfilForm
          open={novo.open}
          departamentos={departamentos.map((d) => ({ id: d.id, name: d.name }))}
          connections={connections}
          onClose={novo.hide}
          onSubmit={(data) => save.mutate({ data })}
        />
        <PerfilForm
          open={!!editing}
          departamentos={departamentos.map((d) => ({ id: d.id, name: d.name }))}
          connections={connections}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={(data) => editing && save.mutate({ id: editing.id, data })}
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
  departamentos,
  connections,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PerfilFormData) => void;
  initial?: ApiRole;
  departamentos: { id: string; name: string }[];
  connections: ApiMessagingConnection[];
}) {
  const [form, setForm] = React.useState<PerfilFormData>({
    name: "",
    description: "",
    permissionIds: [],
    departmentIds: [],
    connectionIds: [],
    workSchedule: defaultWorkSchedule(),
  });
  const [error, setError] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<PermissionTab>("chat");
  const [showSchedule, setShowSchedule] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const metadata = (initial?.metadata ?? {}) as {
      departmentIds?: string[];
      connectionIds?: string[];
      workSchedule?: WorkSchedule;
    };
    setForm(
      initial
        ? {
            name: initial.name,
            description: initial.description ?? "",
            permissionIds: initial.permissionIds,
            departmentIds: metadata.departmentIds ?? [],
            connectionIds: metadata.connectionIds ?? [],
            workSchedule: metadata.workSchedule ?? defaultWorkSchedule(),
          }
        : {
            name: "",
            description: "",
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
    setActiveTab("chat");
    setShowSchedule(false);
  }, [initial, open]);

  const submit = () => {
    if (!form.name || form.name.trim().length < 2) {
      setError("Informe o nome.");
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? "Editar perfil" : "Novo perfil"}
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Field label="Nome *">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex: Atendente Senior"
          />
          {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
        </Field>
        <Field label="Descricao">
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        <div className="flex border-b border-border">
          {[
            { id: "chat" as const, label: "Chat" },
            { id: "chamados" as const, label: "Chamados" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-2 text-sm transition ${
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Instancias
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {sortByOptionLabel(connections, (connection) => connection.name).map((connection) => (
              <CheckField
                key={connection.id}
                label={connection.name}
                checked={form.connectionIds.includes(connection.id)}
                onChange={(checked) => toggleConnection(connection.id, checked)}
              />
            ))}
            {connections.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma instancia cadastrada.</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Departamentos
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {departamentos.map((d) => (
              <CheckField
                key={d.id}
                label={d.name}
                checked={form.departmentIds.includes(d.id)}
                onChange={(checked) => toggleDepartment(d.id, checked)}
              />
            ))}
            {departamentos.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum departamento cadastrado.</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Permissoes
          </h3>
          <div className="space-y-4">
            {PERMISSION_GROUPS.map((group) =>
              group.tab === activeTab ? (
                <div key={group.title}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {group.title}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {group.items.map((permission) => (
                      <CheckField
                        key={permission.id}
                        label={permission.label}
                        checked={form.permissionIds.includes(permission.id)}
                        onChange={(checked) => togglePermission(permission.id, checked)}
                      />
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Jornada de trabalho
            </h3>
            <Button variant="outline" size="sm" onClick={() => setShowSchedule((value) => !value)}>
              {showSchedule ? "Ocultar jornada" : "Apresentar jornada"}
            </Button>
          </div>
          {showSchedule && (
            <div className="mt-3">
              <WorkScheduleEditor
                value={form.workSchedule}
                onChange={(workSchedule) => setForm((current) => ({ ...current, workSchedule }))}
              />
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function WorkScheduleEditor({
  value,
  onChange,
}: {
  value: WorkSchedule;
  onChange: (value: WorkSchedule) => void;
}) {
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

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span />
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={value.noSchedule}
            onChange={(event) => onChange({ ...value, noSchedule: event.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Sem jornada
        </label>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="w-20 px-2 py-2 text-left">Dia</th>
              {Object.values(SHIFT_LABELS).map((label) => (
                <th key={label} className="px-2 py-2 text-left" colSpan={3}>
                  {label}
                </th>
              ))}
            </tr>
            <tr>
              <th />
              {Object.keys(SHIFT_LABELS).flatMap((shift) => [
                <th key={`${shift}-active`} className="w-12 px-2 py-2 text-left">
                  Ativo
                </th>,
                <th key={`${shift}-start`} className="px-2 py-2 text-left">
                  Inicio
                </th>,
                <th key={`${shift}-end`} className="px-2 py-2 text-left">
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
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={item.active}
                          disabled={value.noSchedule}
                          onChange={(event) =>
                            updateShift(day, shift, { active: event.target.checked })
                          }
                          className="h-4 w-4 accent-primary"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="time"
                          value={item.start}
                          disabled={value.noSchedule || !item.active}
                          className="px-2"
                          onChange={(event) =>
                            updateShift(day, shift, { start: event.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="time"
                          value={item.end}
                          disabled={value.noSchedule || !item.active}
                          className="px-2"
                          onChange={(event) => updateShift(day, shift, { end: event.target.value })}
                        />
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
