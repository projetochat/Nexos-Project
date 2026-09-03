import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, MessageSquareText, Sparkles } from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui-kit";
import { num } from "@/lib/format";
import { automationApi } from "@/lib/nexos-api";

export const Route = createFileRoute("/chatbot")({
  head: () => ({ meta: [{ title: "Chatbot - Nexo" }] }),
  component: Page,
});

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["nexos", "chatbot-rules"],
    queryFn: () => automationApi.list({ pageSize: 100 }),
  });
  const botRules = (data?.items ?? []).filter((rule) => rule.actionType === "bot_reply");
  const active = botRules.filter((rule) => rule.status === "active").length;

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Chatbot"
          subtitle={`${num(active)} regras de resposta ativa.`}
          actions={
            <Link to="/automacoes">
              <Button variant="primary" size="sm">
                <Bot className="h-3.5 w-3.5" /> Configurar regra
              </Button>
            </Link>
          }
        />

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <div className="text-xs uppercase text-muted-foreground">Regras ativas</div>
            <div className="mt-2 text-2xl font-semibold">{num(active)}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase text-muted-foreground">Regras pausadas</div>
            <div className="mt-2 text-2xl font-semibold">{botRules.length - active}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase text-muted-foreground">Fonte</div>
            <div className="mt-2 text-2xl font-semibold text-success">Nexos API</div>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {botRules.map((rule) => (
            <Card key={rule.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{rule.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      Disparo: {rule.matchText}
                    </p>
                  </div>
                </div>
                <Badge tone={rule.status === "active" ? "success" : "default"}>{rule.status}</Badge>
              </div>
              <div className="mt-4 rounded-md border border-border bg-surface-1 p-3 text-sm">
                <MessageSquareText className="mb-2 h-4 w-4 text-muted-foreground" />
                <p className="line-clamp-3">{rule.responseText}</p>
              </div>
            </Card>
          ))}
          {isLoading && <Card className="p-6 text-sm text-muted-foreground">Carregando...</Card>}
          {!isLoading && botRules.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">
              Nenhuma regra de chatbot cadastrada.
            </Card>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}
