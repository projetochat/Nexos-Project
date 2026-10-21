import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
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

const TIMEZONE_OPTIONS: TimezoneOption[] = [
  {
    value: "America/Sao_Paulo",
    displayName: "América/São Paulo",
    abbreviation: "BRT",
    offset: "-03:00",
    gmt: "GMT-3",
  },
  {
    value: "America/Manaus",
    displayName: "América/Manaus",
    abbreviation: "AMT",
    offset: "-04:00",
    gmt: "GMT-4",
  },
  {
    value: "America/Rio_Branco",
    displayName: "América/Rio Branco",
    abbreviation: "ACT",
    offset: "-05:00",
    gmt: "GMT-5",
  },
  {
    value: "America/Fortaleza",
    displayName: "América/Fortaleza",
    abbreviation: "BRT",
    offset: "-03:00",
    gmt: "GMT-3",
  },
  {
    value: "America/Noronha",
    displayName: "América/Fernando de Noronha",
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

function timezoneDisplayLabel(value: string) {
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
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [now, setNow] = React.useState<Date | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const filteredOptions = React.useMemo(() => {
    const normalizedSearch = normalizeSearch(search);
    if (!normalizedSearch) return TIMEZONE_OPTIONS;
    return TIMEZONE_OPTIONS.filter((option) =>
      normalizeSearch(
        [option.displayName, option.value, option.abbreviation, option.offset, option.gmt].join(
          " ",
        ),
      ).includes(normalizedSearch),
    );
  }, [search]);

  React.useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
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
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          setOpen(false);
        }}
        className="z-[250] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[18rem] max-w-[calc(100vw-2rem)] p-1.5"
      >
        <div className="relative mb-1.5" onKeyDown={(event) => event.stopPropagation()}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Pesquisar fuso horário"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar fuso horário..."
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        {filteredOptions.map((option) => {
          const selected = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onChange(option.value)}
              className={cn(
                "relative min-h-14 items-start rounded-md py-2 pl-4 pr-9 focus:bg-surface-2 focus:text-foreground data-[highlighted]:bg-surface-2 data-[highlighted]:text-foreground",
                selected && "bg-primary/10",
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
        {filteredOptions.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum fuso horário encontrado.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
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
