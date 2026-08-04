import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Badge, Card, Input, SectionHeader } from "@/components/ui-kit";
import { fmtDateTime } from "@/lib/format";
import { platformApi, type PlatformAuditLog } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({ meta: [{ title: "Logs · Nexo Admin" }] }),
  component: LogsAdmin,
});

function LogsAdmin() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<PlatformAuditLog[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    platformApi
      .auditLogs({ pageSize: 50 })
      .then((data) => setRows(data.items))
      .catch((err) => setError((err as Error).message));
  }, []);
  const filtered = rows.filter((row) =>
    `${row.action} ${row.targetType} ${row.tenant?.slug ?? ""}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <AdminContainer>
      <SectionHeader
        title="Logs administrativos"
        subtitle="Eventos persistidos pelo plano de controle. Health detalhado fica em Monitoramento."
      />
      <Card>
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar evento..."
            className="pl-9"
          />
        </div>
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="font-mono text-xs">
          {filtered.map((row) => (
            <div key={row.id} className="flex items-center gap-3 border-b border-border/60 py-2">
              <span className="w-36 text-muted-foreground">
                {fmtDateTime(new Date(row.createdAt).getTime())}
              </span>
              <Badge tone="info">{row.action}</Badge>
              <span className="w-28 text-muted-foreground">{row.targetType}</span>
              <span className="min-w-0 flex-1 truncate">
                {row.tenant?.slug ?? row.targetId ?? row.id}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </AdminContainer>
  );
}
