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
      className="group"
    >
      <Phone className="h-3.5 w-3.5 transition-colors group-hover:text-blue-500" />
      <span className="hidden lg:inline">Ligação</span>
    </Button>
  );
}
