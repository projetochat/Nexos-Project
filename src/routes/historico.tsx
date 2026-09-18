import { createFileRoute } from "@tanstack/react-router";
import { HistoricoPage } from "./-historico-page";

export const Route = createFileRoute("/historico")({ component: HistoricoPage });
