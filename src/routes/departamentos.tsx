import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Copy, Check } from "lucide-react";
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
import {
  organizationApi,
  type ApiDepartment,
  type DepartmentIcon as DepartmentIconName,
  type ApiMessagingConnection,
} from "@/lib/trixus-api";
import { sortByOptionLabel } from "@/lib/sort-options";
import { useSession } from "@/lib/session";
import { DepartmentIcon, DEPARTMENT_ICON_OPTIONS } from "@/components/department-icon";

export const Route = createFileRoute("/departamentos")({ component: Page });

type DepartamentoFormData = {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: DepartmentIconName;
  connectionIds: string[];
};

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
  const [query, setQuery] = React.useState("");
  const novo = useDisclosure();

  const {
    data: departamentos = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["trixus", "departments"],
    queryFn: organizationApi.listDepartments,
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
      toast.success(vars.id ? "Departamento atualizado" : "Departamento criado");
      novo.hide();
      setEditing(null);
      setDuplicating(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => organizationApi.deleteDepartment(id),
    onSuccess: (_department, deletedId) => {
      qc.setQueryData<ApiDepartment[]>(["trixus", "departments"], (current = []) =>
        current.filter((department) => department.id !== deletedId),
      );
      qc.invalidateQueries({ queryKey: ["trixus", "departments"] });
      toast.success("Departamento excluído");
      setDeleting(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

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
          <Field label="Busca">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar departamento..." />
          </Field>
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
                className="min-h-[86px] p-4 transition hover:border-primary/35 hover:bg-surface-1"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ background: d.color }}
                    >
                      <DepartmentIcon icon={d.icon} />
                    </div>
                    <p className="min-w-0 truncate font-semibold">{d.name}</p>
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
                        className="trash-action"
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
            onSubmit={(data) => editing && save.mutate({ id: editing.id, data })}
          />
        )}
        <ConfirmDialog
          open={!!deleting}
          title="Excluir Departamento?"
          destructive
          description={
            <p>
              Deseja realmente excluir o departamento{" "}
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

function DepartamentoForm({
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
          }
        : { color: "#3B82F6", icon: "department", connectionIds: [] },
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
    if (connections.length > 0 && form.connectionIds.length === 0) {
      toast.error("Vincule ao menos uma instância.");
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
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <Field label="Instâncias">
            <div className="min-h-11 rounded-lg border border-border bg-surface-1 p-2">
              {connections.length === 0 ? (
                <p className="px-1 py-1 text-sm text-muted-foreground">
                  Nenhuma instância cadastrada.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {connections.map((connection) => {
                    const selected = form.connectionIds.includes(connection.id);
                    return (
                      <button
                        key={connection.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            connectionIds: selected
                              ? current.connectionIds.filter((id) => id !== connection.id)
                              : [...current.connectionIds, connection.id],
                          }))
                        }
                        className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm transition ${selected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"}`}
                      >
                        <span className="h-2 w-2 rounded-full bg-success" />
                        {connection.name}
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Field>
          <Field label="Ícone">
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface-1 p-1.5">
              {DEPARTMENT_ICON_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = (form.icon ?? "department") === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={selected}
                    onClick={() => setForm((current) => ({ ...current, icon: option.id }))}
                    className={`flex min-h-11 items-center justify-center rounded-md border transition ${selected ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-muted"}`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
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
