type ScheduleType = "message" | "task";
type ScheduleStatus = "pending" | "completed";
export type ScheduleAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};
export type ApiSchedule = {
  id: string;
  identifier: string;
  type: ScheduleType;
  title: string;
  destination: string;
  conversationId?: string;
  scheduledAt: string;
  recurrence: "once" | "weekly" | "monthly";
  delivery: boolean;
  status: ScheduleStatus;
  connectionId: string;
  departmentId: string;
  content: string;
  recipientIds: string[];
  recipients: Array<{ id: string; name: string }>;
  recurrenceDays: string[];
  recurrenceLimit: string;
  recurrenceUntil: string;
  assignedMembershipId: string;
  attachmentName: string | null;
  attachment?: ScheduleAttachment | null;
  dueAt?: string | null;
  executionStatus?: "PENDING" | "CLAIMED" | "QUEUED" | "SENT" | "FAILED" | null;
  claimedAt?: string | null;
  messageId?: string | null;
  attempts?: number;
  lastError?: string | null;
  completedAt?: string | null;
};

export function scheduleWritePayload(data: ApiSchedule): ApiSchedule {
  return {
    id: data.id,
    identifier: data.identifier,
    type: data.type,
    title: data.title,
    destination: data.destination,
    conversationId: data.conversationId,
    scheduledAt: data.scheduledAt,
    recurrence: data.recurrence,
    delivery: data.delivery,
    status: data.status,
    connectionId: data.connectionId,
    departmentId: data.departmentId,
    content: data.content,
    recipientIds: data.recipientIds,
    recipients: data.recipients,
    recurrenceDays: data.recurrenceDays,
    recurrenceLimit: data.recurrenceLimit,
    recurrenceUntil: data.recurrenceUntil,
    assignedMembershipId: data.assignedMembershipId,
    attachmentName: data.attachmentName,
    attachment: data.attachment,
  };
}
