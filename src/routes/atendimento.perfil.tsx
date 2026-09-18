import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/perfil")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/perfil" });
  },
});
