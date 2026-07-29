import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge, Input } from "@/components/ui-kit";
import { assinaturas, tenants, planos } from "@/lib/mock/saas";
import { formatCurrency, fmtDate } from "@/lib/format";
import { Search } from "lucide-react";

export const Route = createFileRoute("/admin/assinaturas")({
  head: () => ({ meta: [{ title: "Assinaturas · Nexo Admin" }] }),
  component: () => {
    const [q, setQ] = React.useState("");
    const rows = assinaturas
      .map((a) => ({
        ...a,
        tenant: tenants.find((t) => t.id === a.tenantId)!,
        plano: planos.find((p) => p.id === a.planoId)!,
      }))
      .filter((r) => !q || r.tenant.nome.toLowerCase().includes(q.toLowerCase()));

    const total = assinaturas.filter((a) => a.status === "ativa").reduce((s, a) => s + a.valor, 0);

    return (
      <AdminContainer>
        <SectionHeader
          title="Assinaturas"
          subtitle={`${assinaturas.length} assinaturas · ${formatCurrency(total)} em recorrência ativa.`}
        />
        <Card>
          <div className="mb-4 relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa…" className="pl-9" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  <th className="pb-2">Empresa</th>
                  <th className="pb-2">Plano</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Valor</th>
                  <th className="pb-2">Início</th>
                  <th className="pb-2">Próxima cobrança</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-surface-1">
                    <td className="py-3 font-medium">{r.tenant.nome}</td>
                    <td className="py-3">{r.plano.nome}</td>
                    <td className="py-3">
                      <Badge tone={r.status === "ativa" ? "success" : r.status === "trial" ? "info" : "warning"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-3 font-mono text-xs">{formatCurrency(r.valor)}</td>
                    <td className="py-3 text-xs text-muted-foreground">{fmtDate(r.inicio)}</td>
                    <td className="py-3 text-xs">{fmtDate(r.proximaCobranca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </AdminContainer>
    );
  },
});
