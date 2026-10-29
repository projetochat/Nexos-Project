import type { TaskRecurrenceConfig } from "./task-recurrence";
export type TaskStatus = "active" | "paused" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskType = "task" | "reminder" | "whatsapp" | "email";
export type TaskCondition = {
  field: string;
  operator: "contains" | "eq" | "neq" | "gt" | "lt" | "between" | "in" | "checked" | "unchecked";
  value?: string | number | boolean | string[] | number[];
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
  type: TaskType;
  assignedMembershipId: string;
  priority: TaskPriority;
  status: TaskStatus;
  recurrence: TaskRecurrenceConfig;
  audience: TaskAudience;
  channels: TaskChannels;
  legacyOrigin?: string;
};
export type TaskRecord = TaskInput & {
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
  taskPriority?: TaskPriority;
  taskType?: TaskType;
  assignedName?: string | null;
  dueAt: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  completedAt: string | null;
  executionError?: string | null;
  createdAt: string;
  deliveries: TaskDelivery[];
};
export type TaskSettings = {
  popupEnabled: boolean;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  defaultSmtpAccountId: string | null;
  bellEnabled: boolean;
  defaultLeadMinutes: number;
  timezone: string;
};
export type TaskSmtpInput = {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  fromAddress: string;
  fromName: string;
  active: boolean;
};
export type TaskSmtpAccount = Omit<TaskSmtpInput, "password"> & {
  id: string;
  hasPassword: boolean;
  lastVerifiedAt: string | null;
  validationStatus: "validated" | "unvalidated";
  lastValidatedAt: string | null;
  lastTestAcceptedAt: string | null;
  lastTestReference: string | null;
  lastTestMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TaskQuery = {
  search?: string;
  assignedMembershipId?: string;
  status?: string;
  priority?: string;
  type?: string;
  start?: string;
  end?: string;
  taskId?: string;
  channel?: "popup" | "bell" | "whatsapp" | "email";
  page?: number | string;
  pageSize?: number | string;
};
export type TaskRecipient = {
  id: string;
  name: string;
  kind: "contact" | "group";
  email: string | null;
  phone: string | null;
  conversationId?: string;
  connectionId?: string;
};

export type TaskSmtpTestInput = { confirm: true; recipient: string };
export type TaskSmtpTestResult = {
  verified: true;
  accepted: true;
  reference: string;
  messageId: string;
  message: string;
  auditRecorded: boolean;
  configurationUnchanged: boolean;
};
