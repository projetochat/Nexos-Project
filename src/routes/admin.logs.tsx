import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge, Input } from "@/components/ui-kit";
import { systemLogs } from "@/lib/mock/saas";
import { relativeTime } from "@/lib/format";
import { Search } from "lucide-react";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({ meta: [{ title: "Logs · Nexo Admin" }] }),
  component: () => {
    const [q, setQ] = React.useState("");
    const [nivel, setNivel] = React.useState("all");
    const rows = systemLogs.filter(
      (l) => (nivel === "all" || l.nivel === nivel) && (!q || `${l.servico} ${l.mensagem}`.toLowerCase().includes(q.toLowerCase())),
    );
    const toneOf: Record<string, "default" | "success" | "warning" | "info" | "destructive"> = {
      info: "info", warn: "warning", error: "destructive", debug: "default",
    };
    return (
      <AdminContainer>
        <SectionHeader title="Logs do sistema" subtitle="Eventos técnicos de gateways, filas e serviços." />
        <Card>
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar serviço ou mensagem…" className="pl-9" />
            </div>
            <select value={nivel} onChange={(e) => setNivel(e.target.value)} className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
              <option value="all">Todos os níveis</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="debug">Debug</option>
            </select>
          </div>
          <div className="font-mono text-xs">
            {rows.slice(0, 60).map((l) => (
              <div key={l.id} className="flex items-center gap-3 border-b border-border/60 py-1.5">
                <span className="w-14 text-muted-foreground">{relativeTime(l.createdAt)}</span>
                <Badge tone={toneOf[l.nivel]}>{l.nivel}</Badge>
                <span className="w-24 text-muted-foreground">{l.servico}</span>
                <span className="flex-1">{l.mensagem}</span>
              </div>
            ))}
          </div>
        </Card>
      </AdminContainer>
    );
  },
});
