import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TimezoneOption = {
  value: string;
  displayName: string;
  abbreviation: string;
  offset: string;
  gmt: string;
};

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  {
    value: "America/Sao_Paulo",
    displayName: "America/São Paulo",
    abbreviation: "BRT",
    offset: "-03:00",
    gmt: "GMT-3",
  },
  {
    value: "America/Manaus",
    displayName: "America/Manaus",
    abbreviation: "AMT",
    offset: "-04:00",
    gmt: "GMT-4",
  },
  {
    value: "America/Rio_Branco",
    displayName: "America/Rio Branco",
    abbreviation: "ACT",
    offset: "-05:00",
    gmt: "GMT-5",
  },
  {
    value: "America/Fortaleza",
    displayName: "America/Fortaleza",
    abbreviation: "BRT",
    offset: "-03:00",
    gmt: "GMT-3",
  },
  {
    value: "America/Noronha",
    displayName: "America/Fernando de Noronha",
    abbreviation: "FNT",
    offset: "-02:00",
    gmt: "GMT-2",
  },
  {
    value: "UTC",
    displayName: "UTC",
    abbreviation: "UTC",
    offset: "+00:00",
    gmt: "GMT+0",
  },
];

export function timezoneDisplayLabel(value: string) {
  const option = TIMEZONE_OPTIONS.find((item) => item.value === value);
  return option ? `${option.displayName} (${option.gmt})` : value;
}

export function TimezoneSelect({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left text-sm outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          aria-label="Selecionar fuso horário"
        >
          <span className="min-w-0 truncate">{timezoneDisplayLabel(value)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[18rem] max-w-[calc(100vw-2rem)] p-1.5"
      >
        {TIMEZONE_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onChange(option.value)}
              className={cn(
                "relative min-h-14 items-start rounded-md py-2 pl-4 pr-9",
                selected && "bg-accent/15",
              )}
            >
              {selected && (
                <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">
                  {option.displayName}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {option.abbreviation} {option.offset}
                  <span className="px-2">·</span>
                  {formatTimezoneTime(now, option.value)}
                </span>
              </span>
              {selected && <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatTimezoneTime(date: Date | null, timeZone: string) {
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
