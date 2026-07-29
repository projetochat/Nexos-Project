import { createFileRoute } from "@tanstack/react-router";
import { Check, Sparkles, Users, Phone, MessageSquareText } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge, Button } from "@/components/ui-kit";
import { planos } from "@/lib/mock/saas";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/planos")({
  head: () => ({ meta: [{ title: "Planos · Nexo Admin" }] }),
  component: PlanosAdmin,
});

function PlanosAdmin() {
  return (
    <AdminContainer>
      <SectionHeader
        title="Planos comerciais"
        subtitle="Catálogo de planos oferecidos pela plataforma."
        actions={<Button variant="primary" onClick={() => toast.info("Editor de planos em breve")}>Novo plano</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {planos.map((p, i) => (
          <Card key={p.id} className={i === 2 ? "border-primary/40 shadow-glow" : ""}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight">{p.nome}</h3>
              {i === 2 && <Badge tone="brand" dot={false}>Mais popular</Badge>}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-mono text-3xl font-semibold">{formatCurrency(p.preco)}</span>
              <span className="text-xs text-muted-foreground">/{p.ciclo}</span>
            </div>
            <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><Users className="h-3 w-3" /> Até {p.limites.operadores === 999 ? "∞" : p.limites.operadores} operadores</div>
              <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {p.limites.numeros === 999 ? "∞" : p.limites.numeros} números</div>
              <div className="flex items-center gap-1.5"><MessageSquareText className="h-3 w-3" /> {p.limites.mensagens.toLocaleString("pt-BR")} msg/mês</div>
            </div>
            <div className="my-4 h-px bg-border" />
            <ul className="space-y-1.5 text-xs">
              {p.recursos.map((r) => (
                <li key={r} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> {r}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground"><Sparkles className="inline h-3 w-3" /> {p.assinantes} assinantes</span>
              <Badge tone={p.ativo ? "success" : "default"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => toast.info(`Editar ${p.nome}`)}>Editar</Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.success(`Ver assinantes de ${p.nome}`)}>Assinantes</Button>
            </div>
          </Card>
        ))}
      </div>
    </AdminContainer>
  );
}
