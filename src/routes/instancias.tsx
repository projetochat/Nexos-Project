import * as React from "react";
import { createPortal } from "react-dom";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  Eye,
  Infinity as InfinityIcon,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
import { connectionRemoveErrorMessage } from "@/lib/connection-remove-errors";
import { num } from "@/lib/format";
import { maskBrazilPhone } from "@/lib/input-masks";
import {
  connectionsApi,
  crmApi,
  type ApiContactCustomField,
  type ApiMessagingConnection,
} from "@/lib/nexos-api";

export const Route = createFileRoute("/instancias")({ component: Page });

const STATUS_TONE: Record<
  ApiMessagingConnection["status"],
  "success" | "warning" | "destructive" | "default"
> = {
  connected: "success",
  connecting: "warning",
  error: "destructive",
  disconnected: "destructive",
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
  const [disconnecting, setDisconnecting] = React.useState<ApiMessagingConnection | null>(null);
  const [editing, setEditing] = React.useState<ApiMessagingConnection | null>(null);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["nexos", "messaging-connections"],
    queryFn: connectionsApi.list,
    refetchInterval: 15_000,
  });
  const { data: contactCustomFields = [] } = useQuery({
    queryKey: ["nexos", "contact-custom-fields"],
    queryFn: crmApi.listContactCustomFields,
  });
  const visibleItems = items.filter((item) => item.status !== "removed");
  const profileSyncAttempted = React.useRef(new Set<string>());

  React.useEffect(() => {
    const pending = items.filter(
      (item) =>
        item.status === "connected" &&
        !item.logoUrl &&
        !profileSyncAttempted.current.has(item.id),
    );
    if (pending.length === 0) return;
    pending.forEach((item) => profileSyncAttempted.current.add(item.id));
    void Promise.all(
      pending.map((item) =>
        connectionsApi.status(item.id).catch(() => null),
      ),
    ).then((updated) => {
      const byId = new Map(
        updated.filter((item): item is ApiMessagingConnection => item !== null).map((item) => [item.id, item]),
      );
      if (byId.size === 0) return;
      qc.setQueryData<ApiMessagingConnection[]>(["nexos", "messaging-connections"], (current) =>
        current?.map((item) => byId.get(item.id) ?? item),
      );
    });
  }, [items, qc]);

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
        toast.success("Conexão criada. Leia o QR Code para concluir.");
      } else {
        toast.success("Conexão criada");
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

  React.useEffect(() => {
    if (!qr) return;
    let active = true;

    const syncConnectionStatus = async () => {
      try {
        const updated = await connectionsApi.status(qr.connectionId);
        if (!active) return;
        qc.setQueryData<ApiMessagingConnection[]>(["nexos", "messaging-connections"], (current) =>
          current?.map((item) => (item.id === updated.id ? updated : item)),
        );
      } catch {
        // A leitura em segundo plano não deve interromper a leitura do QR Code.
      }
    };

    void syncConnectionStatus();
    const intervalId = window.setInterval(() => void syncConnectionStatus(), 3_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [qc, qr]);
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
      toast.success("Conexão desconectada");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: ({
      connection,
      options,
    }: {
      connection: ApiMessagingConnection;
      options: RemoveConnectionOptions;
    }) => connectionsApi.remove(connection.id, options),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] });
      qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
      qc.invalidateQueries({ queryKey: ["operations", "history"] });
      qc.invalidateQueries({ queryKey: ["nexos", "groups"] });
      setRemoving(null);
      toast.success("Conexão removida");
    },
    onError: (e) => toast.error(connectionRemoveErrorMessage(e)),
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Instâncias"
          subtitle={`${num(visibleItems.length)} instâncias cadastradas.`}
          actions={
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Nova Instância
            </Button>
          }
        />

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>
        ) : visibleItems.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            Nenhuma instância cadastrada.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((connection) => {
              const canDisconnect =
                connection.providerType === "evolution" &&
                (connection.status === "connected" ||
                  Boolean(connection.ownerPhone || connection.ownerPhoneMasked));
              return (
                <Card key={connection.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <InstanceLogo connection={connection} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{connection.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                          {providerLabel(connection.providerType)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {connection.ownerPhone
                            ? maskBrazilPhone(connection.ownerPhone)
                            : "Sem número"}
                        </p>
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[connection.status]}>
                      {statusIcon(connection.status)}
                      {statusLabel(connection.status)}
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Referencia</span>
                      <span className="truncate text-right">
                        {connection.externalReference ?? "sem referencia externa"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Criada em</span>
                      <span>{formatCreatedAt(connection.createdAt)}</span>
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
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {connection.status !== "connected" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => qrCode.mutate(connection)}
                        disabled={connection.providerType !== "evolution"}
                        title="QR"
                        aria-label="QR"
                        className="hover:!bg-foreground hover:!text-background"
                      >
                        <QrCode className="h-3.5 w-3.5" /> QR
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refresh.mutate(connection.id)}
                      title="Status"
                      aria-label="Status"
                      className="group"
                    >
                      <RefreshCw className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-[720deg]" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:!bg-destructive hover:!text-destructive-foreground"
                      onClick={() => setDisconnecting(connection)}
                      disabled={!canDisconnect}
                      title="Desconectar"
                      aria-label="Desconectar"
                    >
                      <Power className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(connection)}
                      disabled={connection.status === "removed"}
                      title="Editar"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="trash-action"
                      onClick={() => setRemoving(connection)}
                      disabled={remove.isPending}
                      title="Remover"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
          contactCustomFields={contactCustomFields}
          busy={update.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(connection, data) => update.mutate({ connection, data })}
        />
        <QrModal qr={qr} onClose={() => setQr(null)} />
        <RemoveConnectionModal
          connection={removing}
          busy={remove.isPending}
          onClose={() => setRemoving(null)}
          onConfirm={(connection, options) => remove.mutate({ connection, options })}
        />
        <ConfirmDialog
          open={!!disconnecting}
          title="Desligar Instância?"
          description={
            <p>
              Deseja desligar a instância{" "}
              <strong className="font-semibold text-foreground">"{disconnecting?.name ?? ""}"</strong>?
              Será necessário conectá-la novamente para enviar e receber mensagens.
            </p>
          }
          confirmLabel="Desligar"
          destructive
          onClose={() => setDisconnecting(null)}
          onConfirm={() => {
            if (disconnecting) logout.mutate(disconnecting.id);
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

function diagnosticLabel(reason: string) {
  const labels: Record<string, string> = {
    INSTANCE_NOT_FOUND: "Instance não encontrada na Evolution",
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
  const [connectionType, setConnectionType] = React.useState<"qr-code">("qr-code");
  const canCreate = name.trim().length > 0;

  React.useEffect(() => {
    if (!open) {
      setName("");
      setConnectionType("qr-code");
    }
  }, [open]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || busy) return;
    onSubmit({ name: name.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova Instância WhatsApp"
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form="new-whatsapp-instance-form"
            disabled={busy || !canCreate}
          >
            Criar
          </Button>
        </>
      }
    >
      <form id="new-whatsapp-instance-form" className="space-y-5" onSubmit={submit}>
        <fieldset>
          <legend className="mb-2.5 text-sm font-semibold">Tipo de conexão</legend>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={connectionType === "qr-code"}
              onClick={() => setConnectionType("qr-code")}
              className="group flex min-h-32 flex-col items-center justify-center rounded-xl border border-border bg-surface-1 p-3 text-center outline-none transition hover:border-emerald-500 hover:bg-emerald-500/10 focus-visible:border-emerald-500 data-[selected=true]:border-emerald-500 data-[selected=true]:bg-emerald-500/10 sm:min-h-36 sm:p-4"
              data-selected={connectionType === "qr-code"}
            >
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-muted-foreground transition group-hover:bg-emerald-500 group-hover:text-white group-data-[selected=true]:bg-emerald-500 group-data-[selected=true]:text-white">
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="text-base font-semibold">QR Code</span>
              <span className="mt-0.5 text-sm text-muted-foreground">Conexão via celular</span>
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="A integração com a API Oficial estará disponível em breve."
              className="flex min-h-32 cursor-not-allowed flex-col items-center justify-center rounded-xl border border-border bg-surface-1 p-3 text-center opacity-50 sm:min-h-36 sm:p-4"
            >
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-muted-foreground">
                <InfinityIcon className="h-7 w-7" aria-hidden="true" />
              </span>
              <span className="text-base font-semibold">API Oficial</span>
              <span className="mt-0.5 text-sm text-muted-foreground">Meta Business</span>
              <span className="text-xs italic text-muted-foreground">(em breve)</span>
            </button>
          </div>
        </fieldset>
        <Field label="Nome *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Digite o nome da instância"
            required
          />
        </Field>
      </form>
    </Modal>
  );
}

type RemoveConnectionOptions = {
  removeConversationHistory: boolean;
};

type ConnectionSettingsFormData = {
  name: string;
  color: string | null;
  welcomeEnabled: boolean;
  welcomeNewMessage: string | null;
  welcomeExistingMessage: string | null;
  absenceEnabled: boolean;
  absenceMessage: string | null;
  notes: string | null;
};

type ConnectionSettingsTab = "general" | "greeting" | "absence";

type ServiceHoursRow = {
  day: string;
  active: boolean;
  start: string;
  end: string;
};

const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "Fuso horário de São Paulo (GMT-3)" },
  { value: "America/Manaus", label: "Fuso horário de Manaus (GMT-4)" },
  { value: "America/Rio_Branco", label: "Fuso horário do Acre (GMT-5)" },
  { value: "America/Fortaleza", label: "Fuso horário de Fortaleza (GMT-3)" },
  { value: "America/Noronha", label: "Fuso horário de Fernando de Noronha (GMT-2)" },
  { value: "UTC", label: "UTC (GMT+0)" },
];

const CONNECTION_MESSAGE_VARIABLES = [
  "{{cumprimento}}",
  "{{nome}}",
  "{{telefone}}",
  "{{email}}",
  "{{departamento}}",
  "{{cliente}}",
  "{{instancia}}",
];

const CONNECTION_MESSAGE_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  "{{cumprimento}}": "Bom dia, Boa tarde e Boa noite. Será apresentado conforme a hora do dia.",
  "{{nome}}": "Nome do contato.",
  "{{telefone}}": "Telefone do contato.",
  "{{email}}": "E-mail do contato.",
  "{{instancia}}": "Instância da conversa.",
  "{{cliente}}": "Cliente do contato.",
  "{{departamento}}": "Departamento do contato.",
};

const NEW_CONTACT_MESSAGE_PLACEHOLDER = `Olá!
Seja bem-vindo(a)

Poderia informar seu nome para iniciarmos o atendimento?`;

const EXISTING_CONTACT_MESSAGE_PLACEHOLDER = `{{cumprimento}} *{{nome}}*!
Tudo bem?

Já identificamos você na nossa base, informe seu problema que logo iremos te atender.`;

const ABSENCE_MESSAGE_PLACEHOLDER = `Olá *{{nome}}*,
Tudo bem?

Estamos fora do horário de atendimento.
Retornaremos assim que possível.

Equipe Nexus`;

const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function defaultServiceHours(): ServiceHoursRow[] {
  return WEEKDAYS.map((day, index) => ({
    day,
    active: index < 5,
    start: "08:00",
    end: "18:00",
  }));
}

function ConnectionSettingsModal({
  connection,
  contactCustomFields,
  busy,
  onClose,
  onSubmit,
}: {
  connection: ApiMessagingConnection | null;
  contactCustomFields: ApiContactCustomField[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (connection: ApiMessagingConnection, data: ConnectionSettingsFormData) => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();
  const logoButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [tab, setTab] = React.useState<ConnectionSettingsTab>("general");
  const [logoMenuOpen, setLogoMenuOpen] = React.useState(false);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [logoPreviewOpen, setLogoPreviewOpen] = React.useState(false);
  const [timezone, setTimezone] = React.useState("America/Sao_Paulo");
  const [aiAgentId, setAiAgentId] = React.useState("");
  const [absenceEnabled, setAbsenceEnabled] = React.useState(false);
  const [absenceActivation, setAbsenceActivation] = React.useState(0);
  const [absenceMessage, setAbsenceMessage] = React.useState("");
  const [serviceHours, setServiceHours] = React.useState<ServiceHoursRow[]>(defaultServiceHours);
  const [showWelcomeValidation, setShowWelcomeValidation] = React.useState(false);
  const [form, setForm] = React.useState<ConnectionSettingsFormData>({
    name: "",
    color: "#22c55e",
    welcomeEnabled: false,
    welcomeNewMessage: "",
    welcomeExistingMessage: "",
    absenceEnabled: false,
    absenceMessage: "",
    notes: "",
  });

  React.useEffect(() => {
    if (!connection) return;
    setTab("general");
    setLogoMenuOpen(false);
    setLogoPreview(connection.logoUrl ?? null);
    setCameraOpen(false);
    setLogoPreviewOpen(false);
    setTimezone("America/Sao_Paulo");
    setAiAgentId("");
    setAbsenceEnabled(connection.absenceEnabled ?? false);
    setAbsenceActivation(0);
    setAbsenceMessage(connection.absenceMessage ?? "");
    setServiceHours(defaultServiceHours());
    setShowWelcomeValidation(false);
    setForm({
      name: connection.name,
      color: connection.color || "#22c55e",
      welcomeEnabled: connection.welcomeEnabled ?? false,
      welcomeNewMessage: connection.welcomeNewMessage ?? "",
      welcomeExistingMessage: connection.welcomeExistingMessage ?? "",
      absenceEnabled: connection.absenceEnabled ?? false,
      absenceMessage: connection.absenceMessage ?? "",
      notes: connection.notes || "",
    });
  }, [connection]);

  const applyConnectionUpdate = (updated: ApiMessagingConnection) => {
    setLogoPreview(updated.logoUrl ?? null);
    qc.setQueryData<ApiMessagingConnection[]>(["nexos", "messaging-connections"], (items) =>
      items?.map((item) => (item.id === updated.id ? updated : item)),
    );
  };

  const updateWhatsAppProfilePicture = async (dataUrl: string) => {
    if (!connection) return;
    const updated = await connectionsApi.updateProfilePicture(connection.id, dataUrl);
    applyConnectionUpdate(updated);
    toast.success("Foto de perfil do WhatsApp atualizada.");
  };

  const handleLogoFile = async (file?: File | null) => {
    if (!file) return;
    try {
      await updateWhatsAppProfilePicture(await readImageAsCompressedDataUrl(file));
      setLogoMenuOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const save = () => {
    if (!connection || form.name.trim().length < 2) return;
    const missingWelcomeNewMessage = form.welcomeEnabled && !form.welcomeNewMessage?.trim();
    const missingWelcomeExistingMessage =
      form.welcomeEnabled && !form.welcomeExistingMessage?.trim();
    if (missingWelcomeNewMessage || missingWelcomeExistingMessage) {
      setTab("greeting");
      setShowWelcomeValidation(true);
      toast.error("Preencha as mensagens de saudação para salvar.");
      return;
    }
    onSubmit(connection, {
      ...form,
      name: form.name.trim(),
      color: completeHexColor(form.color, "#22c55e"),
      welcomeNewMessage: form.welcomeNewMessage?.trim() || null,
      welcomeExistingMessage: form.welcomeExistingMessage?.trim() || null,
      absenceEnabled,
      absenceMessage: absenceMessage.trim() || null,
      notes: form.notes?.trim() || null,
    });
  };

  return (
    <>
      <Modal
        open={!!connection}
        onClose={onClose}
        title="Editar Instância"
        size="xl"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <EntityFormLog createdAt={connection?.createdAt} updatedAt={connection?.updatedAt} />
            <div className="flex shrink-0 justify-end gap-2">
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
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="flex overflow-x-auto border-b border-border text-sm">
            <TabButton active={tab === "general"} onClick={() => setTab("general")}>
              Geral
            </TabButton>
            <TabButton active={tab === "greeting"} onClick={() => setTab("greeting")}>
              Mensagem de Saudação
            </TabButton>
            <TabButton active={tab === "absence"} onClick={() => setTab("absence")}>
              Mensagem de Ausência
            </TabButton>
          </div>

          {tab === "general" && (
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-[170px_minmax(0,1fr)]">
                <div className="relative flex justify-center lg:justify-start">
                  <button
                    ref={logoButtonRef}
                    type="button"
                    className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-1 text-center text-xs font-semibold text-muted-foreground"
                    onClick={() => setLogoMenuOpen((open) => !open)}
                    aria-label="Gerenciar foto de perfil do WhatsApp"
                  >
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Foto de perfil do WhatsApp"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <MessageCircle className="h-10 w-10 text-[#25D366]" aria-label="WhatsApp" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white opacity-0 transition group-hover:opacity-100">
                      <Camera className="h-8 w-8" />
                    </span>
                  </button>
                  <FloatingLogoMenu
                    open={logoMenuOpen}
                    anchorRef={logoButtonRef}
                    onClose={() => setLogoMenuOpen(false)}
                  >
                    <LogoMenuButton
                      icon={<Eye className="h-4 w-4" />}
                      onClick={() => {
                        setLogoMenuOpen(false);
                        if (!logoPreview) {
                          toast.info("Esta instância não possui foto de perfil no WhatsApp.");
                          return;
                        }
                        setLogoPreviewOpen(true);
                      }}
                    >
                      Mostrar foto do WhatsApp
                    </LogoMenuButton>
                    <LogoMenuButton
                      icon={<RefreshCw className="h-4 w-4" />}
                      onClick={async () => {
                        if (!connection) return;
                        try {
                          applyConnectionUpdate(await connectionsApi.refreshProfilePicture(connection.id));
                          toast.success("Foto sincronizada com o perfil do WhatsApp.");
                        } catch (error) {
                          toast.error((error as Error).message);
                        } finally {
                          setLogoMenuOpen(false);
                        }
                      }}
                    >
                      Sincronizar com WhatsApp
                    </LogoMenuButton>
                    <LogoMenuButton
                      icon={<Camera className="h-4 w-4" />}
                      onClick={() => {
                        setLogoMenuOpen(false);
                        setCameraOpen(true);
                      }}
                    >
                      Atualizar foto do WhatsApp
                    </LogoMenuButton>
                    <LogoMenuButton
                      icon={<Upload className="h-4 w-4" />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Escolher foto para o WhatsApp
                    </LogoMenuButton>
                    <div className="my-1 border-t border-border" />
                    <LogoMenuButton
                      className="trash-action"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        if (!connection) return;
                        try {
                          applyConnectionUpdate(await connectionsApi.removeProfilePicture(connection.id));
                          toast.success("Foto removida do perfil do WhatsApp.");
                        } catch (error) {
                          toast.error((error as Error).message);
                        } finally {
                          setLogoMenuOpen(false);
                        }
                      }}
                    >
                      Remover foto do WhatsApp
                    </LogoMenuButton>
                  </FloatingLogoMenu>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void handleLogoFile(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>

                <div className="grid grid-cols-[minmax(7rem,1fr)_10.5rem] gap-4 sm:grid-cols-[minmax(0,1.25fr)_minmax(11rem,0.85fr)] md:grid-cols-2">
                  <Field label="Telefone *">
                    <Input
                      value={connection?.ownerPhone ? maskBrazilPhone(connection.ownerPhone) : ""}
                      readOnly
                    />
                  </Field>
                  <Field label="Status">
                    <div className="flex h-10 items-center">
                      {connection ? (
                        <Badge tone={STATUS_TONE[connection.status]}>
                          {statusIcon(connection.status)}
                          {statusLabel(connection.status)}
                        </Badge>
                      ) : null}
                    </div>
                  </Field>
                  <Field label="Nome *">
                    <Input
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </Field>
                  <Field label="Cor">
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2 py-1.5 transition focus-within:border-primary">
                      <input
                        type="color"
                        value={completeHexColor(form.color, "#22c55e")}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            color: normalizeHexColor(event.target.value, "#22c55e"),
                          })
                        }
                        className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={form.color || ""}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            color: normalizeHexColor(event.target.value, "#22c55e"),
                          })
                        }
                        placeholder={completeHexColor("#22c55e")}
                        maxLength={7}
                        className="min-w-0 flex-1 border-0 bg-transparent font-mono text-xs uppercase outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
                      />
                    </div>
                  </Field>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Provedor">
                  <Select value="evolution" disabled>
                    <option value="evolution">Evolution API</option>
                  </Select>
                </Field>
                <Field label="Referência">
                  <Input
                    value={connection?.externalReference ?? "sem referência externa"}
                    readOnly
                  />
                </Field>
                <Field label="Time Zone">
                  <Select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                    {TIMEZONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Agente de IA"
                  hint="Será preenchido pelos agentes cadastrados no módulo de IA."
                >
                  <Select value={aiAgentId} onChange={(event) => setAiAgentId(event.target.value)}>
                    <option value="">- Selecione um agente -</option>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {tab === "greeting" && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.welcomeEnabled}
                  onChange={(event) => {
                    setForm({ ...form, welcomeEnabled: event.target.checked });
                    setShowWelcomeValidation(false);
                  }}
                  className="h-4 w-4 accent-primary"
                />
                Ativar mensagem de saudação
              </label>
              <Field
                label={
                  form.welcomeEnabled
                    ? "Mensagem para novo contato *"
                    : "Mensagem para novo contato"
                }
                error={
                  showWelcomeValidation && form.welcomeEnabled && !form.welcomeNewMessage?.trim()
                    ? "Preencha a mensagem para novo contato."
                    : undefined
                }
              >
                <div>
                  <Textarea
                    rows={6}
                    value={form.welcomeNewMessage ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, welcomeNewMessage: event.target.value })
                    }
                    disabled={!form.welcomeEnabled}
                    aria-invalid={
                      showWelcomeValidation &&
                      form.welcomeEnabled &&
                      !form.welcomeNewMessage?.trim()
                    }
                    placeholder={NEW_CONTACT_MESSAGE_PLACEHOLDER}
                  />
                </div>
              </Field>
              <Field
                label={
                  form.welcomeEnabled
                    ? "Mensagem para contato existente *"
                    : "Mensagem para contato existente"
                }
                error={
                  showWelcomeValidation &&
                  form.welcomeEnabled &&
                  !form.welcomeExistingMessage?.trim()
                    ? "Preencha a mensagem para contato existente."
                    : undefined
                }
              >
                <div>
                  <Textarea
                    rows={6}
                    value={form.welcomeExistingMessage ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, welcomeExistingMessage: event.target.value })
                    }
                    disabled={!form.welcomeEnabled}
                    aria-invalid={
                      showWelcomeValidation &&
                      form.welcomeEnabled &&
                      !form.welcomeExistingMessage?.trim()
                    }
                    placeholder={EXISTING_CONTACT_MESSAGE_PLACEHOLDER}
                  />
                </div>
              </Field>
            </div>
          )}

          {tab === "absence" && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={absenceEnabled}
                  onChange={(event) => {
                    setAbsenceEnabled(event.target.checked);
                    if (event.target.checked) setAbsenceActivation((current) => current + 1);
                  }}
                  className="h-4 w-4 accent-primary"
                />
                Ativar mensagem de ausência
              </label>
              <Field label="Mensagem de Ausência">
                <div>
                  <Textarea
                    rows={6}
                    value={absenceMessage}
                    onChange={(event) => setAbsenceMessage(event.target.value)}
                    disabled={!absenceEnabled}
                    placeholder={ABSENCE_MESSAGE_PLACEHOLDER}
                  />
                </div>
              </Field>
              <ServiceHoursTable
                rows={serviceHours}
                onChange={setServiceHours}
                enabled={absenceEnabled}
                focusStartSignal={absenceActivation}
              />
            </div>
          )}

        </div>
      </Modal>
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          void updateWhatsAppProfilePicture(dataUrl).catch((error) =>
            toast.error((error as Error).message),
          );
          setCameraOpen(false);
        }}
      />
      <LogoPreviewModal
        open={logoPreviewOpen}
        title={form.name ? `Logo de ${form.name}` : "Logo da Instância"}
        src={logoPreview}
        onClose={() => setLogoPreviewOpen(false)}
      />
    </>
  );
}

