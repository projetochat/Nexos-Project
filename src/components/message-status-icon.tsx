import { Check, CheckCheck, Clock, CircleAlert } from "lucide-react";
import type { ApiMessage } from "@/lib/trixus-api";

export function MessageStatusIcon({
  status,
  onRetry,
}: {
  status: ApiMessage["status"];
  onRetry?: () => void;
}) {
  const label =
    status === "read"
      ? "Lida"
      : status === "delivered"
        ? "Entregue"
        : status === "sent"
          ? "Enviada"
          : status === "failed"
            ? "Falha no envio"
            : "Enviando";
  const Icon =
    status === "read" || status === "delivered"
      ? CheckCheck
      : status === "sent"
        ? Check
        : status === "failed"
          ? CircleAlert
          : Clock;
  const content = (
    <span className="ml-1 inline-flex align-middle" role="img" aria-label={label} title={label}>
      <Icon
        aria-hidden="true"
        className={`h-4 w-4 ${status === "read" ? "text-sky-300" : status === "failed" ? "text-red-300" : "text-slate-300"}`}
      />
    </span>
  );
  if (status !== "failed" || !onRetry) return content;
  return (
    <button
      type="button"
      className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-red-500"
      aria-label="Falha no envio. Reenviar mensagem"
      title="Reenviar mensagem"
      onClick={(event) => {
        event.stopPropagation();
        onRetry();
      }}
    >
      {content}
    </button>
  );
}
