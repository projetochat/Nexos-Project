import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/historico")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/historico" });
  },
});
