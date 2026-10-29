import { apiRequest } from "./trixus-api";

export type TaskRecurrence = {
  frequency: "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval: number;
  unit?: "day" | "week" | "month" | "year";
  weekdays: number[];
  monthDays: number[];
  startAt: string;
  timezone: string;
  endAt?: string;
  maxOccurrences?: number;
};
export type TaskCondition = {
  field: string;
  operator: "contains" | "eq" | "neq" | "gt" | "lt" | "between" | "in" | "checked" | "unchecked";
  value?: string | number | boolean | string[] | [number, number];
};
export type TaskAudience = {
  mode: "contacts" | "groups" | "filters";
  selection: "fixed" | "dynamic";
  contactIds: string[];
  groupIds: string[];
  conditions: TaskCondition[];
};
export type TaskChannels = {
  popup: boolean;
  bell: boolean;
  whatsapp: {
    enabled: boolean;
    connectionId: string;
    message: string;
    leadMinutes: number;
    recipientMode?: "audience" | "responsible" | "both";
  };
  email: {
    enabled: boolean;
    smtpAccountId: string;
    subject: string;
    body: string;
    leadMinutes: number;
    recipientMode?: "audience" | "responsible" | "both";
    membershipIds?: string[];
  };
};
export type TaskInput = {
  title: string;
  description: string;
  type: "task" | "reminder" | "whatsapp" | "email";
  assignedMembershipId: string;
  priority: "low" | "medium" | "high";
  status: "active" | "paused" | "completed";
  recurrence: TaskRecurrence;
  audience: TaskAudience;
  channels: TaskChannels;
  legacyOrigin?: string;
};
export type ManagedTask = TaskInput & {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  nextDueAt: string | null;
  nextOccurrenceId: string | null;
  assignedName: string | null;
};
export type TaskDelivery = {
  id: string;
  channel: "popup" | "bell" | "whatsapp" | "email";
  destination: string;
  status: "pending" | "processing" | "sent" | "failed" | "ambiguous" | "cancelled";
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};
export type TaskOccurrence = {
  id: string;
  taskId: string;
  taskTitle: string;
  dueAt: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  completedAt: string | null;
  executionError?: string | null;
  createdAt: string;
  taskPriority?: TaskInput["priority"];
  taskType?: TaskInput["type"];
  assignedName?: string | null;
  deliveries: TaskDelivery[];
};
export type TaskSmtp = {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromAddress: string;
  fromName: string;
  active: boolean;
  hasPassword: boolean;
  lastVerifiedAt: string | null;
  validationStatus?: "validated" | "unvalidated";
  lastValidatedAt?: string | null;
  lastTestAcceptedAt?: string | null;
  lastTestReference?: string | null;
  lastTestMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TaskSmtpTestAcceptance = {
  verified: true;
  accepted: true;
  reference: string;
  messageId: string;
  message: string;
  auditRecorded: boolean;
  configurationUnchanged?: boolean;
};
export type TaskSmtpInput = Pick<
  TaskSmtp,
  "name" | "host" | "port" | "secure" | "username" | "fromAddress" | "fromName" | "active"
> & { password?: string };
export type TaskPopup = {
  deliveryId: string;
  occurrenceId: string;
  taskId: string;
  title: string;
  description: string;
  priority: string;
  dueAt: string;
  assignedName?: string | null;
  recipientNames?: string[];
};
export type TaskSettings = {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  defaultSmtpAccountId: string | null;
  popupEnabled: boolean;
  bellEnabled: boolean;
  defaultLeadMinutes: number;
  timezone: string;
};
export type TaskCapabilities = {
  enabled: boolean;
  workerEnabled: boolean;
  smtpConfigured: boolean;
  channels: Array<"popup" | "bell" | "whatsapp" | "email">;
  attachmentsEnabled: boolean;
  whatsappResponsibleSupported?: boolean;
};
export type TaskOptions = {
  memberships: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; connectionId: string }>;
  connections: Array<{ id: string; name: string; status: string }>;
  customers: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  timezone: string;
};
export type TaskFilterField = {
  key: string;
  label: string;
  type: string;
  options?: Array<{ value: string; label: string } | string>;
};
export type TaskFilterFields = { native: TaskFilterField[]; custom: TaskFilterField[] };
export type TaskAudiencePreview = {
  contactCount: number;
  groupCount: number;
  total: number;
  sample: Array<{ id: string; name: string; kind: "contact" | "group" }>;
};
export type TaskPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
export type TaskSummary = {
  active: number;
  today: number;
  paused: number;
  total: number;
  pending: number;
  inProgress: number;
  overdue: number;
  completed: number;
  recurring: number;
  byStatus: Array<{ name: string; total: number }>;
  byPriority: Array<{ name: string; total: number }>;
  upcoming: ManagedTask[];
  overdueTasks: ManagedTask[];
};
export type TaskListFilters = {
  search?: string;
  assignedMembershipId?: string;
  status?: string;
  priority?: string;
  type?: string;
  start?: string;
  end?: string;
  page?: number;
  pageSize?: number;
};
export type TaskOccurrenceFilters = {
  search?: string;
  assignedMembershipId?: string;
  channel?: "popup" | "bell" | "whatsapp" | "email";
  taskId?: string;
  start?: string;
  end?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};
