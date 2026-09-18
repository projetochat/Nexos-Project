import { Camera, ContactRound, EllipsisVertical, Paperclip, Ticket, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

export function InboxMobileActions({
  disabled,
  allowQuickReplies,
  ticketDisabled,
  onQuickReplies,
  onAttach,
  onCamera,
  onContact,
  onTicket,
}: {
  disabled: boolean;
  allowQuickReplies: boolean;
  ticketDisabled: boolean;
  onQuickReplies: () => void;
  onAttach: () => void;
  onCamera: () => void;
  onContact: () => void;
  onTicket: () => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Mais ações"
          title="Mais ações"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <EllipsisVertical className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        {allowQuickReplies && (
          <DropdownMenuItem className="min-h-11" disabled={disabled} onSelect={onQuickReplies}>
            <Zap />
            Mensagens rápidas
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="min-h-11" disabled={disabled} onSelect={onAttach}>
          <Paperclip />
          Anexos
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" disabled={disabled} onSelect={onCamera}>
          <Camera />
          Câmera
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" disabled={disabled} onSelect={onContact}>
          <ContactRound />
          Contato
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" disabled={ticketDisabled} onSelect={onTicket}>
          <Ticket />
          Gerar Chamado
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
