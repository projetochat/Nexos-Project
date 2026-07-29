import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento")({
  head: () => ({ meta: [{ title: "Central de Atendimento · Nexo" }] }),
  component: () => <Outlet />,
});
