import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  SectionHeader,
  Card,
  Button,
  Avatar,
  Badge,
  KPI,
  Field,
  Input,
  Select,
} from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import { organizationApi, type ApiUserMembership } from "@/lib/nexos-api";

export const Route = createFileRoute("/atendentes")({ component: AtendentesPage });

const TONE = { online: "success", ausente: "warning", offline: "default" } as const;

type Atendente = {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  perfilId: string;
  status: keyof typeof TONE;
  csat: number;
  emAtendimento: number;
  resolvidas: number;
  ativo: boolean;
  senha?: string;
  avatarUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

function AtendentesPage() {
  const qc = useQueryClient();
  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ["nexos", "users"],
    queryFn: organizationApi.listUsers,
  });
  const { data: perfis = [] } = useQuery({
    queryKey: ["nexos", "roles"],
    queryFn: organizationApi.listRoles,
  });

  const atendentes = React.useMemo(() => memberships.map(toAtendente), [memberships]);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [editing, setEditing] = React.useState<Atendente | null>(null);
  const [deleting, setDeleting] = React.useState<Atendente | null>(null);
  const novo = useDisclosure();

  const create = useMutation({
    mutationFn: (data: Partial<Atendente>) =>
      organizationApi.createUser({
        email: data.email ?? "",
        name: data.nome ?? "",
        password: data.senha ?? "",
        roleId: data.perfilId,
        avatarUrl: data.avatarUrl ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "users"] });
      toast.success("Atendente cadastrado");
      novo.hide();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Atendente> }) =>
      organizationApi.updateUser(id, {
        email: data.email,
        name: data.nome,
        password: data.senha || undefined,
        roleId: data.perfilId,
        avatarUrl: data.avatarUrl ?? null,
        membershipStatus: data.ativo === false ? "DISABLED" : "ACTIVE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "users"] });
      toast.success("Atendente atualizado");
      setEditing(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => organizationApi.deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "users"] });
      toast.success("Atendente desativado");
      setDeleting(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const filtered = atendentes.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (query) return (a.nome + a.email + a.cargo).toLowerCase().includes(query.toLowerCase());
    return true;
  });

  const online = atendentes.filter((a) => a.status === "online").length;
  const csat = atendentes.length
    ? (atendentes.reduce((s, a) => s + a.csat, 0) / atendentes.length).toFixed(1)
    : "0.0";
  const idle = atendentes.filter((a) => a.emAtendimento === 0 && a.status === "online").length;

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Atendentes"
          subtitle={`${atendentes.length} atendentes cadastrados.`}
          actions={
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Cadastrar
            </Button>
          }
        />

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <KPI label="Total" value={String(atendentes.length)} tone="info" />
          <KPI
            label="Online agora"
            value={String(online)}
            delta={`+${Math.floor(online / 6)}`}
            tone="success"
          />
          <KPI label="Avaliacao media" value={csat} delta="+0.1" tone="success" />
          <KPI label="Ociosos" value={String(idle)} tone="warning" />
        </div>

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent py-2 text-sm outline-none"
                placeholder="Buscar atendente..."
              />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos os status</option>
              <option>online</option>
              <option>ausente</option>
              <option>offline</option>
            </Select>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Atendente</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Em atendimento</th>
                <th className="px-4 py-3 font-medium">Avaliacao</th>
                <th className="px-4 py-3 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading &&
                filtered.map((a) => {
                  const perfil = perfis.find((p) => p.id === a.perfilId);
                  return (
                    <tr key={a.id} className="transition hover:bg-surface-1">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={a.nome} src={a.avatarUrl} size={30} />
                          <div>
                            <p className="font-medium">{a.nome}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">{perfil?.name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={TONE[a.status]}>{a.status}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono">{a.emAtendimento}</td>
                      <td className="px-4 py-3 font-mono">{a.csat}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(a)} title="Editar" aria-label="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(a)} title="Remover" aria-label="Remover">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum resultado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <AtendenteForm
          open={novo.open}
          perfis={perfis.map((p) => ({ id: p.id, nome: p.name }))}
          onClose={novo.hide}
          onSubmit={(data) => create.mutate(data)}
        />
        <AtendenteForm
          open={!!editing}
          perfis={perfis.map((p) => ({ id: p.id, nome: p.name }))}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={(data) => editing && update.mutate({ id: editing.id, data })}
        />
        <ConfirmDialog
          open={!!deleting}
          title="Desativar atendente?"
          destructive
          description={`Esta acao desativara ${deleting?.nome ?? ""} na equipe.`}
          confirmLabel="Desativar"
          onClose={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate(deleting.id)}
        />
      </PageContainer>
    </AppShell>
  );
}

