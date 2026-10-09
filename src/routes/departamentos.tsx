import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Copy,
  Check,
  AlertTriangle,
  ChevronDown,
  X,
  Trash2,
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
  InstanceFilterSelect,
  Select,
} from "@/components/ui-kit";
import { Modal } from "@/components/modal";
import { Switch } from "@/components/ui/switch";
import { useDisclosure } from "@/hooks/use-disclosure";
import { num } from "@/lib/format";
import {
  organizationApi,
  type ApiDepartment,
  type DepartmentIcon as DepartmentIconName,
  type ApiMessagingConnection,
} from "@/lib/trixus-api";
import { sortByOptionLabel } from "@/lib/sort-options";
import { useSession } from "@/lib/session";
import { DepartmentIcon, DepartmentIconSelect } from "@/components/department-icon";
import { DeletionConfirmDialog } from "@/components/deletion-confirm-dialog";

export const Route = createFileRoute("/departamentos")({ component: Page });

export type DepartamentoFormData = {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: DepartmentIconName;
  connectionIds: string[];
  active?: boolean;
};

type DepartmentDeactivationPreview = Awaited<
  ReturnType<typeof organizationApi.departmentDeactivationPreview>
>;

function normalizeDepartmentName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function duplicateDepartmentName(name: string, departments: ApiDepartment[]) {
  const existingNames = new Set(
    departments.map((department) => normalizeDepartmentName(department.name)),
  );
  let duplicateName = `${name} - Cópia`;
  let count = 2;
  while (existingNames.has(normalizeDepartmentName(duplicateName))) {
    duplicateName = `${name} - Cópia (${count++})`;
  }
  return duplicateName;
}

function departmentWithLogFallback(department: ApiDepartment, previous?: ApiDepartment | null) {
  const now = new Date().toISOString();
  return {
    ...department,
    createdAt: department.createdAt ?? previous?.createdAt ?? now,
    updatedAt: department.updatedAt ?? now,
  };
}

