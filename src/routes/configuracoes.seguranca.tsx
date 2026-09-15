import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/configuracoes/seguranca")({
  component: () => <Navigate to="/configuracoes/geral" replace />,
});
