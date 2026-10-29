import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  BadRequestException,
  HttpException,
  ConflictException,
} from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import {
  Prisma,
  MessageDirection,
  MessageStatus,
  MessageType,
  NotificationKind,
} from "../generated/prisma";
import { OutboxDispatcherService } from "../queue/outbox-dispatcher.service";
import { OUTBOX_MESSAGING_OUTBOUND_REQUESTED } from "../queue/messaging-outbound.queue";
import { RealtimeService } from "../realtime/realtime.service";
import { conversationVisibilityWhere } from "../conversations/conversation-visibility";
import type { AuthenticatedUser } from "../auth/auth.types";
import { resolveTaskAudience } from "./task-audience";
import type { TaskInput, TaskRecipient } from "./task-contract";
import {
  TasksService,
  type TaskRow,
  type OccurrenceRow,
  taskOccurrenceId,
  type TaskDb,
} from "./tasks.service";
import { nextTaskOccurrences } from "./task-recurrence";
import { email, TaskSmtpFailure } from "./task-smtp";
type DeliveryRow = {
  id: string;
  tenantId: string;
  occurrenceId: string;
  channel: "popup" | "bell" | "whatsapp" | "email";
  destination: string;
  status: string;
  payload: {
    input: TaskInput;
    recipient?: TaskRecipient;
    email?: string;
    membershipId?: string;
    recipientName?: string;
  };
  availableAt: Date;
  messageId: string | null;
  notificationId: string | null;
  claimedAt: Date | null;
  attempts: number;
  taskId?: string;
};
@Injectable()
export class TasksWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TasksWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  constructor(
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(OutboxDispatcherService) private readonly outbox: OutboxDispatcherService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}
  onApplicationBootstrap() {
    if (!this.tasks.workerEnabled()) return;
    this.timer = setInterval(() => void this.tick(), 30000);
    this.timer.unref?.();
    void this.tick();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch {
      this.logger.warn({ event: "tasks.worker.failed", code: "TASK_WORKER_FAILED" });
    } finally {
      this.running = false;
    }
  }
  async runOnce(now = new Date()) {
    if (!this.tasks.workerEnabled()) return { disabled: true, prepared: 0, delivered: 0 };
    await this.reconcile(now);
    const rows = await this.tasks.prisma.$queryRaw<TaskRow[]>(
      Prisma.sql`SELECT * FROM "task_definitions" WHERE "archivedAt" IS NULL AND "status"='active' AND "nextDueAt"<=${new Date(now.getTime() + 30 * 86400000)} ORDER BY "nextDueAt" ASC LIMIT 50`,
    );
    let prepared = 0;
    for (const row of rows) {
      const lead = Math.max(
        row.payload.input.channels.whatsapp.enabled
          ? row.payload.input.channels.whatsapp.leadMinutes
          : 0,
        row.payload.input.channels.email.enabled ? row.payload.input.channels.email.leadMinutes : 0,
      );
      if (!row.nextDueAt || row.nextDueAt.getTime() - lead * 60000 > now.getTime()) continue;
      try {
        await this.prepare(row, now);
        prepared++;
      } catch {
        await this.tasks.prisma.$transaction(async (tx) => {
          const fresh = await tx.$queryRaw<TaskRow[]>(
            Prisma.sql`SELECT * FROM "task_definitions" WHERE "tenantId"=${row.tenantId} AND "id"=${row.id} FOR UPDATE`,
          );
          if (!fresh[0] || fresh[0].version !== row.version) return;
          await tx.$executeRaw(
            Prisma.sql`UPDATE "task_occurrences" SET "status"='failed',"lastError"='TASK_PREPARATION_FAILED' WHERE "tenantId"=${row.tenantId} AND "id"=${taskOccurrenceId(row.id, row.nextDueAt!.toISOString())} AND "status"='pending'`,
          );
          await this.tasks.history(tx, row, "prepare.failed", null, {
            code: "TASK_PREPARATION_FAILED",
          });
          await tx.$executeRaw(
            Prisma.sql`UPDATE "task_definitions" SET "status"='paused',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${row.tenantId} AND "id"=${row.id}`,
          );
        });
      }
    }
    const deliveries = await this.tasks.prisma.$queryRaw<DeliveryRow[]>(
      Prisma.sql`SELECT d.*,o."taskId" FROM "task_deliveries" d JOIN "task_occurrences" o ON o."id"=d."occurrenceId" JOIN "task_definitions" t ON t."id"=o."taskId" WHERE d."status"='pending' AND d."availableAt"<=${now} AND o."status" IN ('pending','processing') AND t."status"='active' AND t."archivedAt" IS NULL ORDER BY d."availableAt" ASC,d."id" ASC LIMIT 25`,
    );
    let delivered = 0;
    for (const row of deliveries) {
      try {
        if (await this.deliver(row, now)) delivered++;
      } catch {
        /* Per-destination outcome was recorded without exposing credentials or payload. */
      }
    }
    await this.reconcile(now);
    return { disabled: false, prepared, delivered };
  }
  private async taskLocked(db: TaskDb, tenantId: string, id: string) {
    const rows = await db.$queryRaw<TaskRow[]>(
      Prisma.sql`SELECT * FROM "task_definitions" WHERE "tenantId"=${tenantId} AND "id"=${id} AND "archivedAt" IS NULL FOR UPDATE`,
    );
    if (!rows[0] || rows[0].status !== "active")
      throw new ConflictException("Tarefa pausada ou encerrada.");
    return rows[0];
  }
  private async prepare(original: TaskRow, now: Date) {
    await this.tasks.prisma.$transaction(
      async (tx) => {
        const row = await this.taskLocked(tx, original.tenantId, original.id);
        if (!row.nextDueAt || row.nextDueAt.getTime() !== original.nextDueAt?.getTime()) return;
        if (!row.createdByMembershipId || !row.assignedMembershipId)
          throw new BadRequestException("Autor ou responsável removido; revise a tarefa.");
        const creator = await this.tasks.actorByMembership(
          row.tenantId,
          row.createdByMembershipId,
          "schedules.read",
          tx,
        );
        if (
          !creator.permissions?.includes("schedules.create") &&
          !creator.permissions?.includes("schedules.update")
        )
          throw new BadRequestException("Planejamento não autorizado.");
        await this.tasks.actorByMembership(
          row.tenantId,
          row.assignedMembershipId,
          "schedules.read",
          tx,
        );
        const due = row.nextDueAt;
        const id = taskOccurrenceId(row.id, due.toISOString());
        await this.tasks.materializeRow(tx, row, due, due, false);
        const occurrences = await tx.$queryRaw<OccurrenceRow[]>(
          Prisma.sql`SELECT * FROM "task_occurrences" WHERE "tenantId"=${row.tenantId} AND "id"=${id} FOR UPDATE`,
        );
        const occurrence = occurrences[0];
        if (!occurrence) throw new BadRequestException("Ocorrência não registrada.");
        if (!occurrence.snapshot.prepared && occurrence.status === "pending") {
          const payload = occurrence.snapshot;
          const input = payload.input;
          if (input.channels.whatsapp.enabled || input.channels.email.enabled) {
            if (!creator.permissions?.includes("messages.send"))
              throw new BadRequestException("Envio externo não autorizado.");
          }
          const audience =
            input.audience.selection === "fixed"
              ? {
                  ...input.audience,
                  mode: payload.fixed.groupIds.length ? ("groups" as const) : ("contacts" as const),
                  contactIds: payload.fixed.contactIds,
                  groupIds: payload.fixed.groupIds,
                }
              : input.audience;
          const recipients = await resolveTaskAudience(
            tx as never,
            creator,
            audience,
            input.channels.whatsapp.enabled ? input.channels.whatsapp.connectionId : undefined,
          );
          if (recipients.length > 2000)
            throw new BadRequestException("Destinatários acima do limite.");
          const settings = await this.tasks.settingsFor(row.tenantId, tx);
          const insert = async (
            channel: DeliveryRow["channel"],
            destination: string,
            extra: Partial<DeliveryRow["payload"]>,
            lead = 0,
          ) => {
            const available = new Date(due.getTime() - lead * 60000);
            await tx.$executeRaw(
              Prisma.sql`INSERT INTO "task_deliveries" ("id","tenantId","occurrenceId","channel","destination","payload","availableAt","status","lastError") VALUES (${randomUUID()},${row.tenantId},${id},${channel},${destination},${JSON.stringify({ input, ...extra })}::jsonb,${available},${(channel === "whatsapp" && !settings.whatsappEnabled) || (channel === "email" && !settings.emailEnabled) ? "cancelled" : "pending"},${(channel === "whatsapp" && !settings.whatsappEnabled) || (channel === "email" && !settings.emailEnabled) ? "TASK_CHANNEL_DISABLED" : null}) ON CONFLICT("occurrenceId","channel","destination") DO UPDATE SET "status"=EXCLUDED."status","payload"=EXCLUDED."payload","availableAt"=EXCLUDED."availableAt","lastError"=EXCLUDED."lastError" WHERE "task_deliveries"."status"='cancelled'`,
            );
          };
          if (input.channels.popup && settings.popupEnabled)
            await insert("popup", input.assignedMembershipId, {
              membershipId: input.assignedMembershipId,
              recipientName: payload.assignedNameSnapshot ?? "Responsável",
            });
          if (input.channels.bell && settings.bellEnabled)
            await insert("bell", input.assignedMembershipId, {
              membershipId: input.assignedMembershipId,
              recipientName: payload.assignedNameSnapshot ?? "Responsável",
            });
          if (input.channels.whatsapp.enabled) {
            await this.tasks.connection(input.channels.whatsapp.connectionId, creator, tx);
            if (!recipients.length)
              throw new BadRequestException("Selecione destinatários de WhatsApp.");
            for (const recipient of recipients)
              await insert(
                "whatsapp",
                `${recipient.kind}:${recipient.id}`,
                { recipient },
                input.channels.whatsapp.leadMinutes,
              );
          }
          if (input.channels.email.enabled) {
            await this.tasks.smtpRow(input.channels.email.smtpAccountId, row.tenantId, tx);
            const targets: Array<{
              email: string;
              recipient?: TaskRecipient;
              membershipId?: string;
              recipientName?: string;
            }> = [];
            const mode = input.channels.email.recipientMode ?? "audience";
            if (mode !== "responsible")
              for (const recipient of recipients.filter((r) => r.kind === "contact")) {
                try {
                  targets.push({ email: email(recipient.email ?? ""), recipient });
                } catch {
                  /* No email is inferred from a WhatsApp group or an invalid contact address. */
                }
              }
            const internalIds = [
              ...new Set([
                ...(input.channels.email.membershipIds ?? []),
                ...(mode !== "audience" ? [input.assignedMembershipId] : []),
              ]),
            ];
            for (const membershipId of internalIds) {
              await this.tasks.actorByMembership(row.tenantId, membershipId, "schedules.read", tx);
              const member = await tx.tenantMembership.findFirst({
                where: { id: membershipId, tenantId: row.tenantId, status: "ACTIVE" },
                include: { user: true },
              });
              if (member) targets.push({ email: email(member.user.email), membershipId });
            }
            const unique = new Set<string>();
            if (!targets.length)
              throw new BadRequestException("Nenhum destinatário de e-mail válido.");
            for (const target of targets) {
              const address = target.email.toLowerCase();
              if (unique.has(address)) continue;
              unique.add(address);
              await insert(
                "email",
                `email:${createHash("sha256").update(address).digest("hex")}`,
                target,
                input.channels.email.leadMinutes,
              );
            }
          }
          await tx.$executeRaw(
            Prisma.sql`UPDATE "task_occurrences" SET "snapshot"=${JSON.stringify({ ...payload, prepared: true, resolvedRecipients: recipients.map(({ id, name, kind }) => ({ id, name, kind })) })}::jsonb WHERE "tenantId"=${row.tenantId} AND "id"=${id}`,
          );
          await this.tasks.history(
            tx,
            row,
            "occurrence.prepared",
            null,
            { recipientCount: recipients.length },
            id,
          );
        }
        const next =
          nextTaskOccurrences(row.payload.input.recurrence, { after: due, limit: 1 })[0] ?? null;
        await tx.$executeRaw(
          Prisma.sql`UPDATE "task_definitions" SET "nextDueAt"=${next ? new Date(next) : null},"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${row.tenantId} AND "id"=${row.id}`,
        );
        await this.tasks.materializeRow(
          tx,
          row,
          now,
          new Date(now.getTime() + 93 * 86400000),
          false,
        );
      },
      { timeout: 15000 },
    );
  }
  private async claim(delivery: DeliveryRow, now: Date) {
    return this.tasks.prisma.$transaction(async (tx) => {
      const task = await this.taskLocked(tx, delivery.tenantId, delivery.taskId!);
      if (!task.createdByMembershipId || !task.assignedMembershipId)
        throw new BadRequestException("Autor ou responsável removido; revise a tarefa.");
      const actor = await this.tasks.actorByMembership(
        task.tenantId,
        task.createdByMembershipId,
        "schedules.read",
        tx,
      );
      if (
        !actor.permissions?.includes("schedules.create") &&
        !actor.permissions?.includes("schedules.update")
      )
        throw new BadRequestException("Planejamento não autorizado.");
      await this.tasks.actorByMembership(
        task.tenantId,
        task.assignedMembershipId,
        "schedules.read",
        tx,
      );
      const claimed = await tx.$queryRaw<DeliveryRow[]>(
        Prisma.sql`UPDATE "task_deliveries" SET "status"='processing',"claimedAt"=${now},"attempts"="attempts"+1 WHERE "tenantId"=${delivery.tenantId} AND "id"=${delivery.id} AND "status"='pending' AND EXISTS(SELECT 1 FROM "task_occurrences" o WHERE o."id"="task_deliveries"."occurrenceId" AND o."status" IN ('pending','processing')) RETURNING *`,
      );
      return claimed[0] ? { task, actor, delivery: claimed[0] } : null;
    });
  }
  private async deliver(original: DeliveryRow, now: Date) {
    let claimed;
    try {
      claimed = await this.claim(original, now);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500)
        await this.tasks.prisma.$executeRaw(
          Prisma.sql`UPDATE "task_deliveries" SET "status"='failed',"lastError"='TASK_AUTHORIZATION_OR_SCOPE_REVOKED' WHERE "tenantId"=${original.tenantId} AND "id"=${original.id} AND "status"='pending'`,
        );
      throw error;
    }
    if (!claimed) return false;
    const { task, actor, delivery } = claimed;
    let externalStarted = false;
    try {
      const settings = await this.tasks.settingsFor(task.tenantId);
      const disabled =
        delivery.channel === "whatsapp"
          ? !settings.whatsappEnabled
          : delivery.channel === "email"
            ? !settings.emailEnabled
            : delivery.channel === "popup"
              ? !settings.popupEnabled
              : !settings.bellEnabled;
      if (disabled) {
        await this.finish(delivery, "cancelled", task, "TASK_CHANNEL_DISABLED");
        return true;
      }
      if (delivery.channel === "popup" || delivery.channel === "bell") {
        const target = await this.tasks.actorByMembership(task.tenantId, delivery.destination);
        await this.tasks.visible(task, target);
        await this.tasks.prisma.$transaction(async (tx) => {
          await this.taskLocked(tx, task.tenantId, task.id);
          const current = await tx.$queryRaw<DeliveryRow[]>(
            Prisma.sql`SELECT * FROM "task_deliveries" WHERE "tenantId"=${task.tenantId} AND "id"=${delivery.id} FOR UPDATE`,
          );
          if (current[0]?.status !== "processing") return;
          if (delivery.channel === "bell")
            await tx.notification.upsert({
              where: { tenantId_id: { tenantId: task.tenantId, id: delivery.id } },
              create: {
                id: delivery.id,
                tenantId: task.tenantId,
                membershipId: delivery.destination,
                kind: NotificationKind.SYSTEM,
                title: delivery.payload.input.title,
                body: delivery.payload.input.description.slice(0, 500),
                entityType: "task",
                entityId: task.id,
              },
              update: {},
            });
          await tx.$executeRaw(
            Prisma.sql`UPDATE "task_deliveries" SET "status"='sent',"sentAt"=CURRENT_TIMESTAMP,"notificationId"=${delivery.channel === "bell" ? delivery.id : null} WHERE "tenantId"=${task.tenantId} AND "id"=${delivery.id}`,
          );
          await this.tasks.history(
            tx,
            task,
            `${delivery.channel}.sent`,
            null,
            {},
            delivery.occurrenceId,
          );
        });
        if (delivery.channel === "bell")
          this.realtime.publish({ membershipId: delivery.destination }, "notification.created", {
            id: delivery.id,
            entityType: "task",
            entityId: task.id,
          });
        return true;
      }
      if (!actor.permissions?.includes("messages.send"))
        throw new BadRequestException("Envio externo não autorizado.");
      const recipient = delivery.payload.recipient;
      if (recipient) {
        const selected = await resolveTaskAudience(
          this.tasks.prisma,
          actor,
          {
            mode: recipient.kind === "group" ? "groups" : "contacts",
            selection: "fixed",
            contactIds: recipient.kind === "contact" ? [recipient.id] : [],
            groupIds: recipient.kind === "group" ? [recipient.id] : [],
            conditions: [],
          },
          delivery.channel === "whatsapp"
            ? delivery.payload.input.channels.whatsapp.connectionId
            : undefined,
        );
        if (
          selected.length !== 1 ||
          (delivery.channel === "email" &&
            selected[0].email?.toLowerCase() !== delivery.payload.email?.toLowerCase()) ||
          (delivery.channel === "whatsapp" && selected[0].phone !== recipient.phone)
        )
          throw new BadRequestException("O destino foi alterado; revise a tarefa.");
      }
      if (delivery.channel === "whatsapp") {
        externalStarted = true;
        const messageId = await this.whatsapp(task, actor, delivery);
        try {
          await this.outbox.dispatchMessage(messageId);
        } catch {
          /* Durable outbox owns queue recovery; never create a second Message. */
        }
        return true;
      }
      if (delivery.payload.membershipId) {
        await this.tasks.actorByMembership(task.tenantId, delivery.payload.membershipId);
        const member = await this.tasks.prisma.tenantMembership.findFirst({
          where: { id: delivery.payload.membershipId, tenantId: task.tenantId, status: "ACTIVE" },
          include: { user: true },
        });
        if (!member || member.user.email.toLowerCase() !== delivery.payload.email?.toLowerCase())
          throw new BadRequestException("Destinatário interno alterado.");
      }
      const account = await this.tasks.smtpRow(
        delivery.payload.input.channels.email.smtpAccountId,
        task.tenantId,
      );
      externalStarted = true;
      await this.tasks.smtp.send(
        account,
        this.tasks.smtp.decrypt(account.credential, task.tenantId, account.id),
        {
          to: delivery.payload.email!,
          subject: delivery.payload.input.channels.email.subject,
          body: delivery.payload.input.channels.email.body,
          deliveryId: delivery.id,
        },
      );
      try {
        await this.finish(delivery, "sent", task, null);
      } catch {
        await this.finish(delivery, "ambiguous", task, "TASK_SMTP_COMMIT_UNKNOWN").catch(
          () => undefined,
        );
      }
      return true;
    } catch (error) {
      const ambiguous =
        (error instanceof TaskSmtpFailure && error.ambiguous) ||
        (!(error instanceof HttpException && error.getStatus() < 500) &&
          externalStarted &&
          !(error instanceof TaskSmtpFailure));
      await this.finish(
        delivery,
        ambiguous ? "ambiguous" : "failed",
        task,
        ambiguous ? "TASK_DELIVERY_OUTCOME_UNKNOWN" : "TASK_DELIVERY_FAILED",
      ).catch(() => undefined);
      throw error;
    }
  }
  private async whatsapp(task: TaskRow, actor: AuthenticatedUser, delivery: DeliveryRow) {
    return this.tasks.prisma.$transaction(async (tx) => {
      await this.taskLocked(tx, task.tenantId, task.id);
      const current = await tx.$queryRaw<DeliveryRow[]>(
        Prisma.sql`SELECT * FROM "task_deliveries" WHERE "tenantId"=${task.tenantId} AND "id"=${delivery.id} FOR UPDATE`,
      );
      if (current[0]?.messageId) return current[0].messageId;
      if (current[0]?.status !== "processing")
        throw new ConflictException("Entrega já processada.");
      const connection = await this.tasks.connection(
        delivery.payload.input.channels.whatsapp.connectionId,
        actor,
        tx,
      );
      if (connection.status !== "CONNECTED")
        throw new BadRequestException("Instância desconectada.");
      const recipient = delivery.payload.recipient!;
      let conversation;
      if (recipient.kind === "group") {
        conversation = await tx.conversation.findFirst({
          where: {
            AND: [
              {
                id: recipient.conversationId,
                tenantId: task.tenantId,
                isGroup: true,
                connectionId: connection.id,
                archivedAt: null,
              },
              conversationVisibilityWhere(actor),
            ],
          },
        });
        if (!conversation) throw new BadRequestException("Grupo fora do escopo.");
      } else {
        conversation = await tx.conversation.findFirst({
          where: {
            AND: [
              {
                tenantId: task.tenantId,
                contactId: recipient.id,
                connectionId: connection.id,
                isGroup: false,
                archivedAt: null,
              },
              conversationVisibilityWhere(actor),
            ],
          },
          orderBy: { updatedAt: "desc" },
        });
        if (!conversation) {
          const hidden = await tx.conversation.findFirst({
            where: {
              tenantId: task.tenantId,
              contactId: recipient.id,
              connectionId: connection.id,
              archivedAt: null,
            },
          });
          if (hidden) throw new BadRequestException("Conversa fora do escopo.");
          conversation = await tx.conversation.create({
            data: {
              tenantId: task.tenantId,
              contactId: recipient.id,
              connectionId: connection.id,
              status: "ABERTA",
              isGroup: false,
            },
          });
        }
      }
      const clientMessageId = `task:${delivery.id}`;
      let message = await tx.message.findFirst({
        where: { tenantId: task.tenantId, conversationId: conversation.id, clientMessageId },
      });
      if (!message) {
        message = await tx.message.create({
          data: {
            tenantId: task.tenantId,
            conversationId: conversation.id,
            connectionId: connection.id,
            direction: MessageDirection.OUTBOUND,
            type: MessageType.TEXT,
            status: MessageStatus.QUEUED,
            authorMembershipId: actor.membershipId,
            content: delivery.payload.input.channels.whatsapp.message,
            clientMessageId,
          },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            lastMessagePreview: delivery.payload.input.channels.whatsapp.message.slice(0, 120),
          },
        });
        await tx.outboxEvent.create({
          data: {
            tenantId: task.tenantId,
            type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
            aggregateId: message.id,
            payload: { tenantId: task.tenantId, messageId: message.id },
          },
        });
      }
      await tx.$executeRaw(
        Prisma.sql`UPDATE "task_deliveries" SET "messageId"=${message.id} WHERE "tenantId"=${task.tenantId} AND "id"=${delivery.id}`,
      );
      await this.tasks.history(
        tx,
        task,
        "whatsapp.queued",
        null,
        { messageId: message.id },
        delivery.occurrenceId,
      );
      return message.id;
    });
  }
  private async finish(delivery: DeliveryRow, status: string, task: TaskRow, error: string | null) {
    await this.tasks.prisma.$transaction(async (tx) => {
      const count = await tx.$executeRaw(
        Prisma.sql`UPDATE "task_deliveries" SET "status"=${status},"lastError"=${error},"sentAt"=${status === "sent" ? new Date() : null} WHERE "tenantId"=${delivery.tenantId} AND "id"=${delivery.id} AND "status"='processing'`,
      );
      if (count)
        await this.tasks.history(
          tx,
          task,
          `${delivery.channel}.${status}`,
          null,
          { code: error },
          delivery.occurrenceId,
        );
    });
  }
  private async reconcile(now: Date) {
    const stale = new Date(now.getTime() - 5 * 60000);
    await this.tasks.prisma.$executeRaw(
      Prisma.sql`UPDATE "task_deliveries" SET "status"='ambiguous',"lastError"='TASK_DELIVERY_OUTCOME_UNKNOWN' WHERE "status"='processing' AND "messageId" IS NULL AND "claimedAt"<${stale}`,
    );
    const queued = await this.tasks.prisma.$queryRaw<DeliveryRow[]>(
      Prisma.sql`SELECT d.*,o."taskId" FROM "task_deliveries" d JOIN "task_occurrences" o ON o."id"=d."occurrenceId" WHERE d."status"='processing' AND d."messageId" IS NOT NULL LIMIT 100`,
    );
    for (const delivery of queued) {
      const message = await this.tasks.prisma.message.findFirst({
        where: { tenantId: delivery.tenantId, id: delivery.messageId! },
        select: { status: true, providerErrorCode: true },
      });
      if (message && ["SENT", "DELIVERED", "READ", "FAILED"].includes(message.status)) {
        const status =
          message.status !== "FAILED"
            ? "sent"
            : /UNKNOWN|AMBIGUOUS/i.test(message.providerErrorCode ?? "")
              ? "ambiguous"
              : "failed";
        await this.tasks.prisma.$executeRaw(
          Prisma.sql`UPDATE "task_deliveries" SET "status"=${status},"lastError"=${status === "sent" ? null : "TASK_WHATSAPP_DELIVERY_FAILED"},"sentAt"=${status === "sent" ? now : null} WHERE "tenantId"=${delivery.tenantId} AND "id"=${delivery.id} AND "status"='processing'`,
        );
      }
    }
    const occurrences = await this.tasks.prisma.$queryRaw<Array<OccurrenceRow & { task: TaskRow }>>(
      Prisma.sql`SELECT o.*,to_jsonb(t) AS "task" FROM "task_occurrences" o JOIN "task_definitions" t ON t."id"=o."taskId" WHERE o."status" IN ('pending','processing','failed') AND (o."snapshot"->>'prepared')='true' ORDER BY o."dueAt" ASC LIMIT 100`,
    );
    for (const occurrence of occurrences) {
      const statuses = await this.tasks.prisma.$queryRaw<Array<{ status: string }>>(
        Prisma.sql`SELECT "status" FROM "task_deliveries" WHERE "tenantId"=${occurrence.tenantId} AND "occurrenceId"=${occurrence.id}`,
      );
      let status = statuses.some((r) => r.status === "processing")
        ? "processing"
        : statuses.some((r) => r.status === "failed" || r.status === "ambiguous")
          ? "failed"
          : "pending";
      if (
        ["whatsapp", "email"].includes(occurrence.snapshot.input.type) &&
        statuses.length &&
        statuses.every((row) => row.status === "cancelled")
      )
        status = "cancelled";
      if (
        ["whatsapp", "email"].includes(occurrence.snapshot.input.type) &&
        statuses.length &&
        statuses.some((r) => r.status === "sent") &&
        statuses.every((r) => r.status === "sent" || r.status === "cancelled")
      )
        status = "completed";
      if (status !== occurrence.status) {
        await this.tasks.prisma.$transaction(async (tx) => {
          const tasks = await tx.$queryRaw<TaskRow[]>(
            Prisma.sql`SELECT * FROM "task_definitions" WHERE "tenantId"=${occurrence.tenantId} AND "id"=${occurrence.taskId} FOR UPDATE`,
          );
          const changed = await tx.$executeRaw(
            Prisma.sql`UPDATE "task_occurrences" SET "status"=${status},"completedAt"=${status === "completed" ? now : null} WHERE "tenantId"=${occurrence.tenantId} AND "id"=${occurrence.id} AND "status" NOT IN ('completed','cancelled') AND "status"<>${status}`,
          );
          if (!changed) return;
          await this.tasks.history(
            tx,
            occurrence.task,
            `occurrence.${status}`,
            null,
            {},
            occurrence.id,
          );
          if (
            status === "completed" &&
            tasks[0] &&
            !tasks[0].archivedAt &&
            tasks[0].payload.input.recurrence.frequency === "once" &&
            new Date(tasks[0].payload.input.recurrence.startAt).getTime() ===
              occurrence.dueAt.getTime()
          )
            await tx.$executeRaw(
              Prisma.sql`UPDATE "task_definitions" SET "status"='completed',"nextDueAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${occurrence.tenantId} AND "id"=${occurrence.taskId}`,
            );
        });
      }
    }
  }
}
