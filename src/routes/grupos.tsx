import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  Crown,
  Pencil,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquareMore,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  InstanceFilterSelect,
  SearchInput,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import {
  conversationApi,
  crmApi,
  groupsApi,
  type ApiContactInstanceOption,
  type ApiGroupContactPickerItem,
  type ApiWhatsappGroup,
  type ApiWhatsappGroupParticipant,
} from "@/lib/trixus-api";
import { num } from "@/lib/format";
import { sortByOptionLabel } from "@/lib/sort-options";

export const Route = createFileRoute("/grupos")({ component: GroupsPage });

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
const GROUP_PICKER_PAGE_SIZE = 50;

function useGroupContactPicker(open: boolean, query: string) {
  const [page, setPage] = React.useState(1);
  const [items, setItems] = React.useState<ApiGroupContactPickerItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const deferredQuery = useDebouncedValue(query.trim(), 250);

  React.useEffect(() => setPage(1), [deferredQuery]);
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void crmApi
      .listContactsForGroupPicker({
        q: deferredQuery || undefined,
        page,
        pageSize: GROUP_PICKER_PAGE_SIZE,
      })
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setTotal(response.total);
      })
      .catch((error) => {
        if (!cancelled)
          toast.error("Falha ao carregar contatos", { description: (error as Error).message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deferredQuery, open, page]);

  return { items, total, loading, page, setPage };
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function ContactPickerPager({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / GROUP_PICKER_PAGE_SIZE));
  if (totalPages <= 1) return null;
  return (
    <div className="mt-2 flex items-center justify-end gap-2 rounded-lg bg-surface-1 px-2 py-1 text-xs text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange((current) => Math.max(1, current - 1))}
        disabled={page <= 1}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span>
        {page} / {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange((current) => Math.min(totalPages, current + 1))}
        disabled={page >= totalPages}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function GroupsPage() {
  const navigate = useNavigate();
  const create = useDisclosure();
  const [groups, setGroups] = React.useState<ApiWhatsappGroup[]>([]);
  const [instances, setInstances] = React.useState<ApiContactInstanceOption[]>([]);
  const [query, setQuery] = React.useState("");
  const [instanceFilter, setInstanceFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [selectedGroup, setSelectedGroup] = React.useState<ApiWhatsappGroup | null>(null);
  const [leavingGroup, setLeavingGroup] = React.useState<ApiWhatsappGroup | null>(null);
  const initialReloadScheduledRef = React.useRef(false);
  const debouncedQuery = useDebouncedValue(query, 250);

  React.useEffect(() => {
    void crmApi
      .contactOptions()
      .then((options) =>
        setInstances(
          sortByOptionLabel(
            // Grupos já sincronizados continuam consultáveis mesmo depois que a instância é desligada.
            // A API de opções retorna as conexões conectadas e desconectadas não arquivadas.
            options.instances,
            (instance) => instance.name,
          ),
        ),
      )
      .catch((error) =>
        toast.error("Falha ao carregar instâncias", { description: (error as Error).message }),
      );
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const groupResponse = await groupsApi.list({
        q: debouncedQuery,
        page,
        pageSize,
        connectionId: instanceFilter,
      });
      setGroups(groupResponse.items);
      setTotal(groupResponse.total);
      setTotalPages(groupResponse.totalPages);
    } catch (error) {
      toast.error("Falha ao carregar grupos", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, instanceFilter, page, pageSize]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (loading || total > 0 || initialReloadScheduledRef.current) return;
    initialReloadScheduledRef.current = true;
    const timer = setTimeout(() => void load(), 4000);
    return () => clearTimeout(timer);
  }, [load, loading, total]);

  React.useEffect(() => {
    setPage(1);
  }, [instanceFilter, query, pageSize]);

  const pageSafe = Math.min(page, totalPages);
  const syncGroups = async () => {
    setSyncing(true);
    try {
      const result = await groupsApi.sync({
        connectionId: instanceFilter || undefined,
      });
      toast.success("Grupos atualizados", {
        description: `${num(result.synced)} grupo(s) sincronizado(s), ${num(result.participants)} participante(s) atualizado(s).`,
      });
      await load();
    } catch (error) {
      toast.error("Falha ao atualizar grupos", { description: (error as Error).message });
    } finally {
      setSyncing(false);
    }
  };
  const openGroupChat = async (group: ApiWhatsappGroup) => {
    try {
      await conversationApi.updateInboxArchive(group.conversationId, false);
      navigate({
        to: "/inbox/$conversationId",
        params: { conversationId: group.conversationId },
      });
    } catch (error) {
      toast.error("Não foi possível abrir a conversa", { description: (error as Error).message });
    }
  };

  return (
    <AppShell>
      <PageContainer className="max-w-[96rem] lg:px-8 xl:px-10 2xl:px-12">
        <SectionHeader
          title="Gerenciar Grupos"
          subtitle={`${num(total)} grupos de WhatsApp.`}
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void syncGroups()}
                disabled={syncing}
                title="Atualizar grupos"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Atualizando..." : "Atualizar"}
              </Button>
              <Button variant="primary" size="sm" onClick={create.show}>
                <Plus className="h-3.5 w-3.5" /> Criar Grupo
              </Button>
            </div>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(13rem,16rem)]">
            <div className="col-span-2 md:col-span-1">
              <Field label="Busca">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar por grupo, participante..."
                />
              </Field>
            </div>
            <Field label="Instância">
              <InstanceSelect
                value={instanceFilter}
                onChange={setInstanceFilter}
                instances={instances}
                emptyLabel="Todas"
              />
            </Field>
          </div>
        </Card>

        <Card padding={false} className="min-w-0 overflow-hidden">
          <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {loading &&
              Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-lg border border-border bg-surface-1"
                />
              ))}
            {!loading &&
              groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onOpenChat={() => void openGroupChat(group)}
                  onDetail={() => setSelectedGroup(group)}
                  onLeave={() => setLeavingGroup(group)}
                />
              ))}
            {!loading && groups.length === 0 && (
              <div className="col-span-full rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
                Nenhum grupo encontrado.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0">
                Mostrando {num(groups.length)} de {num(total)}
              </span>
              <Select
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 w-20 text-xs sm:w-24"
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
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={pageSafe <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span>
                {pageSafe} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={pageSafe >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>

        <CreateGroupModal
          open={create.open}
          onClose={create.hide}
          instances={instances}
          onSubmit={async (data) => {
            const group = await groupsApi.create(data);
            create.hide();
            if (group.warnings?.length) {
              toast.warning("Grupo criado com pendências de sincronização", {
                description: group.warnings.join(" "),
              });
            } else {
              toast.success("Grupo criado");
            }
            void load().catch((error) => toast.error((error as Error).message));
          }}
        />
        <GroupDetailModal
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          onGroupChange={(updated) => {
            setSelectedGroup(updated);
            setGroups((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
          }}
          onOpenChat={(group) => void openGroupChat(group)}
        />
        <ConfirmDialog
          open={!!leavingGroup}
          title="Sair do Grupo?"
          destructive
          confirmLabel="Sair do Grupo"
          description={
            <p>
              Deseja realmente sair do grupo{" "}
              <strong className="font-semibold text-foreground">
                "{leavingGroup?.name ?? ""}"
              </strong>
              ?
            </p>
          }
          onClose={() => setLeavingGroup(null)}
          onConfirm={() => {
            const group = leavingGroup;
            if (!group) return;
            void groupsApi
              .leave(group.id)
              .then(async () => {
                toast.success("Você saiu do grupo");
                if (selectedGroup?.id === group.id) setSelectedGroup(null);
                await load();
              })
              .catch((error) =>
                toast.error("Não foi possível sair do grupo", {
                  description: (error as Error).message,
                }),
              );
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

function GroupCard({
  group,
  onOpenChat,
  onDetail,
  onLeave,
}: {
  group: ApiWhatsappGroup;
  onOpenChat: () => void;
  onDetail: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onDoubleClick={onDetail}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onDetail();
      }}
      title="Clique duas vezes para visualizar o grupo"
      className="flex min-h-40 w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md sm:p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={group.name} src={group.imageUrl ?? undefined} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {num(group.participantsCount)} participante(s)
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" /> Criado em {formatDate(group.createdAt)}
        </p>
        {group.connection && (
          <p className="truncate">
            Instância: <span className="text-foreground">{group.connection.name}</span>
          </p>
        )}
      </div>
      <div className="mt-4 flex min-w-0 justify-end gap-1 border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          title="Abrir conversa"
          aria-label="Abrir conversa"
          onClick={(event) => {
            event.stopPropagation();
            onOpenChat();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <MessageSquareMore className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Editar grupo"
          aria-label="Editar grupo"
          onClick={(event) => {
            event.stopPropagation();
            onDetail();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Sair do grupo"
          aria-label="Sair do grupo"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            onLeave();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function InstanceSelect({
  value,
  onChange,
  instances,
  emptyLabel,
  extraOptions = [],
}: {
  value: string;
  onChange: (value: string) => void;
  instances: ApiContactInstanceOption[];
  emptyLabel: string;
  extraOptions?: Array<{ value: string; label: string }>;
}) {
  return (
    <InstanceFilterSelect
      value={value}
      onChange={onChange}
      options={instances.map((instance) => ({
        value: instance.id,
        label: instance.name,
        color: instance.color,
      }))}
      extraOptions={extraOptions}
      allLabel={emptyLabel}
    />
  );
}

function CreateGroupModal({
  open,
  onClose,
  instances,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  instances: ApiContactInstanceOption[];
  onSubmit: (data: {
    name: string;
    connectionId: string;
    participantContactIds: string[];
    description?: string;
    imageDataUrl?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [connectionId, setConnectionId] = React.useState("");
  const [selectedContacts, setSelectedContacts] = React.useState<ApiGroupContactPickerItem[]>([]);
  const [availableQuery, setAvailableQuery] = React.useState("");
  const [selectedQuery, setSelectedQuery] = React.useState("");
  const [step, setStep] = React.useState<"selection" | "details">("selection");
  const [description, setDescription] = React.useState("");
  const [imageDataUrl, setImageDataUrl] = React.useState<string | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const picker = useGroupContactPicker(open, availableQuery);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setConnectionId(instances[0]?.id ?? "");
    setSelectedContacts([]);
    setAvailableQuery("");
    setSelectedQuery("");
    setStep("selection");
    setDescription("");
    setImageDataUrl(null);
    setBusy(false);
  }, [instances, open]);

  const filteredContacts = React.useMemo(() => {
    const q = availableQuery.trim().toLowerCase();
    const selected = new Set(selectedContacts.map((contact) => contact.id));
    const digits = q.replace(/\D/g, "");
    return picker.items.filter((contact) => {
      if (selected.has(contact.id)) return false;
      if (!q) return true;
      return (
        contact.nome.toLowerCase().includes(q) ||
        contact.telefone.toLowerCase().includes(q) ||
        (digits && contact.normalizedPhone.includes(digits))
      );
    });
  }, [availableQuery, picker.items, selectedContacts]);

  const filteredSelectedContacts = React.useMemo(() => {
    const q = selectedQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return selectedContacts.filter((contact) => {
      if (!q) return true;
      return (
        contact.nome.toLowerCase().includes(q) ||
        contact.telefone.toLowerCase().includes(q) ||
        (digits && contact.normalizedPhone.includes(digits))
      );
    });
  }, [selectedContacts, selectedQuery]);

  const addContact = (contact: ApiGroupContactPickerItem) => {
    setSelectedContacts((current) =>
      current.some((item) => item.id === contact.id) ? current : [...current, contact],
    );
  };

  const removeContact = (id: string) => {
    setSelectedContacts((current) => current.filter((item) => item.id !== id));
  };

  const goToDetails = () => {
    if (name.trim().length < 2) return toast.error("Informe o nome do grupo.");
    if (!connectionId) return toast.error("Selecione uma instância.");
    if (!selectedContacts.length) return toast.error("Selecione ao menos um participante.");
    setStep("details");
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        connectionId,
        participantContactIds: selectedContacts.map((contact) => contact.id),
        description: description.trim(),
        imageDataUrl: imageDataUrl ?? undefined,
      });
    } catch (error) {
      toast.error("Falha ao criar grupo", { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open && step === "selection"}
        onClose={onClose}
        title="Criar Grupo"
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={goToDetails} disabled={busy}>
              Próximo
            </Button>
          </>
        }
      >
        <div className="min-w-0 space-y-4">
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <Field label="Nome do grupo *">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Digite o nome do grupo"
              />
            </Field>
            <Field label="Instância *">
              <InstanceSelect
                value={connectionId}
                onChange={setConnectionId}
                instances={instances}
                emptyLabel="Selecione uma instância"
              />
            </Field>
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <section className="order-2 min-w-0 rounded-xl border border-border p-3 sm:p-4 lg:order-1">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-lg font-semibold">Contatos disponíveis</h3>
                <Badge tone="default">{num(picker.total)}</Badge>
              </div>
              <SearchInput
                value={availableQuery}
                onChange={setAvailableQuery}
                placeholder="Buscar contato ou WhatsApp..."
              />
              <div className="mt-3 max-h-[28rem] divide-y divide-border overflow-y-auto">
                {filteredContacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Avatar name={contact.nome} src={contact.avatar_url ?? undefined} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{contact.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {contact.telefone}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => addContact(contact)}
                      title={`Adicionar ${contact.nome}`}
                      aria-label={`Adicionar ${contact.nome}`}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {filteredContacts.length === 0 && (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Nenhum contato encontrado.
                  </div>
                )}
              </div>
              <ContactPickerPager
                page={picker.page}
                total={picker.total}
                onPageChange={picker.setPage}
              />
            </section>

            {selectedContacts.length > 0 && (
              <section className="order-1 min-w-0 rounded-xl border border-border p-3 sm:p-4 lg:order-2">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Contatos selecionados</h3>
                    <Badge tone="default">{num(selectedContacts.length)}</Badge>
                  </div>
                </div>
                <SearchInput
                  value={selectedQuery}
                  onChange={setSelectedQuery}
                  placeholder="Buscar nos selecionados..."
                />
                <div className="mt-3 max-h-[28rem] divide-y divide-border overflow-y-auto">
                  {filteredSelectedContacts.map((contact) => (
                    <div key={contact.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <Avatar name={contact.nome} src={contact.avatar_url ?? undefined} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{contact.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {contact.telefone}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        title={`Remover ${contact.nome}`}
                        aria-label={`Remover ${contact.nome}`}
                        className="trash-action"
                        onClick={() => removeContact(contact.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {filteredSelectedContacts.length === 0 && (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Nenhum participante selecionado.
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </Modal>
      <Modal
        open={open && step === "details"}
        onClose={() => setStep("selection")}
        title="Detalhes do Grupo"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setStep("selection")} disabled={busy}>
              Voltar
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
              {busy ? "Criando..." : "Criar Grupo"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3">
            <Avatar name={name || "Grupo"} src={imageDataUrl ?? undefined} size={112} />
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => imageInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Escolher foto
            </Button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                void readGroupImageDataUrl(file)
                  .then(setImageDataUrl)
                  .catch((error) => toast.error((error as Error).message));
              }}
            />
          </div>
          <Field label="Descrição">
            <Textarea
              rows={6}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Escreva uma descrição para o grupo"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {description.length}/2000
            </p>
          </Field>
        </div>
      </Modal>
    </>
  );
}

function GroupDetailModal({
  group,
  onClose,
  onGroupChange,
  onOpenChat,
}: {
  group: ApiWhatsappGroup | null;
  onClose: () => void;
  onGroupChange: (group: ApiWhatsappGroup) => void;
  onOpenChat: (group: ApiWhatsappGroup) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [availableQuery, setAvailableQuery] = React.useState("");
  const [selectedQuery, setSelectedQuery] = React.useState("");
  const [selectedPage, setSelectedPage] = React.useState(1);
  const [query, setQuery] = React.useState("");
  const [selectedContactIds, setSelectedContactIds] = React.useState<string[]>([]);
  const [addingParticipants, setAddingParticipants] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const viewMode = React.useMemo(() => Boolean(group?.id), [group?.id]);
  const [editingName, setEditingName] = React.useState(false);
  const [editingDescription, setEditingDescription] = React.useState(false);
  const initializedGroupIdRef = React.useRef<string | null>(null);
  const picker = useGroupContactPicker(!!group, availableQuery);

  React.useEffect(() => {
    if (!group) {
      initializedGroupIdRef.current = null;
      return;
    }
    if (initializedGroupIdRef.current === group.id) return;
    initializedGroupIdRef.current = group.id;
    setName(group.name);
    setDescription(group.description ?? "");
    setAvailableQuery("");
    setSelectedQuery("");
    setBusy(null);
    setEditingName(false);
    setEditingDescription(false);
  }, [group]);

  const activeParticipantKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const participant of group?.participants ?? []) {
      if (!participant.active) continue;
      for (const value of [participant.phone, participant.externalParticipantId]) {
        const digits = onlyDigits(value ?? "");
        if (digits) keys.add(digits);
      }
    }
    return keys;
  }, [group]);

  const availableContacts = React.useMemo(() => {
    const q = availableQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return picker.items.filter((contact) => {
      const contactDigits = onlyDigits(contact.normalizedPhone || contact.telefone);
      if (activeParticipantKeys.has(contactDigits)) return false;
      if (!q) return true;
      return (
        contact.nome.toLowerCase().includes(q) ||
        contact.telefone.toLowerCase().includes(q) ||
        (digits.length > 0 && contactDigits.includes(digits))
      );
    });
  }, [activeParticipantKeys, availableQuery, picker.items]);

  const selectedParticipants = React.useMemo(() => {
    const q = selectedQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return (group?.participants ?? []).filter((participant) => {
      if (!participant.active) return false;
      if (!q) return true;
      const phone = participant.phone ?? participant.externalParticipantId;
      return (
        participant.name.toLowerCase().includes(q) ||
        phone.toLowerCase().includes(q) ||
        (digits.length > 0 && onlyDigits(phone).includes(digits))
      );
    });
  }, [group?.participants, selectedQuery]);

  React.useEffect(() => {
    setSelectedPage(1);
  }, [group?.id, selectedQuery]);

  const selectedParticipantsPage = React.useMemo(() => {
    const first = (selectedPage - 1) * GROUP_PICKER_PAGE_SIZE;
    return selectedParticipants.slice(first, first + GROUP_PICKER_PAGE_SIZE);
  }, [selectedPage, selectedParticipants]);

  const run = async (action: string, callback: () => Promise<void>) => {
    setBusy(action);
    try {
      await callback();
    } catch (error) {
      toast.error("Falha ao atualizar grupo", { description: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const saveName = () => {
    if (!group) return;
    if (name.trim().length < 2) return toast.error("Informe o nome do grupo.");
    void run("name", async () => {
      const updated = await groupsApi.updateName(group.id, { name: name.trim() });
      onGroupChange(updated);
      setEditingName(false);
      toast.success("Nome do grupo atualizado");
    });
  };

  const saveDescription = () => {
    if (!group) return;
    void run("description", async () => {
      const updated = await groupsApi.updateDescription(group.id, {
        description: description.trim(),
      });
      onGroupChange(updated);
      setEditingDescription(false);
      toast.success("Descrição do grupo atualizada");
    });
  };

  const cancelNameEdit = () => {
    setName(group?.name ?? "");
    setEditingName(false);
  };

  const cancelDescriptionEdit = () => {
    setDescription(group?.description ?? "");
    setEditingDescription(false);
  };

  const addParticipant = (contactId: string) => {
    if (!group) return;
    void run(`participant:${contactId}`, async () => {
      const updated = await groupsApi.updateParticipants(group.id, {
        action: "add",
        participantContactIds: [contactId],
      });
      onGroupChange(updated);
      toast.success("Participante adicionado");
    });
  };

  const addParticipants = () => {
    if (selectedContactIds.length === 1) addParticipant(selectedContactIds[0]);
  };

  const updateParticipant = (
    participant: ApiWhatsappGroupParticipant,
    action: "remove" | "promote" | "demote",
  ) => {
    if (!group) return;
    const participantIds = [participant.externalParticipantId];
    void run(`${action}:${participant.id}`, async () => {
      const updated =
        action === "remove"
          ? await groupsApi.updateParticipants(group.id, { action, participantIds })
          : await groupsApi.updateAdmins(group.id, { action, participantIds });
      onGroupChange(updated);
      toast.success("Participante atualizado");
    });
  };

  const removeAllParticipants = () => {
    if (!group) return;
    const participantIds = group.participants
      .filter((participant) => !participant.isSuperAdmin)
      .map((participant) => participant.externalParticipantId);
    if (!participantIds.length) return;
    void run("remove-all", async () => {
      const updated = await groupsApi.updateParticipants(group.id, {
        action: "remove",
        participantIds,
      });
      onGroupChange(updated);
      toast.success("Participantes removidos");
    });
  };

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      title="Editar Grupo"
      size="xl"
      footer={
        group ? (
          <div className="flex w-full items-center justify-between gap-2 sm:gap-3">
            <EntityFormLog createdAt={group.createdAt} updatedAt={group.updatedAt} />
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={!!busy}>
                Cancelar
              </Button>
              <Button variant="primary" size="sm" onClick={() => onOpenChat(group)}>
                <MessageSquareMore className="h-3.5 w-3.5" /> Abrir conversa
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {group && (
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <div className="min-w-0 space-y-3 sm:space-y-4">
            <div className="min-w-0 space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[8.25rem_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-4">
                <Avatar
                  name={group.name}
                  src={group.imageUrl ?? undefined}
                  size={132}
                  className="!h-24 !w-24 !text-4xl justify-self-center sm:!h-[132px] sm:!w-[132px] sm:!text-[50px] sm:row-span-2 sm:self-center"
                />
                <span
                  className="inline-flex h-8 max-w-full justify-self-center items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-xs font-medium text-foreground sm:hidden"
                  title={`Instância: ${group.connection?.name ?? "-"}`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: group.connection?.color ?? "#22c55e" }}
                  />
                  <span className="truncate">{group.connection?.name ?? "-"}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <div className="relative min-w-0 flex-1">
                      {editingName ? (
                        <>
                          <Input
                            autoFocus
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            disabled={busy === "name"}
                            className="min-h-9 pr-9"
                            placeholder="Nome do grupo"
                          />
                          <button
                            type="button"
                            onClick={cancelNameEdit}
                            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Cancelar edição do nome"
                            title="Cancelar edição"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <p className="min-h-9 truncate py-2 text-sm font-medium text-foreground">
                          {name || "Sem nome"}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={editingName ? "Salvar nome" : "Editar nome"}
                      aria-label={editingName ? "Salvar nome" : "Editar nome"}
                      onClick={editingName ? saveName : () => setEditingName(true)}
                      disabled={busy === "name"}
                      className="h-9 w-9"
                    >
                      {editingName ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </Button>
                    <span
                      className="hidden h-9 max-w-44 shrink-0 items-center gap-1 rounded-full border border-border bg-surface-2 px-3 text-sm font-medium text-foreground sm:inline-flex"
                      title={`Instância: ${group.connection?.name ?? "-"}`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: group.connection?.color ?? "#22c55e" }}
                      />
                      <span className="truncate">{group.connection?.name ?? "-"}</span>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    {num(group.participantsCount)} participante(s)
                  </p>
                </div>

                <Field label="Descrição">
                  <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                    <div className="relative min-w-0">
                      {editingDescription ? (
                        <>
                          <Textarea
                            autoFocus
                            rows={3}
                            maxLength={2000}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            disabled={busy === "description"}
                            className="min-h-16 pr-9 sm:min-h-20"
                          />
                          <button
                            type="button"
                            onClick={cancelDescriptionEdit}
                            className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Cancelar edição da descrição"
                            title="Cancelar edição"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <p className="min-h-14 break-words whitespace-pre-wrap py-1.5 text-sm text-foreground sm:min-h-20 sm:py-2">
                          {description || "Sem descrição"}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={editingDescription ? "Salvar descrição" : "Editar descrição"}
                      aria-label={editingDescription ? "Salvar descrição" : "Editar descrição"}
                      onClick={
                        editingDescription ? saveDescription : () => setEditingDescription(true)
                      }
                      disabled={busy === "description"}
                      className="h-9 w-9 self-center sm:h-10 sm:w-10"
                    >
                      {editingDescription ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </Field>
              </div>
              {!viewMode && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Participantes</h3>
                    {!viewMode && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (addingParticipants && selectedContactIds.length > 0) {
                            addParticipants();
                            return;
                          }
                          setAddingParticipants((current) => !current);
                        }}
                        disabled={busy === "participants"}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {addingParticipants && selectedContactIds.length > 0
                          ? `Adicionar (${selectedContactIds.length})`
                          : "Adicionar"}
                      </Button>
                    )}
                  </div>

                  {addingParticipants && (
                    <div className="mb-3 rounded-lg border border-border bg-surface-1 p-3">
                      <SearchInput
                        value={query}
                        onChange={setQuery}
                        placeholder="Buscar contato ou WhatsApp..."
                      />
                      <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-border bg-card p-1">
                        {availableContacts.map((contact) => {
                          const active = selectedContactIds.includes(contact.id);
                          return (
                            <button
                              key={contact.id}
                              type="button"
                              onClick={() =>
                                setSelectedContactIds((current) =>
                                  active
                                    ? current.filter((item) => item !== contact.id)
                                    : [...current, contact.id],
                                )
                              }
                              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition hover:bg-surface-2"
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  active ? "border-primary bg-primary text-white" : "border-border"
                                }`}
                              >
                                {active && <Check className="h-3 w-3" />}
                              </span>
                              <Avatar
                                name={contact.nome}
                                src={contact.avatar_url ?? undefined}
                                size={28}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{contact.nome}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {contact.telefone}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                        {availableContacts.length === 0 && (
                          <div className="px-3 py-5 text-center text-sm text-muted-foreground">
                            Nenhum contato disponível.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="max-h-[22rem] overflow-y-auto rounded-lg border border-border">
                    {group.participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-1"
                      >
                        <Avatar name={participant.name} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{participant.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatParticipantPhone(
                              participant.phone ?? participant.externalParticipantId,
                            )}
                          </p>
                        </div>
                        {(participant.isAdmin || participant.isSuperAdmin) && (
                          <Badge tone="success">
                            <ShieldCheck className="h-3 w-3" />
                            {participant.isSuperAdmin ? "Criador" : "Admin"}
                          </Badge>
                        )}
                        {!viewMode && (
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={participant.isAdmin ? "Remover admin" : "Tornar admin"}
                              aria-label={participant.isAdmin ? "Remover admin" : "Tornar admin"}
                              onClick={() =>
                                updateParticipant(
                                  participant,
                                  participant.isAdmin ? "demote" : "promote",
                                )
                              }
                              disabled={!!busy || participant.isSuperAdmin}
                              className={`h-8 w-8 ${
                                participant.isAdmin
                                  ? "hover:text-destructive"
                                  : "hover:text-success"
                              }`}
                            >
                              <Crown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Remover participante"
                              aria-label="Remover participante"
                              onClick={() => updateParticipant(participant, "remove")}
                              disabled={!!busy || participant.isSuperAdmin}
                              className="h-8 w-8"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {group.participants.length === 0 && (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        Nenhum participante identificado ainda.
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <section className="order-2 min-w-0 rounded-xl border border-border p-2.5 sm:p-4 lg:order-1">
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-base font-semibold sm:text-lg">Contatos disponíveis</h3>
                    <Badge tone="default">{num(picker.total)}</Badge>
                  </div>
                  <SearchInput
                    value={availableQuery}
                    onChange={setAvailableQuery}
                    placeholder="Buscar contato ou WhatsApp..."
                  />
                  <div className="mt-2 max-h-56 divide-y divide-border overflow-y-auto sm:mt-3 sm:max-h-80">
                    {availableContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-2 py-2 text-xs sm:gap-3 sm:py-2.5 sm:text-sm"
                      >
                        <Avatar
                          name={contact.nome}
                          src={contact.avatar_url ?? undefined}
                          size={40}
                          className="!h-8 !w-8 !text-xs sm:!h-10 sm:!w-10 sm:!text-[15px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{contact.nome}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {contact.telefone}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => addParticipant(contact.id)}
                          disabled={!!busy}
                          title={`Adicionar ${contact.nome}`}
                          aria-label={`Adicionar ${contact.nome}`}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {availableContacts.length === 0 && (
                      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Nenhum contato disponível.
                      </p>
                    )}
                  </div>
                  <ContactPickerPager
                    page={picker.page}
                    total={picker.total}
                    onPageChange={picker.setPage}
                  />
                </section>
                <section className="order-1 min-w-0 rounded-xl border border-border p-2.5 sm:p-4 lg:order-2">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold sm:text-lg">Contatos selecionados</h3>
                      <Badge tone="default">{num(group.participantsCount)}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="trash-action h-7 min-h-7 px-2 text-[11px] sm:h-auto sm:min-h-8 sm:px-2.5 sm:text-xs"
                      disabled={
                        !group.participants.some((participant) => !participant.isSuperAdmin) ||
                        !!busy
                      }
                      onClick={removeAllParticipants}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remover todos
                    </Button>
                  </div>
                  <SearchInput
                    value={selectedQuery}
                    onChange={setSelectedQuery}
                    placeholder="Buscar nos selecionados..."
                  />
                  <div className="mt-2 max-h-56 divide-y divide-border overflow-y-auto sm:mt-3 sm:max-h-80">
                    {selectedParticipantsPage.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center gap-2 py-2 text-xs sm:gap-3 sm:py-2.5 sm:text-sm"
                      >
                        <Avatar
                          name={participant.name}
                          size={40}
                          className="!h-8 !w-8 !text-xs sm:!h-10 sm:!w-10 sm:!text-[15px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{participant.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {formatParticipantPhone(
                              participant.phone ?? participant.externalParticipantId,
                            )}
                          </span>
                        </span>
                        {(participant.isAdmin || participant.isSuperAdmin) && (
                          <Badge tone={participant.isSuperAdmin ? "brand" : "success"}>
                            <ShieldCheck className="h-3 w-3" />
                            {participant.isSuperAdmin ? "Criador" : "Admin"}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title={participant.isAdmin ? "Rebaixar de admin" : "Promover a admin"}
                          aria-label={
                            participant.isAdmin ? "Rebaixar de admin" : "Promover a admin"
                          }
                          onClick={() =>
                            updateParticipant(
                              participant,
                              participant.isAdmin ? "demote" : "promote",
                            )
                          }
                          disabled={!!busy || participant.isSuperAdmin}
                          className={`h-8 w-8 sm:h-9 sm:w-9 ${
                            participant.isAdmin ? "hover:text-destructive" : "hover:text-success"
                          }`}
                        >
                          <Crown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remover participante"
                          aria-label="Remover participante"
                          className="trash-action h-8 w-8 sm:h-9 sm:w-9"
                          onClick={() => updateParticipant(participant, "remove")}
                          disabled={!!busy || participant.isSuperAdmin}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {selectedParticipants.length === 0 && (
                      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Nenhum participante selecionado.
                      </p>
                    )}
                  </div>
                  <ContactPickerPager
                    page={selectedPage}
                    total={selectedParticipants.length}
                    onPageChange={setSelectedPage}
                  />
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function GroupModalTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`border-b px-3 py-3 text-left transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EntityFormLog({
  createdAt,
  updatedAt,
}: {
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
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

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }).replace(",", "");
}

function formatParticipantPhone(value?: string | null) {
  if (!value) return "-";
  const digits = onlyDigits(value.split("@")[0] ?? value);
  if (!digits) return value;
  if (digits.startsWith("55")) {
    const local = normalizeBrazilMobileDigits(digits.slice(2));
    if (local.length === 11) {
      return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    }
  }
  return `+${digits}`;
}

function normalizeBrazilMobileDigits(digits: string) {
  if (digits.length === 10) return `${digits.slice(0, 2)}9${digits.slice(2)}`;
  return digits;
}

function readGroupImageDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i)) {
      reject(new Error("Selecione uma imagem PNG, JPEG ou WebP."));
      return;
    }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const maxSize = 512;
      const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!context) {
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    image.src = url;
  });
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
