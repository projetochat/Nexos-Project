import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Building2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Field, Input, Textarea, Select } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { organizationApi, type ApiDepartment } from "@/lib/nexos-api";

export const Route = createFileRoute("/departamentos")({ component: Page });

type DepartamentoFormData = {
  name?: string;
  description?: string | null;
  color?: string;
};

function Page() {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<ApiDepartment | null>(null);
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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["nexos", "departments"] });
      toast.success(vars.id ? "Departamento atualizado" : "Departamento criado");
      novo.hide();
      setEditing(null);
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

  const filtered = departamentos.filter((d) => {
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
          subtitle={`${departamentos.length} departamentos cadastrados.`}
          actions={
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Criar departamento
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent py-2 text-sm outline-none"
                placeholder="Buscar departamento..."
              />
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
            Nao foi possivel carregar departamentos.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((d) => (
              <Card key={d.id}>
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                    style={{ background: d.color }}
                  >
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(d)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="mt-4 font-semibold">{d.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-mono text-xs">
                  <span className="text-muted-foreground">{d.memberCount ?? 0} membros</span>
                  <span className="text-primary">
                    {d.openConversationCount ?? 0} conversas abertas
                  </span>
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
          onClose={novo.hide}
          onSubmit={(data) => save.mutate({ data })}
        />
        <DepartamentoForm
          open={!!editing}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={(data) => editing && save.mutate({ id: editing.id, data })}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Desativar departamento?"
          destructive
          description={`Esta acao desativara ${deleting?.name ?? ""}.`}
          confirmLabel="Desativar"
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
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DepartamentoFormData) => void;
  initial?: ApiDepartment;
}) {
  const [form, setForm] = React.useState<DepartamentoFormData>({});
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    setForm(
      initial
        ? { name: initial.name, description: initial.description, color: initial.color }
        : { color: "#6366f1" },
    );
    setError("");
  }, [initial, open]);

  const submit = () => {
    if (!form.name || form.name.trim().length < 2) {
      setError("Informe o nome.");
      toast.error("Nome obrigatorio.");
      return;
    }
    onSubmit(form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar departamento" : "Criar departamento"}
      size="md"
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
      <div className="space-y-4">
        <Field label="Nome *">
          <Input
            value={form.name ?? ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
        </Field>
        <Field label="Descricao">
          <Textarea
            rows={3}
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label="Cor">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color ?? "#6366f1"}
              onChange={(e) => setForm({ ...form, color: normalizeHexColor(e.target.value) })}
              className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent"
            />
            <Input
              value={form.color ?? "#6366f1"}
              onChange={(e) => setForm({ ...form, color: normalizeHexColor(e.target.value) })}
            />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function normalizeHexColor(value?: string | null, fallback = "#6366f1") {
  const fallbackDigits = fallback.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "6366f1";
  const digits = String(value ?? "")
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6);
  return `#${(digits || fallbackDigits).toUpperCase()}`;
}
