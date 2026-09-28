import * as React from "react";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui-kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function MessageVariablesMenu({
  disabled,
  variables,
  onSelect,
}: {
  disabled?: boolean;
  variables: Array<{ token: string; description: string }>;
  onSelect: (token: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          aria-label="Inserir variável"
          title="Inserir variáveis"
        >
          <Braces className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label="Variáveis disponíveis"
        side="top"
        align="start"
        sideOffset={6}
        className="z-[260] max-h-64 w-64 overflow-y-auto p-1"
      >
        <TooltipProvider delayDuration={150}>
          {variables.map(({ token, description }) => (
            <Tooltip key={token}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="block w-full rounded px-3 py-2 text-left font-mono text-xs transition-colors hover:bg-surface-2 hover:text-blue-600 focus-visible:text-blue-600"
                  onClick={() => {
                    onSelect(token);
                    setOpen(false);
                  }}
                  aria-label={`Inserir variável ${token}: ${description}`}
                >
                  {token}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="z-[270] max-w-64">
                {description}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
