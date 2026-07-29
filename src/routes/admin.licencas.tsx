import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge, Button } from "@/components/ui-kit";
import { tenants, planos } from "@/lib/mock/saas";
import { KeyRound, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/licencas")({
  head: () => ({ meta: [{ title: "Licenças · Nexo Admin" }] }),
  component: () => (
    <AdminContainer>
      <SectionHeader
        title="Licenças e chaves de acesso"
        subtitle="Chaves de API e limites por empresa contratante."
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Empresa</th>
                <th className="pb-2">Plano</th>
                <th className="pb-2">API Key</th>
                <th className="pb-2">Uso mensal</th>
                <th className="pb-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tenants.slice(0, 15).map((t) => {
                const p = planos.find((pl) => pl.id === t.planoId)!;
                const usoPct = (t.mensagensMes / p.limites.mensagens) * 100;
                return (
                  <tr key={t.id} className="border-b border-border/60 hover:bg-surface-1">
                    <td className="py-3 font-medium">{t.nome}</td>
                    <td className="py-3">{p.nome}</td>
                    <td className="py-3">
                      <code className="rounded-md bg-surface-2 px-2 py-1 text-xs">
                        sk_live_{t.id.slice(-8)}••••••••
                      </code>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={`h-full ${usoPct > 80 ? "bg-warning" : "bg-primary"}`}
                            style={{ width: `${Math.min(usoPct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{usoPct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => toast.success("Chave copiada")}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs hover:bg-surface-2"
                      >
                        <Copy className="h-3 w-3" /> Copiar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminContainer>
  ),
});
