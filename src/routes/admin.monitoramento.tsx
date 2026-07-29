import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge } from "@/components/ui-kit";
import { CheckCircle2, AlertTriangle, Activity, Server, Cpu, Database, Zap, MessageSquareText } from "lucide-react";

export const Route = createFileRoute("/admin/monitoramento")({
  head: () => ({ meta: [{ title: "Monitoramento · Nexo Admin" }] }),
  component: () => {
    const services = [
      { nome: "API Gateway", status: "operacional", latency: "42ms", icon: Server },
      { nome: "Evolution API", status: "operacional", latency: "128ms", icon: MessageSquareText },
      { nome: "Meta Cloud API", status: "operacional", latency: "89ms", icon: MessageSquareText },
      { nome: "PostgreSQL", status: "operacional", latency: "3ms", icon: Database },
      { nome: "Redis", status: "operacional", latency: "1ms", icon: Zap },
      { nome: "BullMQ (Filas)", status: "degradado", latency: "312ms", icon: Cpu },
      { nome: "Socket.IO", status: "operacional", latency: "22ms", icon: Activity },
      { nome: "Cloudflare R2", status: "operacional", latency: "68ms", icon: Server },
    ];
    return (
      <AdminContainer>
        <SectionHeader
          title="Monitoramento de infraestrutura"
          subtitle="Status em tempo real dos serviços da plataforma."
        />
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Uptime 30d</div>
            <div className="mt-2 text-2xl font-semibold text-success">99.97%</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">P95 latência</div>
            <div className="mt-2 text-2xl font-semibold">142ms</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Requests/min</div>
            <div className="mt-2 text-2xl font-semibold">12.4k</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Fila BullMQ</div>
            <div className="mt-2 text-2xl font-semibold text-warning">2.847</div>
          </Card>
        </div>
        <Card className="mt-6">
          <h3 className="mb-4 text-sm font-semibold">Serviços</h3>
          <div className="space-y-2">
            {services.map((s) => {
              const Icon = s.icon;
              const ok = s.status === "operacional";
              return (
                <div key={s.nome} className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-3 py-2.5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${ok ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.nome}</div>
                    <div className="text-xs text-muted-foreground">Latência p50: {s.latency}</div>
                  </div>
                  {ok ? (
                    <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Operacional</Badge>
                  ) : (
                    <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> Degradado</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </AdminContainer>
    );
  },
});
