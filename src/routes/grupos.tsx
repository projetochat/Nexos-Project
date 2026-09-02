import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquareMore,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Modal, useDisclosure } from "@/components/modal";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SearchInput,
  SectionHeader,
  Select,
} from "@/components/ui-kit";
import {
  crmApi,
  groupsApi,
  type ApiContact,
  type ApiContactInstanceOption,
  type ApiWhatsappGroup,
} from "@/lib/nexos-api";

export const Route = createFileRoute("/grupos")({ component: GroupsPage });

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;

function GroupsPage() {
  const navigate = useNavigate();
  const create = useDisclosure();
  const [groups, setGroups] = React.useState<ApiWhatsappGroup[]>([]);
  const [instances, setInstances] = React.useState<ApiContactInstanceOption[]>([]);
  const [contacts, setContacts] = React.useState<ApiContact[]>([]);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [selectedGroup, setSelectedGroup] = React.useState<ApiWhatsappGroup | null>(null);
  const initialReloadScheduledRef = React.useRef(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [groupResponse, options, contactResponse] = await Promise.all([
        groupsApi.list({ q: query, page, pageSize }),
        crmApi.contactOptions(),
        crmApi.listContacts({ pageSize: 1000 }),
      ]);
      setGroups(groupResponse.items);
      setTotal(groupResponse.total);
      setTotalPages(groupResponse.totalPages);
      setInstances(
        options.instances.filter((instance) => instance.status?.toUpperCase() === "CONNECTED"),
      );
      setContacts(contactResponse.items);
    } catch (error) {
      toast.error("Falha ao carregar grupos", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query]);

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
  }, [query, pageSize]);

  const pageSafe = Math.min(page, totalPages);
  const syncGroups = async () => {
    setSyncing(true);
    try {
      const result = await groupsApi.sync();
      toast.success("Grupos atualizados", {
        description: `${result.synced} grupo(s) sincronizado(s).`,
      });
      await load();
    } catch (error) {
      toast.error("Falha ao atualizar grupos", { description: (error as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell>
      <PageContainer className="max-w-[96rem] lg:px-8 xl:px-10 2xl:px-12">
        <SectionHeader
          title="Gerenciar Grupos"
          subtitle={`${total} grupos de WhatsApp conectados.`}
          actions={
            <Button variant="primary" size="sm" onClick={create.show}>
              <Plus className="h-3.5 w-3.5" /> Criar Grupo
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <Field label="Busca">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar por grupo, participante ou WhatsApp..."
              />
            </Field>
            <Button variant="secondary" size="md" onClick={() => void load()}>
              <Search className="h-4 w-4" /> Buscar
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => void syncGroups()}
              disabled={syncing}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </Card>

        <Card padding={false} className="overflow-hidden">
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  onOpenChat={() =>
                    navigate({
                      to: "/inbox/$conversationId",
                      params: { conversationId: group.conversationId },
                    })
                  }
                  onDetail={() => setSelectedGroup(group)}
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
                Mostrando {groups.length} de {total}
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
          contacts={contacts}
          onSubmit={async (data) => {
            await groupsApi.create(data);
            toast.success("Grupo criado");
            create.hide();
            await load();
          }}
        />
        <GroupDetailModal
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          onOpenChat={(group) =>
            navigate({
              to: "/inbox/$conversationId",
              params: { conversationId: group.conversationId },
            })
          }
        />
      </PageContainer>
    </AppShell>
  );
}

function GroupCard({
  group,
  onOpenChat,
  onDetail,
}: {
  group: ApiWhatsappGroup;
  onOpenChat: () => void;
  onDetail: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onDetail}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onDetail();
      }}
      className="flex min-h-40 flex-col rounded-lg border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <Avatar name={group.name} src={group.imageUrl ?? undefined} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {group.participantsCount} participante(s)
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          title="Abrir conversa"
          onClick={(event) => {
            event.stopPropagation();
            onOpenChat();
          }}
        >
          <MessageSquareMore className="h-4 w-4" />
        </Button>
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
        {group.lastMessagePreview && (
          <p className="line-clamp-2 italic">{group.lastMessagePreview}</p>
        )}
      </div>
    </div>
  );
}

function CreateGroupModal({
  open,
  onClose,
  instances,
  contacts,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  instances: ApiContactInstanceOption[];
  contacts: ApiContact[];
  onSubmit: (data: {
    name: string;
    connectionId: string;
    participantContactIds: string[];
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [connectionId, setConnectionId] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setConnectionId(instances[0]?.id ?? "");
    setSelectedIds([]);
    setQuery("");
    setBusy(false);
  }, [instances, open]);

  const filteredContacts = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    const digits = q.replace(/\D/g, "");
    return contacts.filter(
      (contact) =>
        contact.nome.toLowerCase().includes(q) ||
        contact.telefone.toLowerCase().includes(q) ||
        (digits && contact.normalizedPhone.includes(digits)),
    );
  }, [contacts, query]);

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("Informe o nome do grupo.");
    if (!connectionId) return toast.error("Selecione uma instância.");
    if (!selectedIds.length) return toast.error("Selecione ao menos um participante.");
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), connectionId, participantContactIds: selectedIds });
    } catch (error) {
      toast.error("Falha ao criar grupo", { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Criar Grupo"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
            {busy ? "Criando..." : "Criar Grupo"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome do grupo *">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Instância *">
            <Select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
              {instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Participantes *">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar contato ou WhatsApp..."
          />
        </Field>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border p-1">
          {filteredContacts.map((contact) => {
            const active = selectedIds.includes(contact.id);
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => toggle(contact.id)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-1"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    active ? "border-primary bg-primary text-white" : "border-border"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <Avatar name={contact.nome} src={contact.avatar_url ?? undefined} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{contact.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {contact.telefone}
                  </span>
                </span>
              </button>
            );
          })}
          {filteredContacts.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nenhum contato encontrado.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function GroupDetailModal({
  group,
  onClose,
  onOpenChat,
}: {
  group: ApiWhatsappGroup | null;
  onClose: () => void;
  onOpenChat: (group: ApiWhatsappGroup) => void;
}) {
  return (
    <Modal
      open={!!group}
      onClose={onClose}
      title="Detalhes do Grupo"
      size="lg"
      footer={
        group ? (
          <Button variant="primary" size="sm" onClick={() => onOpenChat(group)}>
            <MessageSquareMore className="h-3.5 w-3.5" /> Abrir conversa
          </Button>
        ) : null
      }
    >
      {group && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={group.name} src={group.imageUrl ?? undefined} size={64} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{group.name}</p>
              <p className="text-sm text-muted-foreground">
                {group.participantsCount} participante(s) cadastrados
              </p>
              <p className="text-xs text-muted-foreground">
                Criado em {formatDate(group.createdAt)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-border bg-surface-1 p-3 text-sm md:grid-cols-2">
            <InfoLine label="ID WhatsApp" value={group.externalChatId ?? "-"} />
            <InfoLine label="Instância" value={group.connection?.name ?? "-"} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Participantes</h3>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              {group.participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
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
                      {participant.isSuperAdmin ? "Super admin" : "Admin"}
                    </Badge>
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
        </div>
      )}
    </Modal>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm text-foreground">{value}</p>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
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

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
