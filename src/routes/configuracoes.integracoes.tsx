import { createFileRoute } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { Card, Badge, Button } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/integracoes")({
  component: IntegracoesSettings,
});

const INTEGRATIONS = [
  { name: "WhatsApp Business", desc: "Canal principal de atendimento", status: "Conectado", tone: "success" },
  { name: "Instagram Direct", desc: "Mensagens do Meta Business", status: "Disponível", tone: "info" },
  { name: "Webchat do site", desc: "Widget embutido no seu site", status: "Disponível", tone: "info" },
  { name: "CRM · HubSpot", desc: "Sincronização de contatos e deals", status: "Em breve", tone: "warning" },
  { name: "Zapier", desc: "Automações com 5.000+ apps", status: "Em breve", tone: "warning" },
  { name: "API pública", desc: "Endpoints REST para integração custom", status: "Disponível", tone: "info" },
];

function IntegracoesSettings() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {INTEGRATIONS.map((i) => (
        <Card key={i.name}>
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-brand/10 text-primary">
              <Plug className="h-5 w-5" />
            </div>
            <Badge tone={i.tone as never}>{i.status}</Badge>
          </div>
          <p className="mt-4 text-sm font-semibold">{i.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{i.desc}</p>
          <div className="mt-4 border-t border-border pt-3">
            <Button variant="secondary" size="sm">
              {i.status === "Conectado" ? "Gerenciar" : "Conectar"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
