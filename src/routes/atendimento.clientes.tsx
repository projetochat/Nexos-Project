import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/clientes")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/clientes" });
  },
});
