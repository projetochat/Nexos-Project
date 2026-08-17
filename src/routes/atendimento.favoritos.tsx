import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/favoritos")({
  head: () => ({ meta: [{ title: "Favoritos · Central de Atendimento" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/inbox" });
  },
});
