import * as React from "react";
import { createPortal } from "react-dom";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  Eye,
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
import { Modal, useDisclosure } from "@/components/modal";
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
      toast.success("Conexao removida");
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
              <Plus className="h-3.5 w-3.5" /> Nova instância
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
                            : "Sem numero"}
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
                      onClick={() => logout.mutate(connection.id)}
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
                      className="text-destructive hover:text-destructive"
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
      title="Nova instância WhatsApp"
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

type RemoveConnectionOptions = {
  removeConversationHistory: boolean;
};

type ConnectionSettingsFormData = {
  name: string;
  color: string | null;
  logoUrl: string | null;
  welcomeEnabled: boolean;
  welcomeNewMessage: string | null;
  welcomeExistingMessage: string | null;
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
  "{{nome}}",
  "{{telefone}}",
  "{{email}}",
  "{{departamento}}",
  "{{cliente}}",
  "{{instancia}}",
];

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
  const logoButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [tab, setTab] = React.useState<ConnectionSettingsTab>("general");
  const [logoMenuOpen, setLogoMenuOpen] = React.useState(false);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [logoPreviewOpen, setLogoPreviewOpen] = React.useState(false);
  const [timezone, setTimezone] = React.useState("America/Sao_Paulo");
  const [aiAgentId, setAiAgentId] = React.useState("");
  const [absenceEnabled, setAbsenceEnabled] = React.useState(false);
  const [absenceMessage, setAbsenceMessage] = React.useState("");
  const [serviceHours, setServiceHours] = React.useState<ServiceHoursRow[]>(defaultServiceHours);
  const [form, setForm] = React.useState<ConnectionSettingsFormData>({
    name: "",
    color: "#22c55e",
    logoUrl: null,
    welcomeEnabled: false,
    welcomeNewMessage: "",
    welcomeExistingMessage: "",
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
    setAbsenceEnabled(false);
    setAbsenceMessage("");
    setServiceHours(defaultServiceHours());
    setForm({
      name: connection.name,
      color: connection.color || "#22c55e",
      logoUrl: connection.logoUrl ?? null,
      welcomeEnabled: connection.welcomeEnabled ?? false,
      welcomeNewMessage:
        connection.welcomeNewMessage ||
        "Ola! Seja bem-vindo(a). Poderia informar seu nome para iniciarmos o atendimento?",
      welcomeExistingMessage: connection.welcomeExistingMessage || "Ola {{nome}},\nTudo bem?",
      notes: connection.notes || "",
    });
  }, [connection]);

  const applyLogoDataUrl = (dataUrl: string | null) => {
    setLogoPreview(dataUrl);
    setForm((current) => ({ ...current, logoUrl: dataUrl }));
  };

  const handleLogoFile = async (file?: File | null) => {
    if (!file) return;
    try {
      applyLogoDataUrl(await readImageAsCompressedDataUrl(file));
      setLogoMenuOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const save = () => {
    if (!connection || form.name.trim().length < 2) return;
    onSubmit(connection, {
      ...form,
      name: form.name.trim(),
      color: completeHexColor(form.color, "#22c55e"),
      logoUrl: form.logoUrl,
      welcomeNewMessage: form.welcomeNewMessage?.trim() || null,
      welcomeExistingMessage: form.welcomeExistingMessage?.trim() || null,
      notes: form.notes?.trim() || null,
    });
  };

  return (
    <>
      <Modal
        open={!!connection}
        onClose={onClose}
        title="Editar instância"
        size="lg"
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
          <div className="flex border-b border-border text-sm">
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
                    className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-1 text-center text-xs font-semibold text-muted-foreground"
                    onClick={() => setLogoMenuOpen((open) => !open)}
                    aria-label="Opções do logo"
                  >
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Logo da instância"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="px-4">{connection?.name || "Logo"}</span>
                    )}
                  </button>
                  <FloatingLogoMenu
                    open={logoMenuOpen}
                    anchorRef={logoButtonRef}
                    onClose={() => setLogoMenuOpen(false)}
                  >
                    <LogoMenuButton
                      icon={<Eye className="h-4 w-4" />}
                      onClick={() => {
                        const logo = logoPreview ?? form.logoUrl;
                        setLogoMenuOpen(false);
                        if (!logo) {
                          toast.info("Nenhum logo cadastrado para esta instância.");
                          return;
                        }
                        setLogoPreviewOpen(true);
                      }}
                    >
                      Mostrar logo
                    </LogoMenuButton>
                    <LogoMenuButton
                      icon={<Camera className="h-4 w-4" />}
                      onClick={() => {
                        setLogoMenuOpen(false);
                        setCameraOpen(true);
                      }}
                    >
                      Tirar foto
                    </LogoMenuButton>
                    <LogoMenuButton
                      icon={<Upload className="h-4 w-4" />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Carregar foto
                    </LogoMenuButton>
                    <div className="my-1 border-t border-border" />
                    <LogoMenuButton
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => {
                        setLogoPreview(null);
                        setForm((current) => ({ ...current, logoUrl: null }));
                        setLogoMenuOpen(false);
                      }}
                    >
                      Remover foto
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

                <div className="grid gap-4 md:grid-cols-2">
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
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={completeHexColor(form.color, "#22c55e")}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            color: normalizeHexColor(event.target.value, "#22c55e"),
                          })
                        }
                        className="h-10 w-14 p-1"
                      />
                      <Input
                        value={form.color || ""}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            color: normalizeHexColor(event.target.value, "#22c55e"),
                          })
                        }
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
                  onChange={(event) => setForm({ ...form, welcomeEnabled: event.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Ativar mensagem de saudação
              </label>
              <Field label="Mensagem para novo contato">
                <Textarea
                  rows={4}
                  value={form.welcomeNewMessage ?? ""}
                  onChange={(event) => setForm({ ...form, welcomeNewMessage: event.target.value })}
                  disabled={!form.welcomeEnabled}
                />
              </Field>
              <Field label="Mensagem para contato existente">
                <Textarea
                  rows={4}
                  value={form.welcomeExistingMessage ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, welcomeExistingMessage: event.target.value })
                  }
                  disabled={!form.welcomeEnabled}
                />
              </Field>
              <VariableTokens customFields={contactCustomFields} />
            </div>
          )}

          {tab === "absence" && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={absenceEnabled}
                  onChange={(event) => setAbsenceEnabled(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Ativar mensagem de ausência
              </label>
              <Field label="Mensagem de Ausência">
                <Textarea
                  rows={6}
                  value={absenceMessage}
                  onChange={(event) => setAbsenceMessage(event.target.value)}
                  disabled={!absenceEnabled}
                  placeholder="Olá {{nome}}, estamos fora do horário de atendimento. Retornaremos assim que possível."
                />
              </Field>
              <VariableTokens customFields={contactCustomFields} />
              <ServiceHoursTable rows={serviceHours} onChange={setServiceHours} />
            </div>
          )}
        </div>
      </Modal>
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          applyLogoDataUrl(dataUrl);
          setCameraOpen(false);
        }}
      />
      <LogoPreviewModal
        open={logoPreviewOpen}
        title={form.name ? `Logo de ${form.name}` : "Logo da instância"}
        src={logoPreview ?? form.logoUrl}
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

