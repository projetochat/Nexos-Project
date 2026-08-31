import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Avatar, Card, SearchInput, SectionHeader } from "@/components/ui-kit";
import { fmtDateTime } from "@/lib/format";
import { platformApi, type PlatformAuditLog } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria · Nexo Admin" }] }),
  component: AuditoriaAdmin,
});

function AuditoriaAdmin() {
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
    `${row.action} ${row.actor?.email ?? ""} ${row.tenant?.slug ?? ""}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );

  return (
    <AdminContainer>
      <SectionHeader
        title="Auditoria"
        subtitle="Ações administrativas persistidas no backend. Não há endpoint de remoção."
        actions={
          <div className="inline-flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
            <ShieldAlert className="h-3.5 w-3.5" />
            Imutável
          </div>
        }
      />
      <Card>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Ação, ator ou tenant..."
          className="mb-4 max-w-md"
        />
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <div key={row.id} className="flex items-center gap-3 py-3">
              <Avatar name={row.actor?.name ?? "Sistema"} size={30} />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-medium">{row.actor?.name ?? "Sistema"}</span>{" "}
                  <span className="text-muted-foreground">{row.action}</span>
                  {row.tenant && <span className="font-medium"> {row.tenant.slug}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.targetType} {row.targetId ? `· ${row.targetId}` : ""}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {fmtDateTime(new Date(row.createdAt).getTime())}
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum evento encontrado.
            </div>
          )}
        </div>
      </Card>
    </AdminContainer>
  );
}
