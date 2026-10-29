import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui-kit";
import {
  taskManagementApi,
  taskDateTimeToIso,
  taskLocalDateTime,
  type ManagedTask,
  type TaskInput,
  type TaskOptions,
  type TaskFilterFields,
  type TaskSmtp,
  type TaskCapabilities,
  type TaskSettings,
  type TaskRecurrence,
} from "@/lib/task-management";
import { sanitizeServiceHourDraft, formatServiceHourDraft } from "@/lib/time-input";
import { TaskAudienceEditor } from "./task-audience-editor";
import { TaskRecurrenceEditor } from "./task-recurrence-editor";
import { TaskChannelsEditor } from "./task-channels-editor";
import { TaskError } from "./task-ui";
import {
  taskPriorityLabels,
  taskStatusLabels,
  taskTypeLabels,
  taskFrequencyLabels,
} from "./task-labels";

function initialInput(options: TaskOptions, settings: TaskSettings): TaskInput {
  return {
    title: "",
    description: "",
    type: "task",
    assignedMembershipId: "",
    priority: "medium",
    status: "active",
    recurrence: {
      frequency: "once",
      interval: 1,
      unit: "day",
      weekdays: [],
      monthDays: [],
      startAt: new Date(Date.now() + 3600000).toISOString(),
      timezone: settings.timezone || options.timezone,
    },
    audience: {
      mode: "contacts",
      selection: "fixed",
      contactIds: [],
      groupIds: [],
      conditions: [],
    },
    channels: {
      popup: false,
      bell: false,
      whatsapp: {
        enabled: false,
        connectionId: "",
        message: "",
        leadMinutes: settings.defaultLeadMinutes,
        recipientMode: "audience",
      },
      email: {
        enabled: false,
        smtpAccountId: settings.defaultSmtpAccountId ?? "",
        subject: "",
        body: "",
        leadMinutes: settings.defaultLeadMinutes,
        recipientMode: "audience",
        membershipIds: [],
      },
    },
  };
}
export function TaskWizard({
  initial,
  options,
  fields,
  smtp,
  settings,
  capabilities,
  canSend,
  readOnly = false,
  duplicate = false,
  onClose,
  onSaved,
}: {
  initial?: ManagedTask;
  options: TaskOptions;
  fields: TaskFilterFields;
  smtp: TaskSmtp[];
  settings: TaskSettings;
  capabilities: TaskCapabilities;
  canSend: boolean;
  readOnly?: boolean;
  duplicate?: boolean;
  onClose: () => void;
  onSaved: (task: ManagedTask) => void;
}) {
  const [form, setForm] = React.useState<TaskInput>(() =>
    initial
      ? {
          ...initial,
          ...(duplicate
            ? {
                title: `${initial.title} — Cópia`,
                status: "paused" as const,
                recurrence: {
                  ...initial.recurrence,
                  startAt: new Date(Date.now() + 3600000).toISOString(),
                },
              }
            : {}),
        }
      : initialInput(options, settings),
  );
  const [startLocal, setStartLocal] = React.useState(() =>
    taskLocalDateTime(form.recurrence.startAt, form.recurrence.timezone),
  );
  const [endLocal, setEndLocal] = React.useState(() =>
    form.recurrence.endAt ? taskLocalDateTime(form.recurrence.endAt, form.recurrence.timezone) : "",
  );
  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<unknown>(null);
  const buildRecurrence = (): TaskRecurrence => {
    const preserveStart =
      initial &&
      !duplicate &&
      form.recurrence.timezone === initial.recurrence.timezone &&
      startLocal === taskLocalDateTime(initial.recurrence.startAt, initial.recurrence.timezone);
    const preserveEnd =
      initial?.recurrence.endAt &&
      form.recurrence.timezone === initial.recurrence.timezone &&
      endLocal === taskLocalDateTime(initial.recurrence.endAt, initial.recurrence.timezone);
    const recurrence = {
      ...form.recurrence,
      startAt: preserveStart
        ? initial.recurrence.startAt
        : taskDateTimeToIso(startLocal, form.recurrence.timezone),
      endAt: endLocal
        ? preserveEnd
          ? initial!.recurrence.endAt
          : taskDateTimeToIso(endLocal, form.recurrence.timezone)
        : undefined,
    };
    if (form.recurrence.endAt && !endLocal) throw Error("Informe a data de encerramento.");
    if (
      !initial ||
      duplicate ||
      JSON.stringify(recurrence) !== JSON.stringify(initial.recurrence)
    ) {
      if (new Date(recurrence.startAt).getTime() <= Date.now())
        throw Error("A primeira execução deve estar no futuro.");
    }
    if (!Number.isInteger(recurrence.interval) || recurrence.interval < 1)
      throw Error("Informe um intervalo maior que zero.");
    if (recurrence.endAt && Date.parse(recurrence.endAt) < Date.parse(recurrence.startAt))
      throw Error("O término não pode anteceder o início.");
    if (
      recurrence.maxOccurrences !== undefined &&
      (!Number.isInteger(recurrence.maxOccurrences) || recurrence.maxOccurrences < 1)
    )
      throw Error("A quantidade de execuções deve ser maior que zero.");
    return recurrence;
  };
  const validateGeneral = () => {
    if (!form.title.trim()) throw Error("Informe o título.");
    if (!form.assignedMembershipId) throw Error("Selecione o responsável.");
    buildRecurrence();
  };
  const save = useMutation({
    mutationFn: async () => {
      validateGeneral();
      const payload = { ...form, title: form.title.trim(), recurrence: buildRecurrence() };
      if ((payload.channels.whatsapp.enabled || payload.channels.email.enabled) && !canSend)
        throw Error("Seu perfil não permite envios externos.");
      if (
        payload.channels.whatsapp.enabled &&
        (!payload.channels.whatsapp.connectionId || !payload.channels.whatsapp.message.trim())
      )
        throw Error("Informe a instância e a mensagem do WhatsApp.");
      if (
        payload.channels.email.enabled &&
        (!payload.channels.email.smtpAccountId ||
          !payload.channels.email.subject.trim() ||
          !payload.channels.email.body.trim())
      )
        throw Error("Informe a conta SMTP, o assunto e o corpo do e-mail.");
      return initial && !duplicate
        ? taskManagementApi.update(initial.id, { ...payload, version: initial.version })
        : taskManagementApi.create(payload);
    },
    onSuccess: onSaved,
  });
  const next = () => {
    try {
      setError(null);
      if (step === 0) validateGeneral();
      if (step === 2) buildRecurrence();
      setStep((current) => Math.min(3, current + 1));
    } catch (cause) {
      setError(cause);
    }
  };
  const busy = save.isPending;
  const disabled = readOnly || busy;
  const update = (patch: Partial<TaskInput>) => {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  };
  const stepNames = ["Dados gerais", "Destinatários", "Periodicidade", "Notificações"];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">
          {readOnly
            ? "Detalhes da tarefa"
            : initial && !duplicate
              ? "Editar tarefa"
              : "Novo agendamento"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "Consulte os dados e os canais configurados."
            : "Configure os dados, os destinatários e os avisos."}
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Etapas do agendamento">
        {stepNames.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              disabled={busy || (!readOnly && index > step)}
              onClick={() => setStep(index)}
              aria-current={step === index ? "step" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-3 text-left text-sm ${step === index ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2">
                {index + 1}
              </span>
              {name}
            </button>
          </li>
        ))}
      </ol>
      {!capabilities.workerEnabled && (
        <Alert tone="warning" title="Execução automática aguardando ativação">
          Você pode salvar a configuração. Avisos automáticos só serão processados após a ativação
          da execução.
        </Alert>
      )}
      <TaskError error={error || save.error} />
      <div
        className={
          step === 0
            ? "grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]"
            : ""
        }
      >
        {step === 0 && (
          <>
            <Card>
              <h3 className="mb-4 font-semibold">Dados gerais</h3>
              <div className="space-y-4">
                <Field label="Título do agendamento *">
                  <Input
                    aria-label="Título do agendamento"
                    disabled={disabled}
                    value={form.title}
                    onChange={(event) => update({ title: event.target.value })}
                  />
                </Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Tipo *</legend>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {Object.entries(taskTypeLabels).map(([type, label]) => (
                      <Button
                        key={type}
                        disabled={disabled}
                        variant={form.type === type ? "primary" : "outline"}
                        onClick={() => update({ type: type as TaskInput["type"] })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Responsável *">
                    <Select
                      aria-label="Responsável"
                      value={form.assignedMembershipId}
                      disabled={disabled}
                      onChange={(event) => update({ assignedMembershipId: event.target.value })}
                    >
                      <option value="">Selecione</option>
                      {options.memberships.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Prioridade *">
                    <Select
                      aria-label="Prioridade"
                      disabled={disabled}
                      value={form.priority}
                      onChange={(event) =>
                        update({ priority: event.target.value as TaskInput["priority"] })
                      }
                    >
                      {Object.entries(taskPriorityLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Descrição">
                  <Textarea
                    disabled={disabled}
                    value={form.description}
                    onChange={(event) => update({ description: event.target.value })}
                    rows={4}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Data inicial *">
                    <Input
                      aria-label="Data inicial"
                      type="date"
                      disabled={disabled}
                      value={startLocal.split("T")[0] ?? ""}
                      onChange={(event) =>
                        setStartLocal(`${event.target.value}T${startLocal.split("T")[1] ?? ""}`)
                      }
                    />
                  </Field>
                  <Field label="Horário *">
                    <Input
                      aria-label="Horário"
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="00:00"
                      disabled={disabled}
                      value={startLocal.split("T")[1] ?? ""}
                      onChange={(event) =>
                        setStartLocal(
                          `${startLocal.split("T")[0]}T${sanitizeServiceHourDraft(event.target.value)}`,
                        )
                      }
                      onBlur={(event) =>
                        setStartLocal(
                          `${startLocal.split("T")[0]}T${formatServiceHourDraft(event.target.value)}`,
                        )
                      }
                    />
                  </Field>
                  <Field label="Situação inicial">
                    <Select
                      disabled={disabled}
                      value={form.status}
                      onChange={(event) =>
                        update({ status: event.target.value as TaskInput["status"] })
                      }
                    >
                      {["active", "paused", "completed"].map((status) => (
                        <option key={status} value={status}>
                          {status === "completed" ? "Série concluída" : taskStatusLabels[status]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Fuso horário">
                  <Input
                    aria-label="Fuso horário"
                    disabled={disabled}
                    value={form.recurrence.timezone}
                    onChange={(event) =>
                      update({ recurrence: { ...form.recurrence, timezone: event.target.value } })
                    }
                  />
                </Field>
              </div>
            </Card>
            <Card className="border-primary/20 bg-primary/5">
              <h3 className="mb-4 font-semibold">Resumo</h3>
              <dl className="space-y-3 text-sm">
                {[
                  ["Título", form.title || "Não informado"],
                  ["Tipo", taskTypeLabels[form.type]],
                  [
                    "Responsável",
                    options.memberships.find((item) => item.id === form.assignedMembershipId)
                      ?.name || "Não informado",
                  ],
                  ["Prioridade", taskPriorityLabels[form.priority]],
                  [
                    "Data e horário",
                    `${startLocal.split("T")[0]?.split("-").reverse().join("/")} ${startLocal.split("T")[1] ?? ""}`,
                  ],
                  ["Periodicidade", taskFrequencyLabels[form.recurrence.frequency]],
                  ["Situação", taskStatusLabels[form.status]],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </>
        )}
        {step === 1 && (
          <TaskAudienceEditor
            value={form.audience}
            onChange={(audience) => update({ audience })}
            options={options}
            fields={fields}
            connectionId={form.channels.whatsapp.connectionId || undefined}
            disabled={disabled}
          />
        )}
        {step === 2 && (
          <TaskRecurrenceEditor
            value={form.recurrence}
            onChange={(recurrence) => update({ recurrence })}
            endLocal={endLocal}
            onEndLocalChange={setEndLocal}
            buildRecurrence={buildRecurrence}
            disabled={disabled}
          />
        )}
        {step === 3 && (
          <TaskChannelsEditor
            value={form.channels}
            onChange={(channels) => update({ channels })}
            options={options}
            smtp={smtp}
            capabilities={capabilities}
            canSend={canSend}
            settings={settings}
            disabled={disabled}
          />
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
        <Button disabled={busy} onClick={step ? () => setStep((current) => current - 1) : onClose}>
          {step ? "Voltar" : "Cancelar"}
        </Button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button disabled={busy} onClick={onClose}>
              Fechar
            </Button>
          )}
          {step < 3 ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={readOnly ? () => setStep((current) => current + 1) : next}
            >
              {readOnly ? "Próxima etapa" : "Avançar"}
            </Button>
          ) : (
            !readOnly && (
              <Button variant="primary" disabled={busy} onClick={() => save.mutate()}>
                {busy ? "Salvando..." : "Salvar agendamento"}
              </Button>
            )
          )}
        </div>
      </div>
      {!readOnly && (
        <p className="text-xs text-muted-foreground">
          Os dados são gravados somente ao finalizar. Canais externos só serão executados quando
          explicitamente habilitados.
        </p>
      )}
    </div>
  );
}
