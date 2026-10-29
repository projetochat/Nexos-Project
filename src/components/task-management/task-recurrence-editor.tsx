import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Card, Field, Input, Select } from "@/components/ui-kit";
import { taskManagementApi, type TaskRecurrence } from "@/lib/task-management";
import { TaskCheck, TaskError } from "./task-ui";
import { taskDate, taskFrequencyLabels } from "./task-labels";
export function TaskRecurrenceEditor({
  value,
  onChange,
  endLocal,
  onEndLocalChange,
  buildRecurrence,
  disabled = false,
}: {
  value: TaskRecurrence;
  onChange: (value: TaskRecurrence) => void;
  endLocal: string;
  onEndLocalChange: (value: string) => void;
  buildRecurrence: () => TaskRecurrence;
  disabled?: boolean;
}) {
  const [ending, setEnding] = React.useState<"never" | "date" | "count">(
    value.endAt ? "date" : value.maxOccurrences ? "count" : "never",
  );
  const preview = useMutation({
    mutationFn: async () => {
      const recurrence = buildRecurrence();
      return {
        ...(await taskManagementApi.recurrencePreview(recurrence)),
        snapshot: JSON.stringify(recurrence),
      };
    },
  });
  let currentSnapshot = "";
  try {
    currentSnapshot = JSON.stringify(buildRecurrence());
  } catch {
    /* Invalid drafts are reported when requesting a preview or saving. */
  }
  const update = (patch: Partial<TaskRecurrence>) => {
    preview.reset();
    onChange({ ...value, ...patch });
  };
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(17rem,1fr)]">
      <Card>
        <h3 className="mb-3 font-semibold">Periodicidade</h3>
        <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
          {Object.entries(taskFrequencyLabels).map(([frequency, label]) => (
            <Button
              key={frequency}
              disabled={disabled}
              variant={value.frequency === frequency ? "primary" : "outline"}
              onClick={() =>
                update({
                  frequency: frequency as TaskRecurrence["frequency"],
                  interval: frequency === "once" ? 1 : value.interval,
                })
              }
            >
              {label}
            </Button>
          ))}
        </div>
        {value.frequency !== "once" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="A cada">
              <Input
                type="number"
                min={1}
                max={10000}
                value={value.interval}
                disabled={disabled}
                onChange={(event) => update({ interval: Number(event.target.value) })}
              />
            </Field>
            {value.frequency === "custom" && (
              <Field label="Unidade">
                <Select
                  value={value.unit ?? "day"}
                  disabled={disabled}
                  onChange={(event) =>
                    update({ unit: event.target.value as TaskRecurrence["unit"] })
                  }
                >
                  <option value="day">Dia(s)</option>
                  <option value="week">Semana(s)</option>
                  <option value="month">Mês(es)</option>
                  <option value="year">Ano(s)</option>
                </Select>
              </Field>
            )}
          </div>
        )}
        {(value.frequency === "weekly" ||
          (value.frequency === "custom" && value.unit === "week")) && (
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">Dias da semana</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map(
                (day, index) => (
                  <TaskCheck
                    key={day}
                    label={day}
                    checked={value.weekdays.includes(index)}
                    disabled={disabled}
                    onChange={(checked) =>
                      update({
                        weekdays: checked
                          ? [...value.weekdays, index]
                          : value.weekdays.filter((item) => item !== index),
                      })
                    }
                  />
                ),
              )}
            </div>
          </fieldset>
        )}
        {(value.frequency === "monthly" ||
          (value.frequency === "custom" && value.unit === "month")) && (
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">Dias do mês</legend>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <TaskCheck
                  key={day}
                  label={String(day)}
                  checked={value.monthDays.includes(day)}
                  disabled={disabled}
                  onChange={(checked) =>
                    update({
                      monthDays: checked
                        ? [...value.monthDays, day]
                        : value.monthDays.filter((item) => item !== day),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <Field label="Encerramento">
            <Select
              value={ending}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value as typeof ending;
                setEnding(next);
                onEndLocalChange("");
                update({
                  endAt: next === "date" ? "pending" : undefined,
                  maxOccurrences: next === "count" ? 1 : undefined,
                });
              }}
            >
              <option value="never">Nunca termina</option>
              <option value="date">Termina em uma data</option>
              <option value="count">Termina após quantidade de execuções</option>
            </Select>
          </Field>
          {ending === "date" && (
            <Field label="Data e hora de encerramento">
              <Input
                type="datetime-local"
                disabled={disabled}
                value={endLocal}
                onChange={(event) => {
                  preview.reset();
                  onEndLocalChange(event.target.value);
                  update({ endAt: value.endAt ?? "pending" });
                }}
              />
            </Field>
          )}
          {ending === "count" && (
            <Field label="Quantidade de execuções">
              <Input
                type="number"
                min={1}
                max={1000000}
                disabled={disabled}
                value={value.maxOccurrences ?? 1}
                onChange={(event) => update({ maxOccurrences: Number(event.target.value) })}
              />
            </Field>
          )}
        </div>
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Próximas execuções</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Fuso horário: {value.timezone}. Datas calculadas pelo servidor.
        </p>
        <Button disabled={disabled || preview.isPending} onClick={() => preview.mutate()}>
          Atualizar prévia das datas
        </Button>
        <TaskError error={preview.error} />
        <ol className="mt-3 divide-y divide-border">
          {preview.data?.snapshot === currentSnapshot &&
            preview.data.dates.map((date) => (
              <li key={date} className="py-2 text-sm">
                {taskDate(date, value.timezone)}
              </li>
            ))}
        </ol>
      </Card>
    </div>
  );
}
