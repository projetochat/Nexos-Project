import {
  CalendarClock,
  Camera,
  ContactRound,
  EllipsisVertical,
  Paperclip,
  Ticket,
  Zap,
} from "lucide-react";
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
  onSchedule,
}: {
  disabled: boolean;
  allowQuickReplies: boolean;
  ticketDisabled: boolean;
  onQuickReplies: () => void;
  onAttach: () => void;
  onCamera: () => void;
  onContact: () => void;
  onTicket?: () => void;
  onSchedule?: () => void;
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
          <DropdownMenuItem
            className="group/action min-h-11"
            disabled={disabled}
            onSelect={onQuickReplies}
          >
            <Zap className="transition-colors group-data-[highlighted]/action:text-amber-600 dark:group-data-[highlighted]/action:text-amber-400" />
            Mensagens rápidas
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="group/action min-h-11" disabled={disabled} onSelect={onAttach}>
          <Paperclip className="transition-colors group-data-[highlighted]/action:text-violet-600 dark:group-data-[highlighted]/action:text-violet-400" />
          Anexos
        </DropdownMenuItem>
        <DropdownMenuItem className="group/action min-h-11" disabled={disabled} onSelect={onCamera}>
          <Camera className="transition-colors group-data-[highlighted]/action:text-sky-600 dark:group-data-[highlighted]/action:text-sky-400" />
          Câmera
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group/action min-h-11"
          disabled={disabled}
          onSelect={onContact}
        >
          <ContactRound className="transition-colors group-data-[highlighted]/action:text-teal-600 dark:group-data-[highlighted]/action:text-teal-400" />
          Contato
        </DropdownMenuItem>
        {onTicket && (
          <DropdownMenuItem
            className="group/action min-h-11"
            disabled={ticketDisabled}
            onSelect={onTicket}
          >
            <Ticket className="transition-colors group-data-[highlighted]/action:text-orange-600 dark:group-data-[highlighted]/action:text-orange-400" />
            Gerar Chamado
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="group/action min-h-11"
          disabled={disabled}
          onSelect={() => onSchedule?.()}
        >
          <CalendarClock className="transition-colors group-data-[highlighted]/action:text-indigo-600 dark:group-data-[highlighted]/action:text-indigo-400" />
          Agendar mensagem
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
