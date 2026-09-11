import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Network, Copy } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  SectionHeader,
  Card,
  Button,
  Field,
  Input,
  Textarea,
  Select,
  SearchInput,
} from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { num } from "@/lib/format";
import { organizationApi, type ApiDepartment } from "@/lib/nexos-api";
import { sortByOptionLabel } from "@/lib/sort-options";

export const Route = createFileRoute("/departamentos")({ component: Page });

type DepartamentoFormData = {
  name?: string;
  description?: string | null;
  color?: string;
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
  const [editing, setEditing] = React.useState<ApiDepartment | null>(null);
  const [duplicating, setDuplicating] = React.useState<ApiDepartment | null>(null);
  const [deleting, setDeleting] = React.useState<ApiDepartment | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState("active");
  const novo = useDisclosure();

  const {
    data: departamentos = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["nexos", "departments"],
    queryFn: organizationApi.listDepartments,
  });

  const save = useMutation({
    mutationFn: (payload: { id?: string; data: DepartamentoFormData }) =>
      payload.id
        ? organizationApi.updateDepartment(payload.id, payload.data)
        : organizationApi.createDepartment({
            name: payload.data.name ?? "",
            description: payload.data.description,
            color: payload.data.color,
          }),
    onSuccess: (data, vars) => {
      const previous = vars.id ? editing : null;
      const savedDepartment = departmentWithLogFallback(data, previous);
      qc.setQueryData<ApiDepartment[]>(["nexos", "departments"], (current = []) => {
        if (vars.id) {
          return current.map((department) =>
            department.id === savedDepartment.id
              ? departmentWithLogFallback(savedDepartment, department)
              : department,
          );
        }
        return [savedDepartment, ...current];
      });
      qc.invalidateQueries({ queryKey: ["nexos", "departments"] });
      toast.success(vars.id ? "Departamento atualizado" : "Departamento criado");
      novo.hide();
      setEditing(null);
      setDuplicating(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => organizationApi.deleteDepartment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "departments"] });
      toast.success("Departamento desativado");
      setDeleting(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const filtered = sortByOptionLabel(departamentos, (department) => department.name).filter((d) => {
    if (activeFilter === "active" && !d.active) return false;
    if (activeFilter === "inactive" && d.active) return false;
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
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Criar Departamento
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="col-span-2 md:col-span-1">
              <SearchInput value={query} onChange={setQuery} placeholder="Buscar departamento..." />
            </div>
            <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
              <option value="active">Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Inativos</option>
            </Select>
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
                className="min-h-[86px] p-4 transition hover:border-primary/35 hover:bg-surface-1"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ background: d.color }}
                    >
                      <Network className="h-5 w-5" />
                    </div>
                    <p className="min-w-0 truncate font-semibold">{d.name}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Duplicar departamento"
                      aria-label={`Duplicar departamento ${d.name}`}
                      onClick={() => setDuplicating(d)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Editar departamento"
                      aria-label={`Editar departamento ${d.name}`}
                      onClick={() => setEditing(d)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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

        <DepartamentoForm
          open={novo.open}
          departments={departamentos}
          onClose={novo.hide}
          onSubmit={(data) => save.mutate({ data })}
        />
        <DepartamentoForm
          open={!!duplicating}
          initial={duplicating ?? undefined}
          clone
          departments={departamentos}
          onClose={() => setDuplicating(null)}
          onSubmit={(data) => save.mutate({ data })}
        />
        <DepartamentoForm
          open={!!editing}
          initial={editing ?? undefined}
          departments={departamentos}
          onClose={() => setEditing(null)}
          onSubmit={(data) => editing && save.mutate({ id: editing.id, data })}
        />
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
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DepartamentoFormData) => void;
  initial?: ApiDepartment;
  clone?: boolean;
  departments: ApiDepartment[];
}) {
  const [form, setForm] = React.useState<DepartamentoFormData>({});
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
          }
        : { color: "#3B82F6" },
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
        <div className="grid grid-cols-[minmax(7rem,1fr)_10.5rem] gap-3 sm:gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
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
            <div className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface-1 px-2">
              <input
                type="color"
                value={completeHexColor(form.color)}
                onChange={(e) => setForm({ ...form, color: normalizeHexColor(e.target.value) })}
                className="h-6 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent"
              />
              <Input
                value={form.color ?? "#3B82F6"}
                onChange={(e) => setForm({ ...form, color: normalizeHexColor(e.target.value) })}
                className="min-h-0 min-w-0 flex-1 border-0 bg-transparent px-1 py-0 uppercase focus:border-0"
              />
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
