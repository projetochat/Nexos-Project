import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Card, SectionHeader, Badge, Button } from "@/components/ui-kit";
import { Workflow, Zap, Clock, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/automacoes")({
  head: () => ({ meta: [{ title: "Automações · Nexo" }] }),
  component: () => {
    const rules = [
      { id: "1", nome: "Distribuir por menor carga", gatilho: "Nova conversa", acao: "Atribuir ao operador com menos ativas", exec: 2140, status: "ativo" },
      { id: "2", nome: "Etiquetar VIP automaticamente", gatilho: "Cliente com ticket > R$ 5k", acao: "Adicionar etiqueta VIP", exec: 87, status: "ativo" },
      { id: "3", nome: "Escalar SLA em risco", gatilho: "Sem resposta há 30min", acao: "Notificar supervisor", exec: 34, status: "ativo" },
      { id: "4", nome: "Encerrar conversas inativas", gatilho: "72h sem interação", acao: "Marcar como resolvida", exec: 210, status: "pausado" },
      { id: "5", nome: "Enviar CSAT após atendimento", gatilho: "Conversa resolvida", acao: "Disparar pesquisa", exec: 1102, status: "ativo" },
    ];
    return (
      <AppShell>
        <PageContainer>
          <SectionHeader
            title="Automações"
            subtitle="Regras que rodam em background para acelerar sua operação."
            actions={<Button variant="primary" onClick={() => toast.info("Editor de automação em breve")}>Nova automação</Button>}
          />

          <Card padding={false}>
            <div className="divide-y divide-border">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Workflow className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-medium">{r.nome}</h3>
                      <Badge tone={r.status === "ativo" ? "success" : "default"}>{r.status}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5"><Zap className="h-3 w-3" /> {r.gatilho}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5">{r.acao}</span>
                    </div>
                  </div>
                  <div className="hidden text-right text-xs text-muted-foreground md:block">
                    <div className="font-mono font-semibold text-foreground">{r.exec.toLocaleString("pt-BR")}</div>
                    execuções (30d)
                  </div>
                  <button
                    onClick={() => toast.success(`Configurar ${r.nome}`)}
                    className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs hover:bg-surface-2"
                  >
                    Configurar
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </PageContainer>
      </AppShell>
    );
  },
});
