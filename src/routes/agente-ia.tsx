import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Card, SectionHeader, Badge, Button } from "@/components/ui-kit";
import { Bot, Sparkles, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/agente-ia")({
  head: () => ({
    meta: [
      { title: "Agente de IA · Nexo" },
      { name: "description", content: "Configure agentes de IA para atendimento automatizado." },
      { property: "og:title", content: "Agente de IA · Nexo" },
      { property: "og:description", content: "Configure agentes de IA para atendimento automatizado." },
    ],
  }),
  component: () => (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Agente de IA"
          subtitle="Assistentes inteligentes que respondem, qualificam leads e apoiam sua equipe."
          actions={
            <Button variant="primary" onClick={() => toast.info("Criação de agente em breve")}>
              Novo agente
            </Button>
          }
        />
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Bot className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-semibold">Configure seu primeiro Agente de IA</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Treine com sua base de conhecimento, defina tom de voz, gatilhos de transferência e deixe
              a IA cuidar de dúvidas frequentes 24/7.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Badge tone="info"><Sparkles className="mr-1 h-3 w-3" /> Multi-canal</Badge>
              <Badge tone="default"><MessageSquareText className="mr-1 h-3 w-3" /> Handoff humano</Badge>
            </div>
          </div>
        </Card>
      </PageContainer>
    </AppShell>
  ),
});
