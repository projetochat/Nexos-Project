import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Instagram,
  MessageCircle,
  Pencil,
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Badge, Button, Card, Field, Input, SectionHeader, Textarea } from "@/components/ui-kit";
import { Modal, useDisclosure } from "@/components/modal";
import { connectionRemoveErrorMessage } from "@/lib/connection-remove-errors";
import { maskBrazilPhone } from "@/lib/input-masks";
import { connectionsApi, type ApiMessagingConnection } from "@/lib/nexos-api";

export const Route = createFileRoute("/instancias")({ component: Page });

const STATUS_TONE: Record<
  ApiMessagingConnection["status"],
  "success" | "warning" | "destructive" | "default"
> = {
  connected: "success",
  connecting: "warning",
  error: "destructive",
  disconnected: "default",
  removed: "default",
};

function Page() {
  const qc = useQueryClient();
  const novo = useDisclosure();
  const [qr, setQr] = React.useState<{
    connectionId: string;
    name: string;
    value: string | null;
    status?: string;
  } | null>(null);
  const [removing, setRemoving] = React.useState<ApiMessagingConnection | null>(null);
  const [editing, setEditing] = React.useState<ApiMessagingConnection | null>(null);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["nexos", "messaging-connections"],
    queryFn: connectionsApi.list,
    refetchInterval: 15_000,
  });
  const visibleItems = items.filter((item) => item.status !== "removed");

  React.useEffect(() => {
    if (!qr) return;
    const current = items.find((item) => item.id === qr.connectionId);
    if (current?.status === "connected") {
      setQr(null);
      toast.success(`${current.name} conectada`);
    }
  }, [items, qr]);

  const create = useMutation({
    mutationFn: connectionsApi.createEvolution,
    onSuccess: (connection) => {
      qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] });
      if (connection.status === "connected") {
        setQr(null);
        toast.success(`${connection.name} conectada`);
      } else if (connection.qrCodeBase64) {
        setQr({
          connectionId: connection.id,
          name: connection.name,
          value: connection.qrCodeBase64,
          status: connection.status,
        });
        toast.success("Conexao criada. Leia o QR Code para concluir.");
      } else {
        toast.success("Conexao criada");
      }
      novo.hide();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const refresh = useMutation({
    mutationFn: connectionsApi.status,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  const update = useMutation({
    mutationFn: ({
      connection,
      data,
    }: {
      connection: ApiMessagingConnection;
      data: ConnectionSettingsFormData;
    }) => connectionsApi.update(connection.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] });
      setEditing(null);
      toast.success("Instancia atualizada");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const qrCode = useMutation({
    mutationFn: async (connection: ApiMessagingConnection) => ({
      connection,
      result: await connectionsApi.qr(connection.id),
    }),
    onSuccess: ({ connection, result }) => {
      if (result.status.toLowerCase() === "connected") {
        setQr(null);
        toast.success(`${connection.name} conectada`);
      } else {
        setQr({
          connectionId: connection.id,
          name: connection.name,
          value: result.qrCodeBase64,
          status: result.status,
        });
      }
      qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const logout = useMutation({
    mutationFn: connectionsApi.logout,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] });
      toast.success("Conexao desconectada");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (connection: ApiMessagingConnection) => connectionsApi.remove(connection.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] });
      setRemoving(null);
      toast.success("Conexao removida");
    },
    onError: (e) => toast.error(connectionRemoveErrorMessage(e)),
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Instancias"
          subtitle={`${visibleItems.length} instancias cadastradas.`}
          actions={
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Nova instancia
            </Button>
          }
        />

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>
        ) : visibleItems.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            Nenhuma instancia cadastrada.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((connection) => {
              const ProviderIcon = providerIcon(connection.providerType);
              return (
                <Card key={connection.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ background: providerColor(connection.providerType) }}
                      >
                        <ProviderIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{connection.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                          {providerLabel(connection.providerType)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {connection.ownerPhone ? maskBrazilPhone(connection.ownerPhone) : "Sem numero"}
                        </p>
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[connection.status]}>
                      {statusIcon(connection.status)}
                      {statusLabel(connection.status)}
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Provedor</span>
                      <span>{providerLabel(connection.providerType)}</span>
                    </div>
                    {connection.ownerPhone && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">WhatsApp</span>
                        <span>{maskBrazilPhone(connection.ownerPhone)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Referencia</span>
                      <span className="truncate text-right">
                        {connection.externalReference ?? "sem referencia externa"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Criada em</span>
                      <span>{new Date(connection.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                    {connection.provider?.reason && (
                      <div className="flex justify-between gap-3 text-destructive">
                        <span>Diagnostico</span>
                        <span className="text-right">
                          {diagnosticLabel(connection.provider.reason)}
                        </span>
                      </div>
                    )}
                    {connection.provider?.webhookUrl && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Webhook</span>
                        <span className="truncate text-right">
                          {connection.provider.webhookUrl}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => qrCode.mutate(connection)}
                      disabled={
                        connection.providerType !== "evolution" || connection.status === "connected"
                      }
                    >
                      {connection.status === "connected" ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Conectada
                        </>
                      ) : (
                        <>
                          <QrCode className="h-3.5 w-3.5" /> QR
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refresh.mutate(connection.id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Status
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => logout.mutate(connection.id)}
                      disabled={connection.providerType !== "evolution"}
                    >
                      <WifiOff className="h-3.5 w-3.5" /> Desconectar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(connection)}
                      disabled={connection.status === "removed"}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoving(connection)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remover
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <ConnectionForm
          open={novo.open}
          busy={create.isPending}
          onClose={novo.hide}
          onSubmit={(data) => create.mutate(data)}
        />
        <ConnectionSettingsModal
          connection={editing}
          busy={update.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(connection, data) => update.mutate({ connection, data })}
        />
        <QrModal qr={qr} onClose={() => setQr(null)} />
        <RemoveConnectionModal
          connection={removing}
          busy={remove.isPending}
          onClose={() => setRemoving(null)}
          onConfirm={(connection) => remove.mutate(connection)}
        />
      </PageContainer>
    </AppShell>
  );
}

function diagnosticLabel(reason: string) {
  const labels: Record<string, string> = {
    INSTANCE_NOT_FOUND: "Instance nao encontrada na Evolution",
  };
  return labels[reason] ?? reason;
}

function ConnectionForm({
  open,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string }) => void;
  busy: boolean;
}) {
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (!open) {
      setName("");
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova instancia WhatsApp"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSubmit({ name })}
            disabled={busy || name.trim().length < 2}
          >
            Criar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Suporte WhatsApp"
          />
        </Field>
      </div>
    </Modal>
  );
}

type ConnectionSettingsFormData = {
  name: string;
  color: string | null;
  welcomeEnabled: boolean;
  welcomeNewMessage: string | null;
  welcomeExistingMessage: string | null;
  notes: string | null;
};

function ConnectionSettingsModal({
  connection,
  busy,
  onClose,
  onSubmit,
}: {
  connection: ApiMessagingConnection | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (connection: ApiMessagingConnection, data: ConnectionSettingsFormData) => void;
}) {
  const [form, setForm] = React.useState<ConnectionSettingsFormData>({
    name: "",
    color: "#22c55e",
    welcomeEnabled: false,
    welcomeNewMessage: "",
    welcomeExistingMessage: "",
    notes: "",
  });

  React.useEffect(() => {
    if (!connection) return;
    setForm({
      name: connection.name,
      color: connection.color || "#22c55e",
      welcomeEnabled: connection.welcomeEnabled ?? false,
      welcomeNewMessage:
        connection.welcomeNewMessage ||
        "Ola! Seja bem-vindo(a). Poderia informar seu nome para iniciarmos o atendimento?",
      welcomeExistingMessage: connection.welcomeExistingMessage || "Ola {{nome}},\nTudo bem?",
      notes: connection.notes || "",
    });
  }, [connection]);

  const save = () => {
    if (!connection || form.name.trim().length < 2) return;
    onSubmit(connection, {
      ...form,
      name: form.name.trim(),
      color: form.color || "#22c55e",
      welcomeNewMessage: form.welcomeNewMessage?.trim() || null,
      welcomeExistingMessage: form.welcomeExistingMessage?.trim() || null,
      notes: form.notes?.trim() || null,
    });
  };

  return (
    <Modal
      open={!!connection}
      onClose={onClose}
      title="Editar instancia"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={busy || form.name.trim().length < 2}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome *">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Telefone">
          <Input value={connection?.ownerPhone ? maskBrazilPhone(connection.ownerPhone) : ""} readOnly />
        </Field>
        <Field label="Provedor">
          <Input value="Evolution API" readOnly />
        </Field>
        <Field label="Referencia">
          <Input value={connection?.externalReference ?? "sem referencia externa"} readOnly />
        </Field>
        <Field label="Status">
          <Input value={connection ? statusLabel(connection.status) : ""} readOnly />
        </Field>
        <Field label="Cor">
          <div className="flex gap-2">
            <Input
              type="color"
              value={form.color || "#22c55e"}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
              className="h-10 w-14 p-1"
            />
            <Input
              value={form.color || ""}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
            />
          </div>
        </Field>
        <div className="rounded-lg border border-border bg-surface-1 p-3 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Variaveis disponiveis
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {["{{nome}}", "{{telefone}}", "{{email}}", "{{departamento}}", "{{cliente}}", "{{instancia}}"].map(
              (token) => (
                <button
                  key={token}
                  type="button"
                  className="rounded-md border border-border bg-card px-2 py-1 font-mono"
                  onClick={() =>
                    navigator.clipboard.writeText(token).catch(() => undefined)
                  }
                >
                  {token}
                </button>
              ),
            )}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.welcomeEnabled}
            onChange={(event) => setForm({ ...form, welcomeEnabled: event.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Mensagens de primeiro contato ativas
        </label>
        <div className="md:col-span-2">
          <Field label="Mensagem para novo contato">
            <Textarea
              rows={3}
              value={form.welcomeNewMessage ?? ""}
              onChange={(event) => setForm({ ...form, welcomeNewMessage: event.target.value })}
              disabled={!form.welcomeEnabled}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Mensagem para contato existente">
            <Textarea
              rows={3}
              value={form.welcomeExistingMessage ?? ""}
              onChange={(event) =>
                setForm({ ...form, welcomeExistingMessage: event.target.value })
              }
              disabled={!form.welcomeEnabled}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Notas">
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function QrModal({
  qr,
  onClose,
}: {
  qr: { connectionId: string; name: string; value: string | null; status?: string } | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!qr} onClose={onClose} title={qr ? `QR - ${qr.name}` : "QR"}>
      {qr?.value ? (
        <div className="flex justify-center p-4">
          <img
            src={qr.value}
            alt="QR Code WhatsApp"
            className="h-72 w-72 rounded-md border border-border"
          />
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">
          QR indisponivel. Atualize o status ou tente conectar novamente.
        </div>
      )}
    </Modal>
  );
}

function RemoveConnectionModal({
  connection,
  busy,
  onClose,
  onConfirm,
}: {
  connection: ApiMessagingConnection | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (connection: ApiMessagingConnection) => void;
}) {
  const [confirmation, setConfirmation] = React.useState("");
  React.useEffect(() => {
    if (!connection) setConfirmation("");
  }, [connection]);
  const canConfirm = confirmation.trim().toUpperCase() === "REMOVER";
  return (
    <Modal
      open={!!connection}
      onClose={onClose}
      title="Remover conexao"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => connection && onConfirm(connection)}
            disabled={busy || !canConfirm}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{connection?.name}</p>
          <p className="mt-1">
            A conexao sera indisponibilizada para novos envios e campanhas. O historico de
            conversas, mensagens e campanhas sera preservado.
          </p>
        </div>
        <Field label='Digite "REMOVER" para confirmar'>
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="REMOVER"
          />
        </Field>
      </div>
    </Modal>
  );
}

function statusIcon(status: ApiMessagingConnection["status"]) {
  if (status === "connected") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "connecting") return <QrCode className="h-3 w-3" />;
  if (status === "error") return <AlertTriangle className="h-3 w-3" />;
  if (status === "removed") return <Trash2 className="h-3 w-3" />;
  return <Plug className="h-3 w-3" />;
}

function statusLabel(status: ApiMessagingConnection["status"]) {
  const labels = {
    connected: "Conectada",
    connecting: "Conectando",
    disconnected: "Desconectada",
    error: "Erro",
    removed: "Removida",
  } as const;
  return labels[status];
}

function providerLabel(provider: ApiMessagingConnection["providerType"]) {
  const labels = {
    development: "Development",
    evolution: "WhatsApp",
    meta_cloud: "Meta Cloud API",
  } as const;
  return labels[provider];
}

function providerIcon(provider: ApiMessagingConnection["providerType"]) {
  if (provider === "meta_cloud") return Instagram;
  return MessageCircle;
}

function providerColor(provider: ApiMessagingConnection["providerType"]) {
  if (provider === "meta_cloud") return "#e11d48";
  if (provider === "development") return "#f59e0b";
  return "#22c55e";
}
