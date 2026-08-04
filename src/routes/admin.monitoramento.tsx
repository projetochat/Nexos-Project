import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  MessageSquareText,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Alert, Badge, Button, Card, SectionHeader } from "@/components/ui-kit";
import { platformApi, type PlatformHealth } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/monitoramento")({
  head: () => ({ meta: [{ title: "Monitoramento - Nexo Admin" }] }),
  component: Monitoramento,
});

function Monitoramento() {
  const [health, setHealth] = React.useState<PlatformHealth | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    platformApi
      .health()
      .then((result) => {
        setHealth(result);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  React.useEffect(() => {
    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const services = health
    ? [
        { name: "PostgreSQL", status: health.database, detail: "Fonte da verdade", icon: Database },
        { name: "Redis", status: health.redis, detail: "Cache e filas", icon: Zap },
        {
          name: "Outbound queue",
          status: health.outboundQueue.status,
          detail: configured(health.outboundQueue.configured),
          icon: Cpu,
        },
        {
          name: "Campaign queue",
          status: health.campaignQueue.status,
          detail: configured(health.campaignQueue.configured),
          icon: Cpu,
        },
        {
          name: "Workers",
          status: workerStatus(health.workers),
          detail: `outbound ${health.workers.outbound}, campaign ${health.workers.campaign}`,
          icon: Server,
        },
        {
          name: "Realtime",
          status: health.realtime.status,
          detail: health.realtime.adapter,
          icon: Activity,
        },
        {
          name: "Evolution",
          status: health.evolution.status,
          detail: "Contrato sanitizado",
          icon: MessageSquareText,
        },
        {
          name: "Storage",
          status: health.storage.status,
          detail: health.storage.provider,
          icon: HardDrive,
        },
        {
          name: "Campaign scheduler",
          status: health.campaignScheduler,
          detail: "Agendamento de campanhas",
          icon: Activity,
        },
      ]
    : [];

  return (
    <AdminContainer>
      <SectionHeader
        title="Monitoramento de infraestrutura"
        subtitle="Health administrativo protegido. REST permanece a fonte da verdade; polling/refetch oficial: PLATFORM_REALTIME_DEFERRED_TO_POST_MVP."
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        }
      />
      {error && (
        <Alert tone="destructive" title="Health indisponivel">
          {error}
        </Alert>
      )}
      {health && (
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <StatusCard label="Database" value={health.database} />
          <StatusCard label="Redis" value={health.redis} />
          <StatusCard label="Realtime" value={health.realtime.status} />
          <StatusCard label="Storage" value={health.storage.status} />
        </div>
      )}
      <Card>
        <div className="space-y-2">
          {services.map((service) => {
            const Icon = service.icon;
            const ok = ["up", "configured", "healthy"].includes(service.status);
            return (
              <div
                key={service.name}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-3 py-2.5"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${ok ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{service.name}</div>
                  <div className="text-xs text-muted-foreground">{service.detail}</div>
                </div>
                <Badge tone={ok ? "success" : "warning"}>{service.status}</Badge>
              </div>
            );
          })}
          {!health && !error && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Carregando health administrativo.
            </p>
          )}
        </div>
      </Card>
    </AdminContainer>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  const ok = ["up", "configured", "healthy"].includes(value);
  return (
    <Card>
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${ok ? "text-success" : "text-warning"}`}>
        {value}
      </div>
    </Card>
  );
}

function configured(value: boolean) {
  return value ? "configurado" : "desabilitado";
}

function workerStatus(workers: PlatformHealth["workers"]) {
  return workers.outbound === "configured" || workers.campaign === "configured"
    ? "configured"
    : "degraded";
}
