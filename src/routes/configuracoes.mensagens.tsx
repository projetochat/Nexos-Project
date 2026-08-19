import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/configuracoes/mensagens")({
  component: () => <Navigate to="/automacoes" replace />,
});
