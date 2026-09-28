import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { Card, Badge, Button } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/integracoes")({
  component: IntegracoesSettings,
});

const INTEGRATIONS = [
  {
    name: "WhatsApp Business",
    desc: "Canal principal de atendimento",
    status: "Conectado",
    tone: "success",
    available: true,
  },
  {
    name: "Instagram Direct",
    desc: "Mensagens do Meta Business",
    status: "Em breve",
    tone: "default",
    available: false,
  },
  {
    name: "Webchat do site",
    desc: "Widget embutido no seu site",
    status: "Em breve",
    tone: "default",
    available: false,
  },
  {
    name: "CRM · HubSpot",
    desc: "Sincronização de contatos e deals",
    status: "Em breve",
    tone: "default",
    available: false,
  },
  {
    name: "Zapier",
    desc: "Automações com 5.000+ apps",
    status: "Em breve",
    tone: "default",
    available: false,
  },
  {
    name: "API pública",
    desc: "Endpoints REST para integração custom",
    status: "Em breve",
    tone: "default",
    available: false,
  },
] as const;

function IntegracoesSettings() {
  const navigate = useNavigate();

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {INTEGRATIONS.map((i) => (
        <Card
          key={i.name}
          className={i.available ? undefined : "bg-surface-2 text-muted-foreground grayscale"}
        >
          <div className="flex items-start justify-between">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                i.available ? "bg-gradient-brand/10 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              <Plug className="h-5 w-5" />
            </div>
            <Badge tone={i.tone as never}>{i.status}</Badge>
          </div>
          <p className="mt-4 text-sm font-semibold">{i.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{i.desc}</p>
          <div className="mt-4 border-t border-border pt-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={!i.available}
              onClick={() => i.available && void navigate({ to: "/instancias" })}
            >
              {i.available ? "Gerenciar" : "Em breve"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
