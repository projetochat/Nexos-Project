import { isEmail } from "class-validator";
import { BadRequestException } from "@nestjs/common";
import { validateTaskRecurrence, TaskRecurrenceError } from "./task-recurrence";
import type { TaskInput, TaskSmtpInput, TaskSettings } from "./task-contract";
import { email } from "./task-smtp";
function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Objeto de configuração inválido.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new BadRequestException("Campo de configuração desconhecido.");
}
function text(value: unknown, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()))
    throw new BadRequestException("Texto obrigatório ou acima do limite permitido.");
  return value.trim();
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T))
    throw new BadRequestException("Opção de configuração inválida.");
  return value as T;
}
function bool(value: unknown) {
  if (typeof value !== "boolean") throw new BadRequestException("Opção deve ser Sim ou Não.");
  return value;
}
function minutes(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 43200)
    throw new BadRequestException("Antecedência deve estar entre 0 e 43200 minutos.");
  return Number(value);
}
function ids(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 2000 ||
    value.some((id) => typeof id !== "string" || !id || id.length > 191)
  )
    throw new BadRequestException("Identificadores de destinatários inválidos.");
  return [...new Set(value)] as string[];
}
export function normalizeTaskInput(value: unknown, existing?: TaskInput): TaskInput {
  const row = object(value);
  const allowed = [
    "title",
    "description",
    "type",
    "assignedMembershipId",
    "priority",
    "status",
    "recurrence",
    "audience",
    "channels",
    "legacyOrigin",
    "version",
  ];
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new BadRequestException("Campo de tarefa desconhecido.");
  const recurrence = object(row.recurrence) as unknown as TaskInput["recurrence"];
  keys(recurrence as unknown as Record<string, unknown>, [
    "frequency",
    "interval",
    "unit",
    "weekdays",
    "monthDays",
    "startAt",
    "timezone",
    "endAt",
    "maxOccurrences",
  ]);
  const recurrenceKey = (r: TaskInput["recurrence"]) =>
    JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))));
  try {
    validateTaskRecurrence(
      recurrence,
      !existing || recurrenceKey(recurrence) !== recurrenceKey(existing.recurrence)
        ? { now: new Date(), requireFuture: true }
        : {},
    );
  } catch (error) {
    if (error instanceof TaskRecurrenceError) throw new BadRequestException(error.message);
    throw error;
  }
  const audience = object(row.audience);
  const channels = object(row.channels);
  const whatsapp = object(channels.whatsapp);
  const smtp = object(channels.email);
  keys(audience, ["mode", "selection", "contactIds", "groupIds", "conditions"]);
  keys(channels, ["popup", "bell", "whatsapp", "email"]);
  keys(whatsapp, ["enabled", "connectionId", "message", "leadMinutes", "recipientMode"]);
  keys(smtp, [
    "enabled",
    "smtpAccountId",
    "subject",
    "body",
    "leadMinutes",
    "recipientMode",
    "membershipIds",
  ]);
  const waEnabled = bool(whatsapp.enabled);
  const emailEnabled = bool(smtp.enabled);
  const waMode = choice(whatsapp.recipientMode ?? "audience", [
    "audience",
    "responsible",
    "both",
  ] as const);
  if (waEnabled && waMode !== "audience")
    throw new BadRequestException(
      "WhatsApp do responsável exige telefone explícito: selecione um contato autorizado.",
    );
  const conditions = audience.conditions ?? [];
  if (!Array.isArray(conditions) || conditions.length > 30)
    throw new BadRequestException("Filtros inválidos.");
  for (const condition of conditions) {
    const c = object(condition);
    keys(c, ["field", "operator", "value"]);
    if (
      c.value !== undefined &&
      !(
        typeof c.value === "string" ||
        typeof c.value === "boolean" ||
        (typeof c.value === "number" && Number.isFinite(c.value)) ||
        (Array.isArray(c.value) &&
          c.value.length <= 100 &&
          c.value.every(
            (v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v)),
          ))
      )
    )
      throw new BadRequestException("Valor de filtro inválido.");
    text(c.field, 200, true);
    choice(c.operator, [
      "contains",
      "eq",
      "neq",
      "gt",
      "lt",
      "between",
      "in",
      "checked",
      "unchecked",
    ]);
    if (JSON.stringify(c.value ?? null).length > 4000)
      throw new BadRequestException("Valor de filtro acima do limite.");
  }
  return {
    title: text(row.title, 200, true),
    description: text(row.description ?? "", 10000),
    type: choice(row.type, ["task", "reminder", "whatsapp", "email"]),
    assignedMembershipId: text(row.assignedMembershipId, 191, true),
    priority: choice(row.priority, ["low", "medium", "high"]),
    status: choice(row.status ?? "active", ["active", "paused", "completed"]),
    recurrence,
    audience: {
      mode: choice(audience.mode, ["contacts", "groups", "filters"]),
      selection: choice(audience.selection, ["fixed", "dynamic"]),
      contactIds: ids(audience.contactIds ?? []),
      groupIds: ids(audience.groupIds ?? []),
      conditions: conditions as TaskInput["audience"]["conditions"],
    },
    channels: {
      popup: bool(channels.popup),
      bell: bool(channels.bell),
      whatsapp: {
        enabled: waEnabled,
        connectionId: text(whatsapp.connectionId ?? "", 191, waEnabled),
        message: text(whatsapp.message ?? "", 4000, waEnabled),
        leadMinutes: minutes(whatsapp.leadMinutes ?? 0),
        recipientMode: waMode,
      },
      email: {
        enabled: emailEnabled,
        smtpAccountId: text(smtp.smtpAccountId ?? "", 191),
        subject: text(smtp.subject ?? "", 200, emailEnabled),
        body: text(smtp.body ?? "", 10000, emailEnabled),
        leadMinutes: minutes(smtp.leadMinutes ?? 0),
        recipientMode: choice(smtp.recipientMode ?? "audience", [
          "audience",
          "responsible",
          "both",
        ] as const),
        membershipIds: ids(smtp.membershipIds ?? []),
      },
    },
    legacyOrigin: existing?.legacyOrigin ?? text(row.legacyOrigin ?? "TASKS", 100),
  };
}
export function normalizeTaskSmtp(value: unknown): TaskSmtpInput {
  const row = object(value);
  const host = text(row.host, 253, true).toLowerCase();
  if (
    !/^[a-z0-9.-]+$/.test(host) ||
    !Number.isInteger(row.port) ||
    ![465, 587, 2525].includes(Number(row.port))
  )
    throw new BadRequestException("Servidor ou porta SMTP inválidos.");
  const secure = bool(row.secure);
  if (Number(row.port) === 465 && !secure) throw new BadRequestException("A porta 465 exige TLS.");
  return {
    name: text(row.name, 120, true),
    host,
    port: Number(row.port),
    secure,
    username: text(row.username, 254, true),
    password: row.password === undefined ? undefined : text(row.password, 4096, true),
    fromAddress: email(text(row.fromAddress, 254, true)),
    fromName: text(row.fromName ?? "", 200),
    active: bool(row.active ?? true),
  };
}
export function normalizeTaskSettings(value: unknown): TaskSettings {
  const row = object(value);
  const timezone = text(row.timezone, 120, true);
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException("Fuso horário inválido.");
  }
  return {
    popupEnabled: bool(row.popupEnabled),
    whatsappEnabled: bool(row.whatsappEnabled),
    emailEnabled: bool(row.emailEnabled),
    defaultSmtpAccountId:
      row.defaultSmtpAccountId == null ? null : text(row.defaultSmtpAccountId, 191, true),
    bellEnabled: bool(row.bellEnabled),
    defaultLeadMinutes: minutes(row.defaultLeadMinutes),
    timezone,
  };
}

export function normalizeTaskSmtpTest(value: unknown): import("./task-contract").TaskSmtpTestInput {
  const row = object(value);
  keys(row, ["confirm", "recipient"]);
  if (row.confirm !== true) throw new BadRequestException("Confirme o envio do e-mail de teste.");
  const recipient = text(row.recipient, 254, true);
  if (
    /[;,<>\r\n]/.test(recipient) ||
    !isEmail(recipient, { allow_display_name: false, allow_utf8_local_part: false })
  )
    throw new BadRequestException("Informe um único endereço de e-mail válido.");
  return { confirm: true, recipient };
}
