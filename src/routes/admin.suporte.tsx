import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge, Input } from "@/components/ui-kit";
import { tickets, tenants } from "@/lib/mock/saas";
import { relativeTime } from "@/lib/format";
import { Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/suporte")({
  head: () => ({ meta: [{ title: "Suporte · Nexo Admin" }] }),
  component: SuporteAdmin,
});

const PRI_TONE: Record<string, "default" | "success" | "warning" | "info" | "destructive" | "brand"> = {
  baixa: "default",
  media: "info",
  alta: "warning",
  critica: "destructive",
};

function SuporteAdmin() {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");

  const rows = tickets
    .map((t) => ({ ...t, tenant: tenants.find((x) => x.id === t.tenantId)! }))
    .filter((r) => (status === "all" || r.status === status) && (!q || `${r.titulo} ${r.tenant.nome}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.atualizadoEm - a.atualizadoEm);

  const abertos = tickets.filter((t) => t.status !== "resolvido").length;

  return (
    <AdminContainer>
      <SectionHeader
        title="Central de suporte"
        subtitle={`${abertos} tickets em andamento entre as empresas contratantes.`}
      />
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ticket…" className="pl-9" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
            <option value="all">Todos</option>
            <option value="aberto">Aberto</option>
            <option value="em_andamento">Em andamento</option>
            <option value="aguardando_cliente">Aguardando cliente</option>
            <option value="resolvido">Resolvido</option>
          </select>
        </div>
        <div className="divide-y divide-border">
          {rows.map((t) => (
            <button
              key={t.id}
              onClick={() => toast.info(`Ticket #${t.id}`, { description: t.titulo })}
              className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-surface-1 -mx-2 px-2 rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{t.id.slice(-4)}</span>
                  <span className="truncate text-sm font-medium">{t.titulo}</span>
                  <Badge tone={PRI_TONE[t.prioridade]}>{t.prioridade}</Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.tenant.nome}</span> · <span>{t.categoria}</span> · <span>por {t.autor}</span>
                </div>
              </div>
              <Badge tone={t.status === "resolvido" ? "success" : t.status === "aberto" ? "warning" : "info"}>
                {t.status.replace("_", " ")}
              </Badge>
              <span className="w-16 text-right text-xs text-muted-foreground">{relativeTime(t.atualizadoEm)}</span>
            </button>
          ))}
        </div>
      </Card>
    </AdminContainer>
  );
}