function AtendenteForm({
  open,
  onClose,
  onSubmit,
  initial,
  perfis,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: Partial<Atendente>) => void;
  initial?: Atendente;
  perfis: { id: string; nome: string }[];
}) {
  const [form, setForm] = React.useState<Partial<Atendente>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    setForm(
      initial
        ? { ...initial }
        : {
            cargo: "Atendente",
            perfilId: perfis[0]?.id,
            status: "online",
            ativo: true,
          },
    );
    setErrors({});
  }, [initial, open, perfis]);

  const onPickFile = (file?: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem maior que 2MB.");
      return;
    }
    void readImageAsCompressedDataUrl(file)
      .then((avatarUrl) => setForm((f) => ({ ...f, avatarUrl })))
      .catch((error) => toast.error((error as Error).message));
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.nome || form.nome.trim().length < 3) errs.nome = "Informe o nome.";
    if (!form.perfilId) errs.perfilId = "Selecione um perfil.";
    if (!form.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email))
      errs.email = "E-mail invalido.";
    if (!initial && (!form.senha || form.senha.length < 6))
      errs.senha = "Senha minima de 6 caracteres.";
    if (form.senha && form.senha.length > 0 && form.senha.length < 6)
      errs.senha = "Senha minima de 6 caracteres.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Verifique os campos.");
      return;
    }
    onSubmit(form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar atendente" : "Cadastrar atendente"}
      size="lg"
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
      <div className="grid gap-4">
        <Field label="Status">
          <div className="flex w-fit gap-2 rounded-lg border border-border bg-surface-1 p-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm">
              <input
                type="radio"
                name="atendente-status"
                className="h-4 w-4 accent-primary"
                checked={form.ativo !== false}
                onChange={() => setForm({ ...form, ativo: true })}
              />
              <span>Ativo</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm">
              <input
                type="radio"
                name="atendente-status"
                className="h-4 w-4 accent-primary"
                checked={form.ativo === false}
                onChange={() => setForm({ ...form, ativo: false })}
              />
              <span>Inativo</span>
            </label>
          </div>
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome *">
            <Input
              value={form.nome ?? ""}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
            {errors.nome && (
              <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>
            )}
          </Field>
          <Field label="Perfil de acesso *">
            <Select
              value={form.perfilId ?? ""}
              onChange={(e) => setForm({ ...form, perfilId: e.target.value || undefined })}
            >
              <option value="">Selecione...</option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
            {errors.perfilId && (
              <span className="mt-1 block text-[11px] text-destructive">{errors.perfilId}</span>
            )}
          </Field>
          <Field label="E-mail (login) *">
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {errors.email && (
              <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>
            )}
          </Field>
          <Field label={initial ? "Senha (deixe em branco para manter)" : "Senha *"}>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.senha ?? ""}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
            />
            {errors.senha && (
              <span className="mt-1 block text-[11px] text-destructive">{errors.senha}</span>
            )}
          </Field>
        </div>
        <Field label="Foto">
          <div className="flex items-center gap-3">
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <Avatar name={form.nome ?? "?"} size={56} />
            )}
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                Fazer upload
              </Button>
              {form.avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm({ ...form, avatarUrl: undefined })}
                >
                  Remover
                </Button>
              )}
            </div>
          </div>
        </Field>
        {initial && (
          <div className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
            <span className="mr-3">Criado: {formatDateTime(initial.createdAt)}</span>
            <span>Editado: {formatDateTime(initial.updatedAt)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

function toAtendente(membership: ApiUserMembership): Atendente {
  const active = membership.status === "ACTIVE" && membership.user.status === "ACTIVE";
  return {
    id: membership.id,
    nome: membership.user.name,
    email: membership.user.email,
    cargo: membership.role.name,
    perfilId: membership.role.id,
    status: active ? "online" : "offline",
    csat: 0,
    emAtendimento: 0,
    resolvidas: 0,
    ativo: active,
    avatarUrl: membership.user.avatarUrl ?? undefined,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function readImageAsCompressedDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxSize = 512;
      const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}
