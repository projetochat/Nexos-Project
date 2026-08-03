import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Badge, Button, Card, Field, Input, SectionHeader } from "@/components/ui-kit";
import { Modal, useDisclosure } from "@/components/modal";
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
};

function Page() {
  const qc = useQueryClient();
  const novo = useDisclosure();
  const [qr, setQr] = React.useState<{ name: string; value: string | null } | null>(null);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["nexos", "messaging-connections"],
    queryFn: connectionsApi.list,
    refetchInterval: 15_000,
  });
  const evolutionItems = items.filter((item) => item.providerType === "evolution");

  const create = useMutation({
    mutationFn: connectionsApi.createEvolution,
    onSuccess: (connection) => {
      qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] });
      if (connection.qrCodeBase64) setQr({ name: connection.name, value: connection.qrCodeBase64 });
      toast.success("Conexao criada");
      novo.hide();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const refresh = useMutation({
    mutationFn: connectionsApi.status,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  const qrCode = useMutation({
    mutationFn: async (connection: ApiMessagingConnection) => ({
      connection,
      result: await connectionsApi.qr(connection.id),
    }),
    onSuccess: ({ connection, result }) => {
      setQr({ name: connection.name, value: result.qrCodeBase64 });
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
    mutationFn: connectionsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nexos", "messaging-connections"] });
      toast.success("Conexao removida");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Instancias"
          subtitle={`${evolutionItems.length} conexoes Evolution cadastradas.`}
          actions={
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Nova Evolution
            </Button>
          }
        />

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>
        ) : evolutionItems.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            Nenhuma connection Evolution cadastrada.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {evolutionItems.map((connection) => (
              <Card key={connection.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{connection.name}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {connection.externalReference ?? "sem referencia externa"}
                    </p>
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
                  {connection.ownerPhoneMasked && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">WhatsApp</span>
                      <span>{connection.ownerPhoneMasked}</span>
                    </div>
                  )}
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
                      <span className="truncate text-right">{connection.provider.webhookUrl}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => qrCode.mutate(connection)}
                    disabled={connection.providerType !== "evolution"}
                  >
                    <QrCode className="h-3.5 w-3.5" /> QR
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => refresh.mutate(connection.id)}>
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
                    onClick={() => remove.mutate(connection.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <ConnectionForm
          open={novo.open}
          busy={create.isPending}
          onClose={novo.hide}
          onSubmit={(data) => create.mutate(data)}
        />
        <QrModal qr={qr} onClose={() => setQr(null)} />
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
      title="Nova conexao Evolution"
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

function QrModal({
  qr,
  onClose,
}: {
  qr: { name: string; value: string | null } | null;
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

function statusIcon(status: ApiMessagingConnection["status"]) {
  if (status === "connected") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "connecting") return <QrCode className="h-3 w-3" />;
  if (status === "error") return <AlertTriangle className="h-3 w-3" />;
  return <Plug className="h-3 w-3" />;
}

function statusLabel(status: ApiMessagingConnection["status"]) {
  const labels = {
    connected: "Conectada",
    connecting: "Conectando",
    disconnected: "Desconectada",
    error: "Erro",
  } as const;
  return labels[status];
}

function providerLabel(provider: ApiMessagingConnection["providerType"]) {
  const labels = {
    development: "Development",
    evolution: "Evolution API",
    meta_cloud: "Meta Cloud API",
  } as const;
  return labels[provider];
}
