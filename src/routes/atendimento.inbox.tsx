import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/atendimento/inbox")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox" });
  },
});
