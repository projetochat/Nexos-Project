import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, MoreHorizontal, ExternalLink, Ban, Play, ShieldCheck } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge, Button, Input, Avatar } from "@/components/ui-kit";
import { tenants, planos, type TenantStatus } from "@/lib/mock/saas";
import { formatCurrency, fmtDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/empresas")({
  head: () => ({ meta: [{ title: "Empresas · Nexo Admin" }] }),
  component: EmpresasSaaS,
});

const STATUS_LABEL: Record<TenantStatus, string> = {
  ativa: "Ativa",
  trial: "Trial",
  bloqueada: "Bloqueada",
  cancelada: "Cancelada",
  inadimplente: "Inadimplente",
};

function EmpresasSaaS() {
  const navigate = useNavigate();
  const impersonate = useSession((s) => s.impersonate);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"all" | TenantStatus>("all");
  const [plano, setPlano] = React.useState("all");

  const filtered = tenants.filter((t) => {
    if (q && !`${t.nome} ${t.responsavel} ${t.email}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (status !== "all" && t.status !== status) return false;
    if (plano !== "all" && t.planoId !== plano) return false;
    return true;
  });

  function handleImpersonate(t: (typeof tenants)[number]) {
    impersonate(t.id, t.nome);
    toast.success(`Impersonando ${t.nome}`, {
      description: "Sessão registrada em auditoria.",
    });
    navigate({ to: "/" });
  }

  return (
    <AdminContainer>
      <SectionHeader
        title="Empresas contratantes"
        subtitle={`${tenants.length} organizações usando a plataforma.`}
        actions={<Button variant="primary">Nova empresa</Button>}
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa, responsável, e-mail…" className="pl-9" />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as never)}
            className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm"
          >
            <option value="all">Todos os status</option>
            {(Object.keys(STATUS_LABEL) as TenantStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select
            value={plano}
            onChange={(e) => setPlano(e.target.value)}
            className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm"
          >
            <option value="all">Todos os planos</option>
            {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Empresa</th>
                <th className="pb-2">Plano</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">MRR</th>
                <th className="pb-2">Operadores</th>
                <th className="pb-2">Criada</th>
                <th className="pb-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const p = planos.find((pl) => pl.id === t.planoId);
                return (
                  <tr key={t.id} className="border-b border-border/60 transition hover:bg-surface-1">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.nome} size={30} />
                        <div>
                          <div className="font-medium">{t.nome}</div>
                          <div className="text-xs text-muted-foreground">{t.responsavel} · {t.cidade}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="rounded-md border border-border bg-surface-1 px-2 py-0.5 text-xs">
                        {p?.nome}
                      </span>
                    </td>
                    <td className="py-3">
                      <Badge tone={
                        t.status === "ativa" ? "success" :
                        t.status === "trial" ? "info" :
                        t.status === "inadimplente" ? "warning" :
                        t.status === "bloqueada" ? "destructive" : "default"
                      }>
                        {STATUS_LABEL[t.status]}
                      </Badge>
                    </td>
                    <td className="py-3 font-mono text-xs">{formatCurrency(t.mrr)}</td>
                    <td className="py-3 text-xs">{t.operadores}</td>
                    <td className="py-3 text-xs text-muted-foreground">{fmtDate(t.criadaEm)}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleImpersonate(t)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs font-medium transition hover:bg-surface-2"
                          title="Acessar como esta empresa (impersonar)"
                        >
                          <ShieldCheck className="h-3 w-3" /> Acessar
                        </button>
                        {t.status === "bloqueada" ? (
                          <button
                            onClick={() => toast.success(`Empresa ${t.nome} reativada`)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs transition hover:bg-surface-2"
                          >
                            <Play className="h-3 w-3" /> Reativar
                          </button>
                        ) : (
                          <button
                            onClick={() => toast.warning(`Empresa ${t.nome} bloqueada`, { description: "Ação registrada em auditoria" })}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs transition hover:bg-surface-2"
                          >
                            <Ban className="h-3 w-3" /> Bloquear
                          </button>
                        )}
                        <button className="rounded-md border border-border bg-surface-1 p-1 transition hover:bg-surface-2">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</div>
          )}
        </div>
      </Card>
    </AdminContainer>
  );
}