function query(values: object = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.size ? `?${params}` : "";
}
const write = <T>(path: string, method: string, data?: unknown) =>
  apiRequest<T>(path, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
export function taskWritePayload(data: TaskInput): TaskInput {
  return {
    title: data.title,
    description: data.description,
    type: data.type,
    assignedMembershipId: data.assignedMembershipId,
    priority: data.priority,
    status: data.status,
    recurrence: data.recurrence,
    audience: data.audience,
    channels: data.channels,
    ...(data.legacyOrigin ? { legacyOrigin: data.legacyOrigin } : {}),
  };
}
export const taskManagementApi = {
  capabilities: () => apiRequest<TaskCapabilities>("/tasks/capabilities"),
  options: () => apiRequest<TaskOptions>("/tasks/options"),
  filterFields: () => apiRequest<TaskFilterFields>("/tasks/filter-fields"),
  list: (filters: TaskListFilters = {}) =>
    apiRequest<TaskPage<ManagedTask>>(`/tasks${query(filters)}`),
  summary: (filters: TaskListFilters = {}) =>
    apiRequest<TaskSummary>(`/tasks/summary${query(filters)}`),
  get: (id: string) => apiRequest<ManagedTask>(`/tasks/${encodeURIComponent(id)}`),
  create: (data: TaskInput) => write<ManagedTask>("/tasks", "POST", taskWritePayload(data)),
  update: (id: string, data: TaskInput & { version: number }) =>
    write<ManagedTask>(`/tasks/${encodeURIComponent(id)}`, "PATCH", {
      ...taskWritePayload(data),
      version: data.version,
    }),
  duplicate: (id: string, recurrence?: TaskRecurrence) =>
    write<ManagedTask>(
      `/tasks/${encodeURIComponent(id)}/duplicate`,
      "POST",
      recurrence ? { recurrence } : {},
    ),
  pause: (id: string) => write<ManagedTask>(`/tasks/${encodeURIComponent(id)}/pause`, "POST"),
  resume: (id: string) => write<ManagedTask>(`/tasks/${encodeURIComponent(id)}/resume`, "POST"),
  remove: (id: string) => write<{ ok: boolean }>(`/tasks/${encodeURIComponent(id)}`, "DELETE"),
  occurrences: (filters: TaskOccurrenceFilters = {}) =>
    apiRequest<TaskPage<TaskOccurrence>>(`/tasks/occurrences${query(filters)}`),
  materialize: (data: { start: string; end: string; taskId?: string }) =>
    write<{ created: number }>("/tasks/occurrences/materialize", "POST", data),
  popups: () => apiRequest<{ items: TaskPopup[] }>("/tasks/popups"),
  dismissPopup: (id: string) =>
    write<{ dismissed: true }>(`/tasks/popups/${encodeURIComponent(id)}/dismiss`, "POST"),
  history: (filters: TaskOccurrenceFilters = {}) =>
    apiRequest<TaskPage<TaskOccurrence>>(`/tasks/history${query(filters)}`),
  complete: (id: string) =>
    write<TaskOccurrence>(`/tasks/occurrences/${encodeURIComponent(id)}/complete`, "POST"),
  recurrencePreview: (recurrence: TaskRecurrence) =>
    write<{ dates: string[] }>("/tasks/recurrence-preview", "POST", { recurrence }),
  audiencePreview: (audience: TaskAudience, connectionId?: string) =>
    write<TaskAudiencePreview>("/tasks/audience-preview", "POST", { audience, connectionId }),
  settings: () => apiRequest<TaskSettings>("/tasks/settings"),
  updateSettings: (data: TaskSettings) => write<TaskSettings>("/tasks/settings", "PUT", data),
  smtp: () => apiRequest<TaskSmtp[]>("/tasks/smtp"),
  createSmtp: (data: TaskSmtpInput) => write<TaskSmtp>("/tasks/smtp", "POST", data),
  updateSmtp: (id: string, data: TaskSmtpInput) =>
    write<TaskSmtp>(`/tasks/smtp/${encodeURIComponent(id)}`, "PATCH", data),
  removeSmtp: (id: string) =>
    write<{ ok: boolean }>(`/tasks/smtp/${encodeURIComponent(id)}`, "DELETE"),
  verifySmtp: (id: string, recipient: string) =>
    write<TaskSmtpTestAcceptance>(`/tasks/smtp/${encodeURIComponent(id)}/verify`, "POST", {
      confirm: true,
      recipient,
    }),
};

/** Format an instant in the task's explicit IANA zone, independently of the browser zone. */
export function taskLocalDateTime(iso: string, timezone: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
/** Fail closed for invalid/nonexistent civil times; ambiguous folds use the first real instant. */
export function taskDateTimeToIso(local: string, timezone: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local))
    throw new Error("Informe uma data e um horário válidos.");
  const naive = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(naive)) throw new Error("Informe uma data e um horário válidos.");
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = naive + hours * 3600000;
    const rendered = taskLocalDateTime(new Date(probe).toISOString(), timezone);
    offsets.add(Date.parse(`${rendered}:00Z`) - Math.floor(probe / 60000) * 60000);
  }
  const matches = [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((date) => taskLocalDateTime(date.toISOString(), timezone) === local);
  if (!matches.length) throw new Error("Data ou horário inexistente neste fuso horário.");
  return new Date(Math.min(...matches.map((date) => date.getTime()))).toISOString();
}

/** Calendar/filter boundaries start at the first real civil minute of a date (including DST gaps). */
export function taskDayBoundary(date: string, timezone: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error("Informe uma data válida.");
  for (let minute = 0; minute < 1440; minute += 15) {
    const hour = String(Math.floor(minute / 60)).padStart(2, "0"),
      part = String(minute % 60).padStart(2, "0");
    try {
      return taskDateTimeToIso(`${date}T${hour}:${part}`, timezone);
    } catch {
      /* Try the first existing minute after a midnight transition. */
    }
  }
  throw new Error("Esta data não existe no fuso horário selecionado.");
}
