import { Phone } from "lucide-react";
import { Button } from "@/components/ui-kit";

export const CALL_UNAVAILABLE_MESSAGE = "Ligações disponíveis apenas p/ API Oficial do Whastapp";

export function ConversationCallButton({
  enabled,
  onClick,
}: {
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!enabled}
      onClick={onClick}
      aria-label="Ligação"
      title={enabled ? "Ligação" : "Disponível apenas em conversas ativas"}
      className="group hover:!border-emerald-500 hover:!bg-emerald-50 hover:!text-emerald-700 focus-visible:!border-emerald-500 focus-visible:!bg-emerald-50 focus-visible:!text-emerald-700 dark:hover:!bg-emerald-950 dark:hover:!text-emerald-300 dark:focus-visible:!bg-emerald-950 dark:focus-visible:!text-emerald-300"
    >
      <Phone className="h-3.5 w-3.5 transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-300" />
      <span className="hidden lg:inline">Ligação</span>
    </Button>
  );
}
