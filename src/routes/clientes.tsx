import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/clientes")({
  beforeLoad: () => {
    throw redirect({ to: "/contatos" });
  },
});
