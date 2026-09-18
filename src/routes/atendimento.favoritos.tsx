import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/favoritos")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/inbox" });
  },
});