function TabButton({
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
      className={`shrink-0 border-b px-3 py-3 text-left transition ${
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

function LogoMenuButton({
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
      className={"flex w-full items-center gap-3 px-4 py-2 text-left text-foreground transition hover:bg-surface-1 " + className}
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </button>
  );
}

function FloatingLogoMenu({
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

function CameraCaptureModal({
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
    const maxSize = 512;
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
      <div className="space-y-3">
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
      </div>
    </Modal>
  );
}

function LogoPreviewModal({
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

function VariableDictionary({ customFields }: { customFields: ApiContactCustomField[] }) {
  const variables = React.useMemo(
    () => mergeMessageVariables(CONNECTION_MESSAGE_VARIABLES, customFields),
    [customFields],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
      <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Variáveis Disponíveis
      </p>
      <div className="divide-y divide-border">
        {variables.map(({ token, description }) => (
          <div
            key={token}
            className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[13rem_minmax(0,1fr)] md:items-center md:gap-3"
          >
            <VariableTokenButton token={token} />
            <span className="min-w-0 text-muted-foreground">{description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyPlaceholderButton({ value }: { value: string }) {
  const copyPlaceholder = () => {
    const copyFallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      toast.success("Mensagem padrão copiada.");
    };

    if (!navigator.clipboard?.writeText) {
      copyFallback();
      return;
    }

    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success("Mensagem padrão copiada."))
      .catch(copyFallback);
  };

  return (
    <div className="flex justify-end">
      <Button type="button" variant="ghost" size="sm" onClick={copyPlaceholder}>
        <Copy className="h-3.5 w-3.5" /> Copiar mensagem padrão
      </Button>
    </div>
  );
}

function VariableTokenButton({ token }: { token: string }) {
  const tokenRef = React.useRef<HTMLSpanElement>(null);

  const selectToken = () => {
    const element = tokenRef.current;
    if (!element) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const copyToken = () => {
    selectToken();
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(token).then(() => toast.success("Variável copiada."));
      return;
    }
    document.execCommand("copy");
    toast.success("Variável copiada.");
  };

  return (
    <button
      type="button"
      className="w-fit max-w-full whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 font-mono transition hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      onClick={selectToken}
      onDoubleClick={copyToken}
      title="Clique para selecionar. Duplo clique para copiar."
      aria-label={`Selecionar variável ${token}`}
    >
      <span ref={tokenRef} className="select-text">
        {token}
      </span>
    </button>
  );
}

function mergeMessageVariables(baseTokens: string[], customFields: ApiContactCustomField[]) {
  const variables = baseTokens.map((token) => ({
    token,
    description: CONNECTION_MESSAGE_VARIABLE_DESCRIPTIONS[token] ?? "Variável disponível.",
  }));
  const knownTokens = new Set(baseTokens);

  customFields.forEach((field) => {
    const token = customFieldVariableToken(field.label);
    if (!token || knownTokens.has(token)) return;
    knownTokens.add(token);
    variables.push({ token, description: `Campo adicional: ${field.label}.` });
  });

  return variables;
}

const VARIABLE_NAME_STOP_WORDS = new Set([
  "de",
  "do",
  "dos",
  "da",
  "das",
  "o",
  "a",
  "os",
  "as",
  "um",
  "uns",
  "uma",
  "umas",
  "e",
  "ou",
]);

function customFieldVariableToken(label: string) {
  const words = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
  const meaningfulWords = words.filter((word) => !VARIABLE_NAME_STOP_WORDS.has(word));
  const key = (meaningfulWords.length ? meaningfulWords : words).join("_");
  return key ? `{{${key}}}` : null;
}

function ServiceHoursTable({
  rows,
  onChange,
  enabled,
  focusStartSignal,
}: {
  rows: ServiceHoursRow[];
  onChange: (rows: ServiceHoursRow[]) => void;
  enabled: boolean;
  focusStartSignal: number;
}) {
  const [editing, setEditing] = React.useState(false);
  const [selectedRow, setSelectedRow] = React.useState<number | null>(null);
  const mondayStartRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!enabled) {
      setEditing(false);
      setSelectedRow(null);
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled || focusStartSignal === 0) return;
    setEditing(true);
    setSelectedRow(0);
    requestAnimationFrame(() => mondayStartRef.current?.focus());
  }, [enabled, focusStartSignal]);

  const updateRow = (index: number, patch: Partial<ServiceHoursRow>) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const copyToAll = (sourceIndex: number) => {
    const source = rows[sourceIndex];
    onChange(
      rows.map((row, index) =>
        index !== sourceIndex && row.active
          ? { ...row, start: source.start, end: source.end }
          : row,
      ),
    );
  };

  const toggleEditing = () => {
    setEditing((current) => !current);
    setSelectedRow(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">Horário de Atendimento</p>
        {enabled && (
          <Button type="button" variant="ghost" size="sm" onClick={toggleEditing}>
            {editing ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Concluir
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </>
            )}
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="bg-surface-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="w-[35%] px-2 py-3 text-left font-semibold sm:w-[29%] sm:px-3">
                <span className="sm:hidden">Dia</span>
                <span className="hidden sm:inline">Dia da semana</span>
              </th>
              <th className="w-[14%] px-1 py-3 text-center font-semibold sm:w-[23%] sm:px-3">
                Ativo
              </th>
              <th className="w-[25%] px-1 py-3 text-center font-semibold sm:w-[19%] sm:px-3">
                Início
              </th>
              <th className="w-[26%] px-1 py-3 text-center font-semibold sm:w-[19%] sm:px-3">
                Fim
              </th>
              <th className="hidden w-[10%] px-1 py-3 sm:table-cell sm:px-3" aria-label="Ações" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => (
              <tr key={row.day} className="transition hover:bg-surface-1/60">
                <td className="px-2 py-2 sm:px-3">{row.day}</td>
                <td className="px-1 py-2 text-center sm:px-3">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(event) => {
                      setSelectedRow(index);
                      updateRow(index, { active: event.target.checked });
                    }}
                    disabled={!editing}
                    className="h-4 w-4 accent-primary"
                    aria-label={`Ativar atendimento em ${row.day}`}
                  />
                </td>
                <td className="px-1 py-2 text-center sm:px-3">
                  <Input
                    ref={index === 0 ? mondayStartRef : undefined}
                    type="text"
                    inputMode="numeric"
                    value={row.start}
                    placeholder="00:00"
                    disabled={!editing || !row.active}
                    onFocus={() => setSelectedRow(index)}
                    onChange={(event) =>
                      updateRow(index, { start: sanitizeServiceHourDraft(event.target.value) })
                    }
                    onBlur={(event) =>
                      updateRow(index, { start: formatServiceHourDraft(event.target.value) })
                    }
                    className="w-full min-w-0 px-1 text-center sm:w-24 sm:px-3"
                  />
                </td>
                <td className="px-1 py-2 text-center sm:px-3">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={row.end}
                    placeholder="00:00"
                    disabled={!editing || !row.active}
                    onFocus={() => setSelectedRow(index)}
                    onChange={(event) =>
                      updateRow(index, { end: sanitizeServiceHourDraft(event.target.value) })
                    }
                    onBlur={(event) =>
                      updateRow(index, { end: formatServiceHourDraft(event.target.value) })
                    }
                    className="w-full min-w-0 px-1 text-center sm:w-24 sm:px-3"
                  />
                </td>
                <td className="hidden px-1 py-2 text-center sm:table-cell sm:px-3">
                  {editing && selectedRow === index && row.active && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToAll(index)}
                      title="Copiar para todos"
                      aria-label="Copiar para todos"
                      className="px-2"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sanitizeServiceHourDraft(value: string) {
  return value.replace(/[^\d:]/g, "").slice(0, 5);
}

function formatServiceHourDraft(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded =
    digits.length <= 2 ? digits.padStart(2, "0").padEnd(4, "0") : digits.padStart(4, "0");
  const hour = Math.min(23, Number(padded.slice(0, 2)));
  const minute = Math.min(59, Number(padded.slice(2, 4)));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
  onConfirm: (connection: ApiMessagingConnection, options: RemoveConnectionOptions) => void;
}) {
  const [confirmation, setConfirmation] = React.useState("");
  const [removeConversationHistory, setRemoveConversationHistory] = React.useState(false);
  React.useEffect(() => {
    if (!connection) {
      setConfirmation("");
      setRemoveConversationHistory(false);
    }
  }, [connection]);
  const canConfirm = confirmation.trim().toUpperCase() === "REMOVER";
  return (
    <Modal
      open={!!connection}
      onClose={onClose}
      title="Remover Instância?"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="trash-action"
            onClick={() => connection && onConfirm(connection, { removeConversationHistory })}
            disabled={busy || !canConfirm}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">
            Instância: <strong className="font-semibold">"{connection?.name}"</strong>
          </p>
          <p className="mt-1">
            A conexão será indisponibilizada para novos envios e campanhas. Se o histórico não for
            removido, as conversas ativas desta instância serão encerradas e mantidas no histórico.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs italic">
            <input
              type="checkbox"
              checked={removeConversationHistory}
              onChange={(event) => setRemoveConversationHistory(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="font-semibold">Remover histórico de conversas</span>
          </label>
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
  if (status === "connected") return <Wifi className="h-3 w-3" />;
  if (status === "connecting") return <QrCode className="h-3 w-3" />;
  if (status === "error") return <AlertTriangle className="h-3 w-3" />;
  if (status === "removed") return <Trash2 className="h-3 w-3" />;
  return <WifiOff className="h-3 w-3" />;
}

function InstanceLogo({ connection }: { connection: ApiMessagingConnection }) {
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-1 text-xs font-semibold text-muted-foreground"
      style={
        connection.logoUrl
          ? undefined
          : {
              backgroundColor: "#25D36624",
              color: "#25D366",
            }
      }
    >
      {connection.logoUrl ? (
        <img
          src={connection.logoUrl}
          alt={`Foto de perfil do WhatsApp de ${connection.name}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <MessageCircle className="h-5 w-5" aria-label="WhatsApp" />
      )}
    </span>
  );
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

function formatCreatedAt(value: string) {
  const date = new Date(value);
  const day = date.toLocaleDateString("pt-BR");
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }).replace(",", "");
}

function providerLabel(provider: ApiMessagingConnection["providerType"]) {
  const labels = {
    development: "Development",
    evolution: "WhatsApp",
    meta_cloud: "Meta Cloud API",
  } as const;
  return labels[provider];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function normalizeHexColor(value?: string | null, _fallback = "#22c55e") {
  const digits = String(value ?? "")
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6);
  return `#${digits.toUpperCase()}`;
}

function completeHexColor(value?: string | null, fallback = "#22c55e") {
  const normalized = normalizeHexColor(value);
  return normalized.length === 7 ? normalized : normalizeHexColor(fallback);
}

function readImageAsCompressedDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem."));
      return;
    }
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
