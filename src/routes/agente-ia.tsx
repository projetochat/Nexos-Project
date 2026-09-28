import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { ComingSoonPage } from "@/components/coming-soon-page";

export const Route = createFileRoute("/agente-ia")({
  head: () => ({
    meta: [
      { title: "Trixus" },
      { name: "description", content: "Configure agentes de IA para atendimento automatizado." },
      { property: "og:title", content: "Agente de IA · Trixus" },
      {
        property: "og:description",
        content: "Configure agentes de IA para atendimento automatizado.",
      },
    ],
  }),
  component: () => (
    <ComingSoonPage
      title="Agente de IA"
      description="O módulo de Agente de IA está sendo preparado e estará disponível em breve."
      icon={<Sparkles className="h-6 w-6" />}
    />
  ),
});
