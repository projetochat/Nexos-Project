import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Card, SectionHeader, Badge, Button } from "@/components/ui-kit";
import { useStore } from "@/lib/mock/store";
import { Clock, Users, MessageSquareText, PlayCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/filas")({
  head: () => ({ meta: [{ title: "Filas · Nexo" }] }),
  component: () => {
    const departamentos = useStore((s) => s.departamentos);
    const conversas = useStore((s) => s.conversas);
    const atendentes = useStore((s) => s.atendentes);
    return (
      <AppShell>
        <PageContainer>
          <SectionHeader
            title="Filas de atendimento"
            subtitle="Distribuição de conversas por departamento e regras de roteamento."
            actions={<Button variant="primary" onClick={() => toast.info("Editor de fila em breve")}>Nova regra</Button>}
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {departamentos.map((d) => {
              const doDepto = conversas.filter((c) => c.departamentoId === d.id);
              const aguardando = doDepto.filter((c) => c.status === "aguardando").length;
              const atendendo = doDepto.filter((c) => c.status === "atendendo").length;
              const disp = atendentes.filter((a) => a.departamentoId === d.id && a.status === "online").length;
              return (
                <Card key={d.id}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="h-8 w-1 rounded-full" style={{ backgroundColor: d.cor }} />
                      <div>
                        <h3 className="text-sm font-semibold">{d.nome}</h3>
                        <p className="text-xs text-muted-foreground">{d.descricao}</p>
                      </div>
                    </div>
                    <Badge tone={aguardando > 3 ? "warning" : "success"}>
                      {aguardando > 3 ? "Sobrecarregada" : "Saudável"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-border bg-surface-1 p-2">
                      <Clock className="mx-auto h-3.5 w-3.5 text-warning" />
                      <div className="mt-1 font-mono text-lg font-semibold">{aguardando}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fila</div>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-1 p-2">
                      <MessageSquareText className="mx-auto h-3.5 w-3.5 text-info" />
                      <div className="mt-1 font-mono text-lg font-semibold">{atendendo}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Ativas</div>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-1 p-2">
                      <Users className="mx-auto h-3.5 w-3.5 text-success" />
                      <div className="mt-1 font-mono text-lg font-semibold">{disp}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Online</div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => toast.success(`Roteamento de ${d.nome} atualizado`)}>Configurar</Button>
                    <Button variant="outline" size="sm" className="flex-1"><PlayCircle className="h-3.5 w-3.5" /> Simular</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </PageContainer>
      </AppShell>
    );
  },
});
