import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/perfil")({
  head: () => ({ meta: [{ title: "Perfil · Central de Atendimento" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/perfil" });
  },
});
