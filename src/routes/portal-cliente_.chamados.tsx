import { createFileRoute } from "@tanstack/react-router";
import { ChamadosPage } from "./chamados";
import { validateTicketSearch } from "@/lib/ticket-search";

export const Route = createFileRoute("/portal-cliente_/chamados")({
  validateSearch: validateTicketSearch,
  head: () => ({
    meta: [
      { title: "Portal do Cliente | Trixus" },
      { name: "description", content: "Acompanhe seus chamados no Portal do Cliente." },
    ],
  }),
  component: CustomerPortalTicketsRoute,
});

function CustomerPortalTicketsRoute() {
  return <ChamadosPage mode="customer_portal" search={Route.useSearch()} />;
}
