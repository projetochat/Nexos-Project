import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/empresas")({
  beforeLoad: () => {
    throw redirect({ to: "/clientes" });
  },
});
