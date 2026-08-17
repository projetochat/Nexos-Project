import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/historico")({
  head: () => ({ meta: [{ title: "Historico · Central de Atendimento" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/historico" });
  },
});