function LogoMenuButton({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-4 py-2 text-left text-foreground transition hover:bg-surface-1"
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
      title="Tirar foto"
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

function VariableTokens({ customFields }: { customFields: ApiContactCustomField[] }) {
  const tokens = React.useMemo(
    () => mergeMessageVariables(CONNECTION_MESSAGE_VARIABLES, customFields),
    [customFields],
  );

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Variáveis Disponíveis
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {tokens.map((token) => (
          <button
            key={token}
            type="button"
            className="rounded-md border border-border bg-card px-2 py-1 font-mono"
            onClick={() => navigator.clipboard.writeText(token).catch(() => undefined)}
          >
            {token}
          </button>
        ))}
      </div>
    </div>
  );
}

function mergeMessageVariables(baseTokens: string[], customFields: ApiContactCustomField[]) {
  const tokens = new Set(baseTokens);
  customFields.forEach((field) => {
    const token = customFieldVariableToken(field.label);
    if (token) tokens.add(token);
  });
  return Array.from(tokens);
}

function customFieldVariableToken(label: string) {
  const key = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key ? `{{${key}}}` : null;
}

function ServiceHoursTable({
  rows,
  onChange,
}: {
  rows: ServiceHoursRow[];
  onChange: (rows: ServiceHoursRow[]) => void;
}) {
  const updateRow = (index: number, patch: Partial<ServiceHoursRow>) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Horário de Atendimento</p>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead className="bg-surface-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Dia da semana</th>
              <th className="px-3 py-3 text-left font-semibold">Ativo</th>
              <th className="px-3 py-3 text-left font-semibold">Início</th>
              <th className="px-3 py-3 text-left font-semibold">Fim</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => (
              <tr key={row.day}>
                <td className="px-3 py-2">{row.day}</td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(event) => updateRow(index, { active: event.target.checked })}
                    className="h-4 w-4 accent-primary"
                    aria-label={`Ativar atendimento em ${row.day}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="time"
                    value={row.start}
                    disabled={!row.active}
                    onChange={(event) => updateRow(index, { start: event.target.value })}
                    className="w-32"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="time"
                    value={row.end}
                    disabled={!row.active}
                    onChange={(event) => updateRow(index, { end: event.target.value })}
                    className="w-32"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
      title="Remover conexao"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => connection && onConfirm(connection, { removeConversationHistory })}
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
            A conexao sera indisponibilizada para novos envios e campanhas. Se o historico nao for
            removido, as conversas ativas dessa instancia serao encerradas e mantidas no historico.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs italic">
            <input
              type="checkbox"
              checked={removeConversationHistory}
              onChange={(event) => setRemoveConversationHistory(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
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
              backgroundColor: `${connection.color ?? "#22C55E"}24`,
              color: connection.color ?? "#22C55E",
            }
      }
    >
      {connection.logoUrl ? (
        <img
          src={connection.logoUrl}
          alt={`Logo de ${connection.name}`}
          className="h-full w-full object-cover"
        />
      ) : (
        initials(connection.name)
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
