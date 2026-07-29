import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Card, SectionHeader, Badge, Button } from "@/components/ui-kit";
import { Bot, Sparkles, Zap, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/chatbot")({
  head: () => ({ meta: [{ title: "Chatbot · Nexo" }] }),
  component: () => {
    const bots = [
      { id: "1", nome: "Bot de Boas-vindas", status: "ativo", disparos: 3210, taxa: 89, ia: false },
      { id: "2", nome: "Pré-atendimento (IA)", status: "ativo", disparos: 1890, taxa: 76, ia: true },
      { id: "3", nome: "FAQ Financeiro", status: "pausado", disparos: 420, taxa: 62, ia: false },
      { id: "4", nome: "Coleta de dados de cadastro", status: "ativo", disparos: 890, taxa: 94, ia: false },
    ];
    return (
      <AppShell>
        <PageContainer>
          <SectionHeader
            title="Chatbot"
            subtitle="Fluxos automáticos que atendem antes ou no lugar dos operadores."
            actions={<Button variant="primary" onClick={() => toast.info("Editor visual em breve")}>Novo fluxo</Button>}
          />

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Bots ativos</div>
              <div className="mt-2 text-2xl font-semibold">3</div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Interações no mês</div>
              <div className="mt-2 text-2xl font-semibold">6.410</div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Contenção (auto-resolvido)</div>
              <div className="mt-2 text-2xl font-semibold text-success">42%</div>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {bots.map((b) => (
              <Card key={b.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${b.ia ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground"}`}>
                      {b.ia ? <Sparkles className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        {b.nome}
                        {b.ia && <Badge tone="brand" dot={false}>IA</Badge>}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {b.disparos.toLocaleString("pt-BR")} disparos · {b.taxa}% taxa de conclusão
                      </p>
                    </div>
                  </div>
                  <Badge tone={b.status === "ativo" ? "success" : "default"}>{b.status}</Badge>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => toast.success(`Editando ${b.nome}`)}>Editar fluxo</Button>
                  <Button variant="outline" size="sm" onClick={() => toast.info("Métricas detalhadas")}>Métricas</Button>
                </div>
              </Card>
            ))}
          </div>
        </PageContainer>
      </AppShell>
    );
  },
});
