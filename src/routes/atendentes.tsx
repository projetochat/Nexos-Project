import { sortAtendentes } from "@/lib/attendant-sort";
import { usePhotoCropper } from "@/hooks/use-photo-cropper";
import * as React from "react";
import { createPortal } from "react-dom";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash2,
  Unlock,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import {
  SectionHeader,
  Card,
  Button,
  Avatar,
  Badge,
  Field,
  Input,
  SearchInput,
  Select,
} from "@/components/ui-kit";
import { Modal, ConfirmDialog } from "@/components/modal";
import { DeletionConfirmDialog } from "@/components/deletion-confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { useDisclosure } from "@/hooks/use-disclosure";
import { num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { sortByOptionLabel } from "@/lib/sort-options";
import { organizationApi, type ApiUserMembership } from "@/lib/trixus-api";

export const Route = createFileRoute("/atendentes")({ component: AtendentesPage });

const TONE = { online: "success", ausente: "warning", offline: "default" } as const;
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type AttendantViewMode = "cards" | "list";

type Atendente = {
  id: string;
  userId: string;
  nome: string;
  email: string;
  cargo: string;
  perfilId: string;
  perfilKey: string;
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

function normalizeAtendenteName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function AtendentesPage() {
  const qc = useQueryClient();
  const sessionUser = useSession((state) => state.user);
  const canCreate = sessionUser?.permissions?.includes("users.create") ?? false;
  const canUpdate = sessionUser?.permissions?.includes("users.update") ?? false;
  const canDelete = sessionUser?.permissions?.includes("users.delete") ?? false;
  const canView = sessionUser?.permissions?.includes("users.read") ?? false;
  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ["trixus", "users"],
    queryFn: organizationApi.listUsers,
  });
  const { data: perfis = [] } = useQuery({
    queryKey: ["trixus", "roles"],
    queryFn: organizationApi.listRoles,
  });

  const perfisAtribuiveis = React.useMemo(
    () => perfis.filter((perfil) => perfil.key !== "tenant_admin" && perfil.active !== false),
    [perfis],
  );

  const atendentes = React.useMemo(
    () => sortAtendentes(memberships.map(toAtendente)),
    [memberships],
  );
  const [query, setQuery] = React.useState("");
  const [perfilFilter, setPerfilFilter] = React.useState("");
  const [ativoFilter, setAtivoFilter] = React.useState("");
  const [viewMode, setViewMode] = React.useState<AttendantViewMode>("list");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = React.useState<Atendente | null>(null);
  const [viewing, setViewing] = React.useState<Atendente | null>(null);
  const [duplicating, setDuplicating] = React.useState<Atendente | null>(null);
  const [deleting, setDeleting] = React.useState<Atendente | null>(null);
  const [removing, setRemoving] = React.useState<Atendente | null>(null);
  const hasFilters = Boolean(query.trim() || perfilFilter || ativoFilter);
  const clearFilters = () => {
    setQuery("");
    setPerfilFilter("");
    setAtivoFilter("");
    setPage(1);
  };
  const novo = useDisclosure();

  const create = useMutation({
    mutationFn: (data: Partial<Atendente>) =>
      organizationApi.createUser({
        email: data.email ?? "",
        name: data.nome ?? "",
        password: data.senha ?? "",
        roleId: data.perfilId,
        membershipStatus: data.ativo === false ? "DISABLED" : "ACTIVE",
        avatarUrl: data.avatarUrl ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trixus", "users"] });
      toast.success("Atendente cadastrado");
      novo.hide();
      setDuplicating(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
      reactivating,
    }: {
      id: string;
      data: Partial<Atendente>;
      reactivating: boolean;
    }) =>
      organizationApi.updateUser(id, {
        email: data.email,
        name: data.nome,
        password: data.senha || undefined,
        ...(reactivating ? { status: "ACTIVE" as const } : {}),
        roleId: data.perfilId,
        avatarUrl: data.avatarUrl ?? null,
        membershipStatus: data.ativo === false ? "DISABLED" : "ACTIVE",
      }),
    onSuccess: (membership) => {
      qc.invalidateQueries({ queryKey: ["trixus", "users"] });
      syncSessionUserFromMembership(membership, sessionUser?.id);
      toast.success("Atendente atualizado");
      setEditing(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const remove = useMutation({
    mutationFn: (atendente: Atendente) =>
      atendente.ativo
        ? organizationApi.deactivateUser(atendente.id)
        : organizationApi.activateUser(atendente.id),
    onSuccess: (_membership, atendente) => {
      qc.invalidateQueries({ queryKey: ["trixus", "users"] });
      toast.success(atendente.ativo ? "Atendente bloqueado" : "Atendente desbloqueado");
      setDeleting(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const filtered = atendentes.filter((a) => {
    if (perfilFilter && a.perfilId !== perfilFilter) return false;
    if (ativoFilter === "active" && !a.ativo) return false;
    if (ativoFilter === "inactive" && a.ativo) return false;
    if (query) return (a.nome + a.email + a.cargo).toLowerCase().includes(query.toLowerCase());
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paginated = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [ativoFilter, perfilFilter, query, pageSize]);

  const renderAttendantCard = (a: Atendente) => {
    const perfil = perfis.find((p) => p.id === a.perfilId);
    const isCurrentUser = a.userId === sessionUser?.id;

    return (
      <Card key={a.id} padding={false} className="overflow-hidden">
        <div className="flex min-w-0 items-center gap-3 p-4">
          <Avatar name={a.nome} src={a.avatarUrl} size={40} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{a.nome}</p>
            <p className="truncate text-xs text-muted-foreground">{perfil?.name ?? "-"}</p>
            <p className="truncate text-xs text-muted-foreground">{a.email}</p>
          </div>
          <div className="ml-auto shrink-0 self-start">
            <Badge tone={a.ativo ? "success" : "destructive"}>
              {a.ativo ? "Ativo" : "Inativo"}
            </Badge>
          </div>
        </div>
        {(canView || (a.perfilKey !== "tenant_admin" && (canCreate || canUpdate || canDelete))) && (
          <div className="mx-4 flex justify-end gap-1 border-t border-border py-2">
            {canView && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewing(a)}
                title="Visualizar"
                aria-label={`Visualizar ${a.nome}`}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            {a.perfilKey !== "tenant_admin" && canCreate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDuplicating(a)}
                title="Duplicar"
                aria-label={`Duplicar ${a.nome}`}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            {a.perfilKey !== "tenant_admin" && canUpdate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(a)}
                title="Editar"
                aria-label={`Editar ${a.nome}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {a.perfilKey !== "tenant_admin" && canDelete && !isCurrentUser && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className={a.ativo ? "action-hover-destructive" : "action-hover-success"}
                  onClick={() => setDeleting(a)}
                  title={a.ativo ? "Bloquear" : "Desbloquear"}
                  aria-label={`${a.ativo ? "Bloquear" : "Desbloquear"} ${a.nome}`}
                >
                  {a.ativo ? (
                    <Ban className="h-3.5 w-3.5" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="action-hover-destructive"
                  onClick={() => setRemoving(a)}
                  title="Excluir"
                  aria-label={`Excluir ${a.nome}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
    );
  };

  const paginationControls = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 leading-tight sm:leading-normal">
          Mostrando {num(paginated.length)} de {num(filtered.length)}
        </span>
        <Select
          value={String(pageSize)}
          onChange={(event) => setPageSize(Number(event.target.value))}
          className="!h-6 !min-h-6 !w-16 !rounded-md !px-2 !py-0 !pr-7 text-xs"
          aria-label="Registros por página"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !min-h-7 !w-7 !p-0"
          aria-label="Página anterior de atendentes"
          disabled={pageSafe === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-mono">
          {pageSafe} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !min-h-7 !w-7 !p-0"
          aria-label="Próxima página de atendentes"
          disabled={pageSafe === totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  );

  return (
    <AppShell>
      <PageContainer className="max-w-[96rem] lg:px-8 xl:px-10 2xl:px-12">
        <SectionHeader
          title="Atendentes"
          subtitle={`${num(atendentes.length)} atendentes cadastrados.`}
          subtitleClassName="hidden sm:block"
          actions={
            canCreate ? (
              <Button variant="primary" size="sm" onClick={novo.show}>
                <Plus className="h-3.5 w-3.5" /> Novo Atendente
              </Button>
            ) : null
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(140px,0.7fr))_auto]">
            <div className="col-span-2 xl:col-span-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Busca</label>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar por nome, e-mail ou perfil..."
              />
            </div>
            <FilterSelect label="Perfil" value={perfilFilter} onChange={setPerfilFilter}>
              <option value="">Todos</option>
              {sortByOptionLabel(perfisAtribuiveis, (p) => p.name).map((perfil) => (
                <option key={perfil.id} value={perfil.id}>
                  {perfil.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Ativo" value={ativoFilter} onChange={setAtivoFilter}>
              <option value="">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </FilterSelect>
            {hasFilters && (
              <div className="flex items-end">
                <ClearFiltersButton onClick={clearFilters} />
              </div>
            )}
          </div>
        </Card>

        <div
          className="mb-3 hidden items-center justify-end gap-1 md:flex"
          aria-label="Visualização de atendentes"
        >
          <Button
            type="button"
            variant={viewMode === "cards" ? "primary" : "secondary"}
            size="icon"
            onClick={() => setViewMode("cards")}
            aria-label="Visualizar atendentes em cards"
            aria-pressed={viewMode === "cards"}
            title="Cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "primary" : "secondary"}
            size="icon"
            onClick={() => setViewMode("list")}
            aria-label="Visualizar atendentes em lista"
            aria-pressed={viewMode === "list"}
            title="Lista"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 md:hidden">
          {isLoading && (
            <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>
          )}
          {!isLoading && paginated.map(renderAttendantCard)}
          {!isLoading && filtered.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum resultado.</Card>
          )}
        </div>

        {viewMode === "cards" && (
          <div className="hidden space-y-3 md:block">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {isLoading && (
                <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  Carregando...
                </Card>
              )}
              {!isLoading && paginated.map(renderAttendantCard)}
              {!isLoading && filtered.length === 0 && (
                <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  Nenhum resultado.
                </Card>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 overflow-hidden rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
              {paginationControls}
            </div>
          </div>
        )}

        <Card
          padding={false}
          className={viewMode === "list" ? "hidden overflow-hidden p-0 md:block" : "hidden"}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] table-fixed text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="w-[28%] rounded-tl-lg px-3 py-3 font-medium sm:px-4">Atendente</th>
                  <th className="w-[20%] px-3 py-3 font-medium sm:px-4">Perfil</th>
                  <th className="w-[24%] px-3 py-3 font-medium sm:px-4">E-mail</th>
                  <th className="w-[10%] px-3 py-3 font-medium sm:px-4">Ativo</th>
                  <th className="w-[18%] rounded-tr-lg px-2 py-3 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  paginated.map((a) => {
                    const perfil = perfis.find((p) => p.id === a.perfilId);
                    const isCurrentUser = a.userId === sessionUser?.id;
                    return (
                      <tr key={a.id} className="transition hover:bg-surface-1">
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={a.nome} src={a.avatarUrl} size={30} />
                            <p className="truncate font-medium">{a.nome}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground sm:px-4">
                          <span className="truncate">{perfil?.name ?? "-"}</span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground sm:px-4">
                          <span className="block truncate">{a.email}</span>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <Badge tone={a.ativo ? "success" : "destructive"}>
                            {a.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-2 py-3">
                          {(canView ||
                            (a.perfilKey !== "tenant_admin" &&
                              (canCreate || canUpdate || canDelete))) && (
                            <div className="mx-auto grid w-[196px] grid-cols-5 gap-1">
                              {canView && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setViewing(a)}
                                  title="Visualizar"
                                  aria-label={`Visualizar ${a.nome}`}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {a.perfilKey !== "tenant_admin" && canCreate && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDuplicating(a)}
                                  title="Duplicar"
                                  aria-label="Duplicar"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {a.perfilKey !== "tenant_admin" && canUpdate && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditing(a)}
                                  title="Editar"
                                  aria-label="Editar"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {a.perfilKey !== "tenant_admin" && canDelete && !isCurrentUser && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={
                                      a.ativo
                                        ? "action-hover-destructive"
                                        : "action-hover-success"
                                    }
                                    onClick={() => setDeleting(a)}
                                    title={a.ativo ? "Bloquear" : "Desbloquear"}
                                    aria-label={a.ativo ? "Bloquear" : "Desbloquear"}
                                  >
                                    {a.ativo ? (
                                      <Ban className="h-3.5 w-3.5" />
                                    ) : (
                                      <Unlock className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="action-hover-destructive"
                                    onClick={() => setRemoving(a)}
                                    title="Excluir"
                                    aria-label={`Excluir ${a.nome}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      Nenhum resultado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
            {paginationControls}
          </div>
        </Card>

        {canCreate && (
          <AtendenteForm
            open={novo.open}
            atendentes={atendentes}
            perfis={sortByOptionLabel(perfisAtribuiveis, (p) => p.name).map((p) => ({
              id: p.id,
              nome: p.name,
            }))}
            onClose={novo.hide}
            onSubmit={(data) => create.mutate(data)}
          />
        )}
        {canView && (
          <AtendenteForm
            open={!!viewing}
            atendentes={atendentes}
            perfis={sortByOptionLabel(perfisAtribuiveis, (p) => p.name).map((p) => ({
              id: p.id,
              nome: p.name,
            }))}
            initial={viewing ?? undefined}
            readOnly
            onClose={() => setViewing(null)}
            onSubmit={() => undefined}
          />
        )}
        {canUpdate && (
          <AtendenteForm
            open={!!editing}
            atendentes={atendentes}
            perfis={sortByOptionLabel(perfisAtribuiveis, (p) => p.name).map((p) => ({
              id: p.id,
              nome: p.name,
            }))}
            initial={editing ?? undefined}
            protectOwnAccess={editing?.userId === sessionUser?.id}
            onClose={() => setEditing(null)}
            onSubmit={(data) =>
              editing &&
              update.mutate({
                id: editing.id,
                data,
                reactivating: !editing.ativo && data.ativo === true,
              })
            }
          />
        )}
        {canCreate && (
          <AtendenteForm
            open={!!duplicating}
            atendentes={atendentes}
            perfis={sortByOptionLabel(perfisAtribuiveis, (p) => p.name).map((p) => ({
              id: p.id,
              nome: p.name,
            }))}
            initial={duplicating ?? undefined}
            clone
            onClose={() => setDuplicating(null)}
            onSubmit={(data) => create.mutate(data)}
          />
        )}
        <ConfirmDialog
          open={!!deleting}
          title={deleting?.ativo ? "Bloquear Atendente?" : "Desbloquear Atendente?"}
          destructive={deleting?.ativo}
          accent={deleting?.ativo ? "destructive" : "primary"}
          description={
            <p>
              Deseja realmente {deleting?.ativo ? "bloquear" : "desbloquear"} o atendente{" "}
              <strong className="font-semibold text-foreground">"{deleting?.nome ?? ""}"</strong>?
            </p>
          }
          confirmLabel={deleting?.ativo ? "Bloquear" : "Desbloquear"}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate(deleting)}
        />
        <DeletionConfirmDialog
          open={!!removing}
          resourceKey={removing?.id ?? "attendant"}
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          loadImpact={(signal) => {
            if (!removing) return Promise.reject(new Error("Atendente não selecionado."));
            return organizationApi.userDeletionPreview(removing.id, signal);
          }}
          onConfirm={({ snapshotToken, signal }) => {
            if (!removing) return Promise.reject(new Error("Atendente não selecionado."));
            return organizationApi.deleteUser(removing.id, snapshotToken, signal);
          }}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ["trixus", "users"] });
            toast.success("Atendente excluído");
            setRemoving(null);
          }}
          formatError={(error) => (error as Error).message}
        />
      </PageContainer>
    </AppShell>
  );
}

export function AtendenteForm({
  open,
  onClose,
  onSubmit,
  initial,
  clone = false,
  atendentes,
  perfis,
  protectOwnAccess = false,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: Partial<Atendente>) => void;
  initial?: Atendente;
  clone?: boolean;
  atendentes: Atendente[];
  perfis: { id: string; nome: string }[];
  protectOwnAccess?: boolean;
  readOnly?: boolean;
}) {
  const [form, setForm] = React.useState<Partial<Atendente>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = React.useState(false);
  const [passwordUnlocked, setPasswordUnlocked] = React.useState(false);
  const isEditing = Boolean(initial && !clone);
  const passwordRequired = !isEditing || passwordUnlocked;
  const passwordLocked = isEditing && !passwordUnlocked;
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const photoButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const duplicateName = (value: string) =>
    atendentes.some(
      (atendente) =>
        atendente.id !== (initial && !clone ? initial.id : undefined) &&
        normalizeAtendenteName(atendente.nome) === normalizeAtendenteName(value),
    );
  const duplicateEmail = (value: string) =>
    atendentes.some(
      (atendente) =>
        atendente.id !== (initial && !clone ? initial.id : undefined) &&
        atendente.email.trim().toLocaleLowerCase("pt-BR") ===
          value.trim().toLocaleLowerCase("pt-BR"),
    );
  React.useEffect(() => {
    setForm(
      initial
        ? clone
          ? {
              ...initial,
              id: undefined,
              nome: `${initial.nome} - Cópia`,
              email: initial.email.toLocaleLowerCase("en-US"),
              senha: "",
            }
          : { ...initial, email: initial.email.toLocaleLowerCase("en-US"), senha: "" }
        : {
            cargo: "Atendente",
            perfilId: undefined,
            status: "online",
            ativo: true,
          },
    );
    setErrors({});
    setShowPassword(false);
    setPasswordUnlocked(false);
    setPhotoMenuOpen(false);
    setCameraOpen(false);
    setPhotoPreviewOpen(false);
  }, [clone, initial, open, perfis]);

  const photoCrop = usePhotoCropper(
    (avatarUrl) => setForm((current) => ({ ...current, avatarUrl })),
    open,
  );
  const onPickFile = (file?: File | null) => {
    photoCrop.choose(file);
    setPhotoMenuOpen(false);
  };

  const showPhoto = () => {
    setPhotoMenuOpen(false);
    if (!form.avatarUrl) {
      toast.info("Nenhuma foto cadastrada para este atendente.");
      return;
    }
    setPhotoPreviewOpen(true);
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.nome || form.nome.trim().length < 3) errs.nome = "Informe o nome.";
    else if (duplicateName(form.nome)) errs.nome = "Já existe um atendente com este nome.";
    if (!form.perfilId) errs.perfilId = "Selecione um perfil.";
    if (!form.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email))
      errs.email = "E-mail inválido.";
    else if (duplicateEmail(form.email)) errs.email = "Já existe um atendente com este e-mail.";
    if (passwordRequired && (!form.senha?.trim() || form.senha.length < 6))
      errs.senha = "Senha mínima de 6 caracteres.";
    if (form.senha && form.senha.length > 0 && form.senha.length < 6)
      errs.senha = "Senha mínima de 6 caracteres.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Verifique os campos.");
      return;
    }
    onSubmit({ ...form, senha: passwordLocked ? undefined : form.senha });
  };

  const canShowPassword = !passwordLocked;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          readOnly
            ? "Visualizar Atendente"
            : initial && !clone
              ? "Editar Atendente"
              : clone
                ? "Duplicar Atendente"
                : "Novo Atendente"
        }
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <EntityFormLog
              createdAt={initial && !clone ? initial.createdAt : undefined}
              updatedAt={initial && !clone ? initial.updatedAt : undefined}
            />
            <div className="flex shrink-0 justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                {readOnly ? "Fechar" : "Cancelar"}
              </Button>
              {!readOnly && (
                <Button
                  variant="primary"
                  size="sm"
                  className="save-action-button"
                  onClick={submit}
                  disabled={Boolean(errors.nome || errors.email)}
                >
                  Salvar
                </Button>
              )}
            </div>
          </div>
        }
      >
        <fieldset disabled={readOnly} className="contents">
          <div className="grid gap-5 md:grid-cols-[150px_minmax(0,1fr)]">
            <div className="relative flex min-h-full items-center justify-center self-stretch">
              <button
                ref={photoButtonRef}
                type="button"
                className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-1 text-center text-sm font-semibold text-muted-foreground"
                onClick={() => setPhotoMenuOpen((current) => !current)}
                aria-label="Opções da foto"
              >
                {form.avatarUrl ? (
                  <img
                    src={form.avatarUrl}
                    alt="Foto do atendente"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Avatar name={form.nome ?? "?"} size={112} />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white opacity-0 transition hover:opacity-100">
                  <Camera className="h-8 w-8" />
                </span>
              </button>
              <FloatingPhotoMenu
                open={photoMenuOpen}
                anchorRef={photoButtonRef}
                onClose={() => setPhotoMenuOpen(false)}
              >
                <PhotoMenuButton icon={<Eye className="h-4 w-4" />} onClick={showPhoto}>
                  Mostrar foto
                </PhotoMenuButton>
                <PhotoMenuButton
                  icon={<Camera className="h-4 w-4" />}
                  onClick={() => {
                    setPhotoMenuOpen(false);
                    setCameraOpen(true);
                  }}
                >
                  Tirar foto
                </PhotoMenuButton>
                <PhotoMenuButton
                  icon={<Upload className="h-4 w-4" />}
                  onClick={() => fileRef.current?.click()}
                >
                  Carregar foto
                </PhotoMenuButton>
                <div className="my-1 border-t border-border" />
                <PhotoMenuButton
                  className="trash-action"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setForm({ ...form, avatarUrl: undefined });
                    setPhotoMenuOpen(false);
                  }}
                >
                  Remover foto
                </PhotoMenuButton>
              </FloatingPhotoMenu>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  onPickFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>

            <div className="space-y-4">
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={form.ativo !== false}
                  disabled={protectOwnAccess}
                  onCheckedChange={(checked) => setForm({ ...form, ativo: checked })}
                  aria-label="Ativo"
                />
                <span>Ativo</span>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome *">
                  <Input
                    value={form.nome ?? ""}
                    onChange={(e) => {
                      const nome = e.target.value;
                      setForm({ ...form, nome });
                      setErrors((current) => ({
                        ...current,
                        nome: duplicateName(nome) ? "Já existe um atendente com este nome." : "",
                      }));
                    }}
                  />
                  {errors.nome && (
                    <span className="mt-1 block text-[11px] text-destructive">{errors.nome}</span>
                  )}
                </Field>
                <Field label="Perfil de acesso *">
                  <Select
                    value={form.perfilId ?? ""}
                    disabled={protectOwnAccess}
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
                    <span className="mt-1 block text-[11px] text-destructive">
                      {errors.perfilId}
                    </span>
                  )}
                </Field>
                <Field label="E-mail (login) *">
                  <Input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => {
                      const email = e.target.value.toLocaleLowerCase("en-US");
                      setForm({ ...form, email });
                      setErrors((current) => ({
                        ...current,
                        email: duplicateEmail(email)
                          ? "Já existe um atendente com este e-mail."
                          : "",
                      }));
                    }}
                  />
                  {errors.email && (
                    <span className="mt-1 block text-[11px] text-destructive">{errors.email}</span>
                  )}
                </Field>
                <Field label={passwordRequired ? "Senha *" : "Senha"} asLabel={false}>
                  <div className="relative">
                    <Input
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      aria-label="Senha do atendente"
                      disabled={passwordLocked}
                      aria-required={passwordRequired}
                      placeholder={
                        passwordLocked ? "Senha protegida" : isEditing ? "Digite a nova senha" : ""
                      }
                      value={form.senha ?? ""}
                      onChange={(e) => {
                        if (initial && !clone && !e.target.value) setShowPassword(false);
                        setForm({ ...form, senha: e.target.value });
                      }}
                      className={isEditing ? "pr-20" : "pr-10"}
                    />
                    {isEditing && (
                      <button
                        type="button"
                        aria-label={
                          passwordLocked
                            ? "Desbloquear alteração de senha"
                            : "Bloquear alteração de senha"
                        }
                        title={
                          passwordLocked
                            ? "Desbloquear alteração de senha"
                            : "Bloquear alteração de senha"
                        }
                        onClick={() => {
                          setPasswordUnlocked(passwordLocked);
                          setShowPassword(false);
                          setForm((current) => ({ ...current, senha: "" }));
                          setErrors((current) => ({ ...current, senha: "" }));
                          if (passwordLocked)
                            requestAnimationFrame(() => passwordRef.current?.focus());
                        }}
                        className={`absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground transition ${passwordLocked ? "hover:text-blue-600" : "hover:text-red-600"}`}
                      >
                        {passwordLocked ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <LockOpen className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {canShowPassword && (
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className={`absolute ${isEditing ? "right-11" : "right-3"} top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground transition hover:text-foreground`}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {errors.senha && (
                    <span className="mt-1 block text-[11px] text-destructive">{errors.senha}</span>
                  )}
                </Field>
              </div>
            </div>
          </div>
        </fieldset>
      </Modal>
      {photoCrop.dialog}
      <AtendenteCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(avatarUrl) => {
          photoCrop.choose(avatarUrl);
          setCameraOpen(false);
        }}
      />
      <PhotoPreviewModal
        open={photoPreviewOpen}
        title={form.nome ? `Foto de ${form.nome}` : "Foto do Atendente"}
        src={form.avatarUrl}
        onClose={() => setPhotoPreviewOpen(false)}
      />
    </>
  );
}

function PhotoMenuButton({
  icon,
  onClick,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={
        "flex w-full items-center gap-3 px-4 py-2 text-left text-foreground transition hover:bg-surface-1 " +
        className
      }
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </button>
  );
}

function FloatingPhotoMenu({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPosition({
        top: Math.min(window.innerHeight - 220, rect.bottom + 8),
        left: Math.max(12, Math.min(window.innerWidth - 204, rect.left)),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [anchorRef, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[260] w-48 rounded-lg border border-border bg-card py-2 text-sm shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      {children}
    </div>,
    document.body,
  );
}

function AtendenteCameraModal({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError(null);

    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      })
      .catch(() => {
        setError("Não foi possível acessar a câmera neste dispositivo.");
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("A câmera ainda não está pronta.");
      return;
    }
    const maxSize = 2048;
    const ratio = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Não foi possível capturar a imagem.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.82));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tirar Foto"
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={capture} disabled={!!error}>
            Capturar
          </Button>
        </>
      }
    >
      {error ? (
        <div className="rounded-lg border border-border bg-surface-1 p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          className="aspect-video w-full rounded-lg border border-border bg-black object-cover"
        />
      )}
    </Modal>
  );
}

function PhotoPreviewModal({
  open,
  title,
  src,
  onClose,
}: {
  open: boolean;
  title: string;
  src?: string | null;
  onClose: () => void;
}) {
  return (
    <Modal open={open && !!src} onClose={onClose} title={title} size="md">
      <div className="flex justify-center">
        {src && (
          <img
            src={src}
            alt={title}
            className="max-h-[70vh] w-full max-w-sm rounded-xl border border-border object-contain"
          />
        )}
      </div>
    </Modal>
  );
}

function EntityFormLog({
  createdAt,
  updatedAt,
}: {
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  if (!createdAt && !updatedAt) return <span aria-hidden="true" />;
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

function syncSessionUserFromMembership(membership: ApiUserMembership, currentUserId?: string) {
  if (!currentUserId || membership.user.id !== currentUserId) return;
  useSession.setState((state) => ({
    user: state.user
      ? {
          ...state.user,
          nome: membership.user.name,
          email: membership.user.email,
          avatarUrl: membership.user.avatarUrl ?? undefined,
        }
      : state.user,
  }));
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </label>
  );
}

function toAtendente(membership: ApiUserMembership): Atendente {
  const active = membership.status === "ACTIVE" && membership.user.status === "ACTIVE";
  return {
    id: membership.id,
    userId: membership.user.id,
    nome:
      membership.presentationName?.trim() ||
      membership.user.presentationName?.trim() ||
      membership.user.name,
    email: membership.user.email,
    cargo: membership.role.name,
    perfilId: membership.role.id,
    perfilKey: membership.role.key,
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(new Date(value))
    .replace(",", "");
}
