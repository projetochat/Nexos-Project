import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ShieldCheck, Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Field, Input, Textarea } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { organizationApi, type ApiRole } from "@/lib/nexos-api";

export const Route = createFileRoute("/perfis")({ component: Page });

const PERM_FIELDS = [
  { id: "users.read", label: "Ver usuarios" },
  { id: "users.manage", label: "Gerenciar usuarios" },
  { id: "departments.read", label: "Ver departamentos" },
  { id: "departments.manage", label: "Gerenciar departamentos" },
  { id: "roles.read", label: "Ver perfis" },
  { id: "roles.manage", label: "Gerenciar perfis" },
  { id: "chat.contacts.edit", label: "Pode editar contato" },
  { id: "chat.customer_link.edit", label: "Pode editar vinculo de cliente" },
  { id: "chat.tags.use", label: "Pode usar etiquetas" },
  { id: "chat.tags.manage", label: "Pode gerenciar etiquetas" },
  { id: "chat.leads.read", label: "Visualiza leads" },
  { id: "chat.contacts.read", label: "Visualiza contatos" },
  { id: "chat.phone.read", label: "Visualiza numero" },
  { id: "chat.messages.delete", label: "Excluir mensagem" },
  { id: "chat.messages.edit", label: "Editar mensagem" },
  { id: "chat.quick_replies.read", label: "Acessa mensagens rapidas" },
  { id: "chat.quick_replies.manage", label: "Gerenciar mensagens rapidas" },
  { id: "chat.contacts.block", label: "Bloquear contatos" },
  { id: "chat.audio.send", label: "Enviar audio" },
  { id: "chat.agent_name.show", label: "Apresentar nome do atendente na conversa" },
  { id: "chat.conversations.view_all_active", label: "Ver todas conversas ativas" },
] as const;

type PerfilFormData = {
  name: string;
  description: string;
  permissionIds: string[];
  departmentIds: string[];
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
      const metadata = { departmentIds: data.departmentIds };
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
          title="Perfis de acesso"
          subtitle={`${items.length} perfis cadastrados.`}
          actions={
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Novo perfil
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent py-2 text-sm outline-none"
              placeholder="Buscar perfil..."
            />
          </div>
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
          onClose={novo.hide}
          onSubmit={(data) => save.mutate({ data })}
        />
        <PerfilForm
          open={!!editing}
          departamentos={departamentos.map((d) => ({ id: d.id, name: d.name }))}
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
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PerfilFormData) => void;
  initial?: ApiRole;
  departamentos: { id: string; name: string }[];
}) {
  const [form, setForm] = React.useState<PerfilFormData>({
    name: "",
    description: "",
    permissionIds: [],
    departmentIds: [],
  });
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    const metadata = (initial?.metadata ?? {}) as { departmentIds?: string[] };
    setForm(
      initial
        ? {
            name: initial.name,
            description: initial.description ?? "",
            permissionIds: initial.permissionIds,
            departmentIds: metadata.departmentIds ?? [],
          }
        : {
            name: "",
            description: "",
            permissionIds: ["departments.read", "chat.contacts.read", "chat.tags.use", "chat.quick_replies.read"],
            departmentIds: [],
          },
    );
    setError("");
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
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {PERM_FIELDS.map((permission) => (
              <CheckField
                key={permission.id}
                label={permission.label}
                checked={form.permissionIds.includes(permission.id)}
                onChange={(checked) => togglePermission(permission.id, checked)}
              />
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
