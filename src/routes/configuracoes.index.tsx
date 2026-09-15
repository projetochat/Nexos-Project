import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/configuracoes/")({
  component: () => <Navigate to="/configuracoes/empresa" replace />,
});
