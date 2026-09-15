import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/clientes")({
  head: () => ({ meta: [{ title: "Clientes · Central de Atendimento" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/clientes" });
  },
});
