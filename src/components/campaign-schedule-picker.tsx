import * as React from "react";
import { CalendarClock } from "lucide-react";
import { Button, Field, Input } from "./ui-kit";
import { displayDateTime } from "@/lib/format";
import { scheduleDateSuggestions, toLocalDateTimeInput } from "@/lib/schedule-message";
import { formatServiceHourDraft, sanitizeServiceHourDraft } from "@/lib/time-input";

type CampaignSchedulePickerProps = {
  /** Local datetime or the current partial/invalid draft; empty means no scheduled date. */
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
};

function validFutureDateTime(date: string, time: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const value = `${date}T${time}`;
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed > now &&
    toLocalDateTimeInput(parsed.toISOString()) === value
  );
}

export function CampaignSchedulePicker({
  value,
  onChange,
  onValidityChange,
  disabled = false,
}: CampaignSchedulePickerProps) {
  const [date, setDate] = React.useState(() => value.split("T")[0] ?? "");
  const [time, setTime] = React.useState(() => value.split("T")[1] ?? "");
  const [custom, setCustom] = React.useState(Boolean(value));
  const [clock, setClock] = React.useState(() => new Date());
  const [selectionError, setSelectionError] = React.useState("");
  const suggestions = React.useMemo(() => scheduleDateSuggestions(clock), [clock]);
  const empty = !date && !time;
  const valid = empty || validFutureDateTime(date, time, new Date());

  React.useEffect(() => {
    const [nextDate = "", nextTime = ""] = value.split("T");
    setDate(nextDate);
    setTime(nextTime);
  }, [value]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  React.useEffect(() => onValidityChange?.(valid), [onValidityChange, valid]);

  const update = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    setSelectionError("");
    onChange(nextDate || nextTime ? `${nextDate}T${nextTime}` : "");
  };
  const choose = (suggestion: Date) => {
    if (suggestion.getTime() <= Date.now()) {
      setClock(new Date());
      setSelectionError("Escolha um horário futuro.");
      return;
    }
    const [nextDate, nextTime] = toLocalDateTimeInput(suggestion.toISOString()).split("T");
    update(nextDate, nextTime);
    setCustom(false);
  };

  return (
    <Field label="Data e horário" asLabel={false}>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sugestões de horário">
        {suggestions.map((suggestion) => {
          const nextValue = toLocalDateTimeInput(suggestion.toISOString());
          return (
            <button
              key={nextValue}
              type="button"
              disabled={disabled}
              aria-pressed={!custom && value === nextValue}
              aria-label={displayDateTime(suggestion.toISOString())}
              title={displayDateTime(suggestion.toISOString())}
              className={`flex min-w-0 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${!custom && value === nextValue ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-surface-2"}`}
              onClick={() => choose(suggestion)}
            >
              <span className="min-w-0 truncate">
                {suggestion
                  .toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "2-digit",
                  })
                  .replace(",", "")}
              </span>
              <span className="shrink-0 font-medium">{nextValue.slice(11)}</span>
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          aria-expanded={custom}
          className={`flex min-w-0 w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${custom ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-surface-2"}`}
          onClick={() => {
            if (empty && suggestions[0]) choose(suggestions[0]);
            setCustom(true);
            setSelectionError("");
          }}
        >
          <CalendarClock className="h-4 w-4 shrink-0" />
          Escolher data e hora
        </button>
      </div>
      {custom && (
        <div className="mt-3 grid min-w-0 grid-cols-2 gap-3">
          <Field label="Data">
            <Input
              type="date"
              aria-label="Data do agendamento"
              value={date}
              disabled={disabled}
              aria-invalid={!valid}
              onChange={(event) => update(event.target.value, time)}
              className="block w-full min-w-0 max-w-full bg-card"
            />
          </Field>
          <Field label="Hora">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="00:00"
              maxLength={5}
              aria-label="Hora do agendamento"
              value={time}
              disabled={disabled}
              aria-invalid={!valid}
              onChange={(event) => update(date, sanitizeServiceHourDraft(event.target.value))}
              onBlur={(event) => update(date, formatServiceHourDraft(event.target.value))}
              className="block w-full min-w-0 max-w-full bg-card"
            />
          </Field>
        </div>
      )}
      {(selectionError || !valid) && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {selectionError || "Informe uma data e um horário válidos no futuro."}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {empty
            ? "Sem data: rascunho."
            : valid
              ? displayDateTime(`${date}T${time}`)
              : "Data e horário inválidos"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || empty}
          onClick={() => {
            update("", "");
            setCustom(false);
          }}
        >
          Limpar
        </Button>
      </div>
    </Field>
  );
}
