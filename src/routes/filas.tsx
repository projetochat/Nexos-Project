import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MessageSquareText, RefreshCw, Users } from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui-kit";
import { num } from "@/lib/format";
import { operationsApi } from "@/lib/nexos-api";
import { onRealtimeEvent } from "@/lib/realtime/client";

export const Route = createFileRoute("/filas")({
  head: () => ({ meta: [{ title: "Filas - Nexo" }] }),
  component: Page,
});

const queueQueryKey = ["operations", "queues"] as const;

function Page() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queueQueryKey,
    queryFn: () => operationsApi.queues({ period: "today" }),
    refetchInterval: 30_000,
  });
  const queues = data?.items ?? [];

  React.useEffect(
    () =>
      onRealtimeEvent((event) => {
        if (event.event.startsWith("lead.") || event.event.startsWith("conversation.")) {
          queryClient.invalidateQueries({ queryKey: queueQueryKey });
        }
      }),
    [queryClient],
  );

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Filas de atendimento"
          subtitle={`${queues.reduce((sum, queue) => sum + queue.quantidade, 0)} itens em filas operacionais.`}
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: queueQueryKey })}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Link to="/inbox" search={{ tab: "leads" }}>
                <Button variant="secondary" size="sm">
                  <MessageSquareText className="h-3.5 w-3.5" /> Abrir inbox
                </Button>
              </Link>
            </div>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {queues.map((queue) => (
            <Card key={queue.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="h-8 w-1 rounded-full" style={{ backgroundColor: queue.cor }} />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{queue.nome}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      Capacidade atual: {queue.capacidade} atendimentos
                    </p>
                  </div>
                </div>
                <Badge tone={queue.prioridade === "alta" ? "warning" : "success"}>
                  {queue.prioridade === "alta" ? "Atencao" : "Saudavel"}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Leads"
                  value={queue.leads}
                />
                <Metric
                  icon={<MessageSquareText className="h-3.5 w-3.5" />}
                  label="Ativas"
                  value={queue.conversasAtivas}
                />
                <Metric
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Agentes"
                  value={queue.atendentes}
                />
              </div>

              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                <Row label="SLA da fila" value={`${num(queue.sla)}%`} />
                <Row label="Encerradas hoje" value={num(queue.conversasEncerradas)} />
                <Row label="Transferencias" value={num(queue.transferencias)} />
                <Row
                  label="Tempo medio"
                  value={
                    queue.tempoMedioMinutos == null
                      ? "sem amostra"
                      : `${num(queue.tempoMedioMinutos)} min`
                  }
                />
              </div>
            </Card>
          ))}
          {isLoading && (
            <Card className="p-6 text-sm text-muted-foreground">Carregando filas...</Card>
          )}
          {!isLoading && queues.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">
              Nenhuma fila ativa cadastrada.
            </Card>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-2">
      <div className="mx-auto flex h-4 w-4 items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface-1 px-3 py-2">
      <span>{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
