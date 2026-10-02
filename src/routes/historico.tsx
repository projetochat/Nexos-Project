import { createFileRoute } from "@tanstack/react-router";
import { HistoricoPage } from "./-historico-page";

export const Route = createFileRoute("/historico")({
  validateSearch: (search) => ({
    conversationId:
      typeof search.conversationId === "string" && search.conversationId.trim()
        ? search.conversationId
        : undefined,
  }),
  component: HistoricoRoute,
});

function HistoricoRoute() {
  const { conversationId } = Route.useSearch();
  return <HistoricoPage initialConversationId={conversationId} />;
}
