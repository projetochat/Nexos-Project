import { Check, CheckCheck, Clock, CircleAlert } from "lucide-react";
import type { ApiMessage } from "@/lib/trixus-api";

export function MessageStatusIcon({ status }: { status: ApiMessage["status"] }) {
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
  return (
    <span className="ml-1 inline-flex align-middle" role="img" aria-label={label} title={label}>
      <Icon
        aria-hidden="true"
        className={`h-4 w-4 ${status === "read" ? "text-sky-300" : status === "failed" ? "text-red-300" : "text-slate-300"}`}
      />
    </span>
  );
}
