import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Input, Avatar } from "@/components/ui-kit";
import { auditLogs, tenants } from "@/lib/mock/saas";
import { fmtDateTime } from "@/lib/format";
import { Search, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/admin/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria · Nexo Admin" }] }),
  component: () => {
    const [q, setQ] = React.useState("");
    const rows = auditLogs
      .map((a) => ({ ...a, tenant: tenants.find((t) => t.id === a.entidadeId) }))
      .filter((r) => !q || `${r.acao} ${r.actorNome} ${r.tenant?.nome ?? ""}`.toLowerCase().includes(q.toLowerCase()));
    return (
      <AdminContainer>
        <SectionHeader
          title="Trilha de auditoria"
          subtitle="Todo acesso, alteração ou impersonação registrada."
          actions={
            <div className="inline-flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
              <ShieldAlert className="h-3.5 w-3.5" />
              Registro imutável
            </div>
          }
        />
        <Card>
          <div className="mb-4 relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ação, ator ou empresa…" className="pl-9" />
          </div>
          <div className="divide-y divide-border">
            {rows.slice(0, 50).map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={a.actorNome} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-medium">{a.actorNome}</span>{" "}
                    <span className="text-muted-foreground">{a.acao.toLowerCase()}</span>
                    {a.tenant && <> <span className="font-medium">{a.tenant.nome}</span></>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.entidade} · IP {a.ip}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</div>
              </div>
            ))}
          </div>
        </Card>
      </AdminContainer>
    );
  },
});
