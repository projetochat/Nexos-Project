import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox" });
  },
});