function Page() {
  const qc = useQueryClient();
  const permissions = useSession((state) => state.user?.permissions ?? []);
  const canCreate = permissions.includes("departments.create");
  const canUpdate = permissions.includes("departments.update");
  const canDelete = permissions.includes("departments.delete");
  const [editing, setEditing] = React.useState<ApiDepartment | null>(null);
  const [duplicating, setDuplicating] = React.useState<ApiDepartment | null>(null);
  const [deleting, setDeleting] = React.useState<ApiDepartment | null>(null);
  const [pendingDeactivation, setPendingDeactivation] = React.useState<{
    department: ApiDepartment;
    preview: DepartmentDeactivationPreview;
  } | null>(null);
  const [migrationTargets, setMigrationTargets] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState("");
  const [instanceFilter, setInstanceFilter] = React.useState("");
  const novo = useDisclosure();

  const {
    data: departamentos = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["trixus", "departments", instanceFilter],
    queryFn: () =>
      organizationApi.listDepartmentsByConnection({
        connectionId: instanceFilter || undefined,
        status: "all",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const { data: connectionOptions = [] } = useQuery({
    queryKey: ["trixus", "department-connection-options"],
    queryFn: organizationApi.departmentConnectionOptions,
  });

  const save = useMutation({
    mutationFn: (payload: { id?: string; data: DepartamentoFormData }) =>
      payload.id
        ? organizationApi.updateDepartment(payload.id, payload.data)
        : organizationApi.createDepartment({
            name: payload.data.name ?? "",
            description: payload.data.description,
            color: payload.data.color,
            icon: payload.data.icon,
            connectionIds: payload.data.connectionIds,
          }),
    onSuccess: (data, vars) => {
      const previous = vars.id ? editing : null;
      const savedDepartment = departmentWithLogFallback(data, previous);
      qc.setQueryData<ApiDepartment[]>(["trixus", "departments"], (current = []) => {
        if (vars.id) {
          return current.map((department) =>
            department.id === savedDepartment.id
              ? departmentWithLogFallback(savedDepartment, department)
              : department,
          );
        }
        return [savedDepartment, ...current];
      });
      qc.invalidateQueries({ queryKey: ["trixus", "departments"] });
      qc.invalidateQueries({ queryKey: ["trixus", "role-scope-options"] });
      toast.success(vars.id ? "Departamento atualizado" : "Departamento criado");
      novo.hide();
      setEditing(null);
      setDuplicating(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const deactivate = useMutation({
    mutationFn: (payload: {
      id: string;
      targets: Array<{ connectionId: string | null; departmentId: string }>;
    }) => organizationApi.deactivateDepartment(payload.id, payload.targets),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trixus", "departments"] });
      qc.invalidateQueries({ queryKey: ["trixus", "role-scope-options"] });
      toast.success("Departamento inativado");
      setPendingDeactivation(null);
      setMigrationTargets({});
      setEditing(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const submitDepartment = async (data: DepartamentoFormData) => {
    if (!editing || !editing.active || data.active !== false) {
      save.mutate({ id: editing?.id, data });
      return;
    }
    try {
      const changes = { ...data };
      delete changes.active;
      await organizationApi.updateDepartment(editing.id, changes);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["trixus", "departments"] }),
        qc.invalidateQueries({ queryKey: ["trixus", "role-scope-options"] }),
      ]);
      const preview = await organizationApi.departmentDeactivationPreview(editing.id);
      if (preview.openConversationCount === 0) {
        deactivate.mutate({ id: editing.id, targets: [] });
        return;
      }
      setMigrationTargets({});
      setPendingDeactivation({ department: editing, preview });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const filtered = sortByOptionLabel(departamentos, (department) => department.name).filter((d) => {
    if (
      query &&
      !(d.name + " " + (d.description ?? "")).toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Departamentos"
          subtitle={`${num(departamentos.length)} departamentos cadastrados.`}
          actions={
            canCreate ? (
              <Button variant="primary" size="sm" onClick={novo.show}>
                <Plus className="h-3.5 w-3.5" /> Criar Departamento
              </Button>
            ) : null
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,9rem)] gap-2 sm:gap-3 md:grid-cols-[minmax(0,1fr)_minmax(13rem,16rem)]">
            <Field label="Busca">
              <SearchInput value={query} onChange={setQuery} placeholder="Buscar departamento..." />
            </Field>
            <Field label="Instância">
              <InstanceFilterSelect
                value={instanceFilter}
                onChange={setInstanceFilter}
                allLabel="Todas"
                options={connectionOptions.map((connection) => ({
                  value: connection.id,
                  label: connection.name,
                  color: connection.color,
                }))}
              />
            </Field>
          </div>
        </Card>

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>
        ) : isError ? (
          <Card className="p-8 text-center text-sm text-destructive">
            Não foi possível carregar departamentos.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((d) => (
              <Card
                key={d.id}
                className={`min-h-[86px] p-4 transition hover:border-primary/35 hover:bg-surface-1 ${d.active ? "" : "opacity-60"}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ background: d.color }}
                    >
                      <DepartmentIcon icon={d.icon} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{d.name}</p>
                      {!d.active && <p className="text-xs text-muted-foreground">Inativo</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {canCreate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Duplicar departamento"
                        aria-label={`Duplicar departamento ${d.name}`}
                        onClick={() => setDuplicating(d)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canUpdate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Editar departamento"
                        aria-label={`Editar departamento ${d.name}`}
                        onClick={() => setEditing(d)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Excluir departamento"
                        aria-label={`Excluir departamento ${d.name}`}
                        onClick={() => setDeleting(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            {filtered.length === 0 && (
              <Card className="col-span-full p-8 text-center text-sm text-muted-foreground">
                Nenhum resultado.
              </Card>
            )}
          </div>
        )}

        {canCreate && (
          <DepartamentoForm
            open={novo.open}
            departments={departamentos}
            connections={connectionOptions}
            onClose={novo.hide}
            onSubmit={(data) => save.mutate({ data })}
          />
        )}
        {canCreate && (
          <DepartamentoForm
            open={!!duplicating}
            initial={duplicating ?? undefined}
            clone
            departments={departamentos}
            connections={connectionOptions}
            onClose={() => setDuplicating(null)}
            onSubmit={(data) => save.mutate({ data })}
          />
        )}
        {canUpdate && (
          <DepartamentoForm
            open={!!editing}
            initial={editing ?? undefined}
            departments={departamentos}
            connections={connectionOptions}
            onClose={() => setEditing(null)}
            onSubmit={(data) => void submitDepartment(data)}
          />
        )}
        <DepartmentDeactivationModal
          value={pendingDeactivation}
          connectionOptions={connectionOptions}
          targets={migrationTargets}
          busy={deactivate.isPending}
          onTargetChange={(connectionId, departmentId) =>
            setMigrationTargets((current) => ({ ...current, [connectionId ?? ""]: departmentId }))
          }
          onClose={() => {
            setPendingDeactivation(null);
            setMigrationTargets({});
          }}
          onConfirm={() => {
            if (!pendingDeactivation) return;
            deactivate.mutate({
              id: pendingDeactivation.department.id,
              targets: pendingDeactivation.preview.groups.map((group) => ({
                connectionId: group.connectionId,
                departmentId: migrationTargets[group.connectionId ?? ""],
              })),
            });
          }}
        />
        <DeletionConfirmDialog
          open={!!deleting}
          resourceKey={`department:${deleting?.id ?? "none"}`}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          loadImpact={(signal) => {
            if (!deleting) return Promise.reject(new Error("Departamento não selecionado."));
            return organizationApi.departmentDeletionPreview(deleting.id, signal);
          }}
          onConfirm={({ snapshotToken, signal }) => {
            if (!deleting) return Promise.reject(new Error("Departamento não selecionado."));
            return organizationApi.deleteDepartment(deleting.id, snapshotToken, signal);
          }}
          onDeleted={() => {
            toast.success("Departamento excluído");
            setDeleting(null);
            void Promise.all([
              qc.invalidateQueries({ queryKey: ["trixus", "departments"] }),
              qc.invalidateQueries({ queryKey: ["trixus", "role-scope-options"] }),
              qc.invalidateQueries({ queryKey: ["tickets"] }),
            ]);
          }}
          formatError={(error) => (error as Error).message}
        />
      </PageContainer>
    </AppShell>
  );
}

export function DepartamentoForm({
  open,
  onClose,
  onSubmit,
  initial,
  clone = false,
  departments,
  connections,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DepartamentoFormData) => void;
  initial?: ApiDepartment;
  clone?: boolean;
  departments: ApiDepartment[];
  connections: Array<Pick<ApiMessagingConnection, "id" | "name" | "status" | "color" | "logoUrl">>;
}) {
  const [form, setForm] = React.useState<DepartamentoFormData>({ connectionIds: [] });
  const [error, setError] = React.useState("");
  const duplicateNameError = (name: string) => {
    const normalizedName = normalizeDepartmentName(name);
    if (!normalizedName) return "";
    return departments.some(
      (department) =>
        department.id !== (initial && !clone ? initial.id : undefined) &&
        normalizeDepartmentName(department.name) === normalizedName,
    )
      ? "Já existe um departamento com este nome."
      : "";
  };
  React.useEffect(() => {
    setForm(
      initial
        ? {
            name: clone ? duplicateDepartmentName(initial.name, departments) : initial.name,
            description: initial.description,
            color: initial.color,
            icon: initial.icon,
            connectionIds: initial.connectionIds,
            active: clone ? true : initial.active,
          }
        : { color: "#3B82F6", icon: "department", connectionIds: [], active: true },
    );
    setError("");
  }, [clone, departments, initial, open]);

  const submit = () => {
    if (!form.name || form.name.trim().length < 2) {
      setError("Informe o nome.");
      toast.error("Nome obrigatório.");
      return;
    }
    const duplicateError = duplicateNameError(form.name);
    if (duplicateError) {
      setError(duplicateError);
      return;
    }
    onSubmit({ ...form, color: completeHexColor(form.color) });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        initial && !clone
          ? "Editar Departamento"
          : clone
            ? "Duplicar Departamento"
            : "Novo Departamento"
      }
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <EntityFormLog
            show={!!initial && !clone}
            createdAt={initial?.createdAt}
            updatedAt={initial?.updatedAt}
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
      <div className="space-y-4">
        {!clone && (
          <div className="flex items-center gap-2">
            <Switch
              id="department-active"
              checked={form.active !== false}
              onCheckedChange={(active) => setForm((current) => ({ ...current, active }))}
            />
            <label htmlFor="department-active" className="cursor-pointer text-sm">
              Ativo
            </label>
          </div>
        )}
        <div className="grid grid-cols-[minmax(7rem,1fr)_8.5rem] gap-3 sm:gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Field label="Nome *" error={error || undefined}>
            <Input
              value={form.name ?? ""}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                setError(duplicateNameError(e.target.value));
              }}
            />
          </Field>
          <Field label="Cor">
            <div className="flex min-h-10 items-center gap-1 rounded-lg border border-border bg-surface-1 px-1.5">
              <input
                type="color"
                value={completeHexColor(form.color)}
                onChange={(e) => setForm({ ...form, color: normalizeHexColor(e.target.value) })}
                className="h-6 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent"
              />
              <Input
                value={form.color ?? "#3B82F6"}
                onChange={(e) => setForm({ ...form, color: normalizeHexColor(e.target.value) })}
                className="min-w-0 flex-1 border-0 bg-transparent uppercase focus:border-0 max-sm:!min-h-0 max-sm:!p-0"
              />
            </div>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
          <Field label="Instâncias">
            <DepartmentInstanceMultiSelect
              connections={connections}
              selectedIds={form.connectionIds}
              onChange={(connectionIds) => setForm((current) => ({ ...current, connectionIds }))}
            />
          </Field>
          <Field label="Ícone">
            <DepartmentIconSelect
              value={form.icon}
              onChange={(icon) => setForm((current) => ({ ...current, icon }))}
            />
          </Field>
        </div>
        <Field label="Nota">
          <Textarea
            rows={3}
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function DepartmentInstanceMultiSelect({
  connections,
  selectedIds,
  onChange,
}: {
  connections: Array<Pick<ApiMessagingConnection, "id" | "name" | "color">>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selectedConnections = connections.filter((connection) =>
    selectedIds.includes(connection.id),
  );

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left text-sm outline-none transition hover:border-primary/50 focus:border-primary ${
          selectedConnections.length > 0 ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedConnections.length === 0 ? (
            <span className="text-muted-foreground">- Selecione -</span>
          ) : (
            selectedConnections.map((connection) => (
              <span
                key={connection.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: connection.color ?? "#22c55e" }}
                />
                <span className="truncate">{connection.name}</span>
              </span>
            ))
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selectedConnections.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                onChange([]);
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              aria-label="Limpar seleção"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full z-[90] mb-2 max-h-[min(22rem,calc(100vh-10rem))] w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-card"
        >
          {connections.map((connection) => {
            const selected = selectedIds.includes(connection.id);
            return (
              <button
                key={connection.id}
                type="button"
                onClick={() => toggle(connection.id)}
                role="option"
                aria-selected={selected}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-surface-1 ${
                  selected ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface-1"
                  }`}
                >
                  {selected && <Check className="h-2.5 w-2.5" />}
                </span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: connection.color ?? "#22c55e" }}
                />
                <span className="truncate">{connection.name}</span>
              </button>
            );
          })}
          {connections.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhuma instância cadastrada.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DepartmentDeactivationModal({
  value,
  connectionOptions,
  targets,
  busy,
  onTargetChange,
  onClose,
  onConfirm,
}: {
  value: { department: ApiDepartment; preview: DepartmentDeactivationPreview } | null;
  connectionOptions: Array<Pick<ApiMessagingConnection, "id" | "name">>;
  targets: Record<string, string>;
  busy: boolean;
  onTargetChange: (connectionId: string | null, departmentId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const groups = value?.preview.groups ?? [];
  const ready =
    groups.length > 0 &&
    groups.every(
      (group) =>
        !!targets[group.connectionId ?? ""] &&
        group.destinations.some(
          (destination) => destination.id === targets[group.connectionId ?? ""],
        ),
    );
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title="Inativar Departamento"
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={!ready || busy} onClick={onConfirm}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              Existem {value?.preview.openConversationCount ?? 0} conversas ativas vinculadas a este
              departamento.
            </p>
            <p className="text-muted-foreground">
              Selecione o destino compatível para cada instância. A inativação ocorrerá somente após
              todas as transferências.
            </p>
          </div>
        </div>
        {groups.map((group) => {
          const key = group.connectionId ?? "";
          const connectionName = group.connectionId
            ? (connectionOptions.find((connection) => connection.id === group.connectionId)?.name ??
              "Instância")
            : "Sem instância";
          return (
            <Field
              key={key || "without-connection"}
              label={`${connectionName} · ${group.count} conversa${group.count === 1 ? "" : "s"}`}
            >
              <Select
                value={targets[key] ?? ""}
                onChange={(event) => onTargetChange(group.connectionId, event.target.value)}
              >
                <option value="">Selecione um departamento ativo</option>
                {group.destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
              </Select>
              {group.destinations.length === 0 && (
                <p className="mt-1 text-xs text-destructive">
                  Não existe departamento ativo e compatível para esta instância.
                </p>
              )}
            </Field>
          );
        })}
      </div>
    </Modal>
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

function normalizeHexColor(value?: string | null, _fallback = "#3B82F6") {
  const digits = String(value ?? "")
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6);
  return `#${digits.toUpperCase()}`;
}

function completeHexColor(value?: string | null, fallback = "#3B82F6") {
  const normalized = normalizeHexColor(value);
  return normalized.length === 7 ? normalized : normalizeHexColor(fallback);
}
