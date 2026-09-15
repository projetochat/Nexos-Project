import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Book, MessageCircle, Video, Mail, ChevronRight } from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Button, Badge, SearchInput } from "@/components/ui-kit";

export const Route = createFileRoute("/ajuda")({
  component: AjudaPage,
});

const CATEGORIES = [
  { icon: Book, title: "Primeiros passos", desc: "Configure sua conta em minutos", articles: 12 },
  { icon: MessageCircle, title: "Atendimento", desc: "Fluxos e boas práticas", articles: 24 },
  { icon: Video, title: "Automações", desc: "Regras e mensagens automáticas", articles: 8 },
  { icon: Mail, title: "Integrações", desc: "Conecte seus outros sistemas", articles: 15 },
];

const POPULAR = [
  "Como conectar o WhatsApp Business",
  "Distribuição de conversas por skill",
  "Configurando horário de atendimento",
  "Etiquetas e organização da caixa",
  "Como exportar relatórios",
];

function AjudaPage() {
  const [query, setQuery] = React.useState("");

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Central de Ajuda"
          subtitle="Documentação, tutoriais e canal direto com nosso time."
        />

        <Card className="relative mb-6 overflow-hidden bg-gradient-subtle">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-brand opacity-20 blur-3xl" />
          <div className="relative mx-auto max-w-xl text-center">
            <h2 className="text-xl font-semibold">Como podemos ajudar?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Busque em toda a base de conhecimento.
            </p>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Ex: como criar uma etiqueta"
              className="mx-auto mt-6 max-w-md rounded-xl shadow-card"
            />
          </div>
        </Card>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-brand/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <Badge tone="default" dot={false}>{c.articles} artigos</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <p className="text-sm font-semibold">Mais buscados</p>
            <ul className="mt-4 divide-y divide-border">
              {POPULAR.map((p) => (
                <li key={p}>
                  <a className="flex items-center justify-between py-3 text-sm transition hover:text-primary">
                    <span>{p}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <p className="text-sm font-semibold">Ainda precisa de ajuda?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fale com nossa equipe. Tempo médio de resposta: 3 min.
            </p>
            <div className="mt-4 space-y-2">
              <Button variant="primary" className="w-full">
                <MessageCircle className="h-3.5 w-3.5" /> Iniciar chat
              </Button>
              <Button variant="secondary" className="w-full">
                <Mail className="h-3.5 w-3.5" /> Enviar e-mail
              </Button>
            </div>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}
