import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: () => <Outlet />,
});
