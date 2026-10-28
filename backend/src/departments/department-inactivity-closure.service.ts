import { isGroupRemoteIdentity } from "../messaging/messaging-identity";
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConversationStatus,
  ConversationType,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxDispatcherService } from "../queue/outbox-dispatcher.service";
import { OUTBOX_MESSAGING_OUTBOUND_REQUESTED } from "../queue/messaging-outbound.queue";
import { RealtimePublisher } from "../realtime/realtime.publisher";

const OPEN_SERVICE_STATUSES = [ConversationStatus.EM_ANDAMENTO, ConversationStatus.AGUARDANDO];

@Injectable()
export class DepartmentInactivityClosureService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DepartmentInactivityClosureService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxDispatcherService) private readonly outbox: OutboxDispatcherService,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>("TRIXUS_INACTIVITY_POLLER_ENABLED") === "false") return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs());
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(now = new Date()) {
    const departments = await this.prisma.department.findMany({
      where: {
        active: true,
        inactivityClosureEnabled: true,
        inactivityTimeoutMinutes: { not: null },
        inactivityClosureMessage: { not: null },
      },
      orderBy: { id: "asc" },
      select: { id: true, tenantId: true, inactivityTimeoutMinutes: true },
      take: this.departmentBatchSize(),
    });

    let scanned = 0;
    let closed = 0;
    for (const department of departments) {
      if (!department.inactivityTimeoutMinutes) continue;
      const cutoff = new Date(now.getTime() - department.inactivityTimeoutMinutes * 60_000);
      const conversations = await this.prisma.conversation.findMany({
        where: {
          tenantId: department.tenantId,
          departmentId: department.id,
          status: { in: OPEN_SERVICE_STATUSES },
          isGroup: false,
          conversationType: ConversationType.DIRECT,
          NOT: { externalChatId: { endsWith: "@g.us", mode: "insensitive" } },
          archivedAt: null,
          lastMessageAt: { lte: cutoff },
          connectionId: { not: null },
          externalChatId: { not: null },
        },
        orderBy: [{ lastMessageAt: "asc" }, { id: "asc" }],
        select: { id: true },
        take: this.conversationBatchSize(),
      });
      scanned += conversations.length;
      for (const conversation of conversations) {
        const materialized = await this.closeIfStillEligible(
          department.tenantId,
          department.id,
          conversation.id,
          now,
        );
        if (!materialized) continue;
        closed += 1;
        this.realtime.publishMessageCreated({
          tenantId: materialized.tenantId,
          conversationId: materialized.conversationId,
          connectionId: materialized.connectionId,
          message: materialized.message,
        });
        this.realtime.publishConversationUpdated({
          tenantId: materialized.tenantId,
          conversationId: materialized.conversationId,
          reason: "inactivity.closed",
        });
        void this.outbox.dispatchMessage(materialized.message.id).catch((error) => {
          this.logger.warn({
            event: "department.inactivity.immediate_dispatch_failed",
            tenantId: materialized.tenantId,
            messageId: materialized.message.id,
            error: error instanceof Error ? error.message : "Outbox dispatch failed.",
          });
        });
      }
    }
    return { departments: departments.length, scanned, closed };
  }

  private async closeIfStillEligible(
    tenantId: string,
    departmentId: string,
    conversationId: string,
    now: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "conversations" WHERE id = ${conversationId} AND "tenantId" = ${tenantId} FOR UPDATE`,
      );
      const department = await tx.department.findFirst({
        where: { id: departmentId, tenantId, active: true, inactivityClosureEnabled: true },
        select: {
          inactivityTimeoutMinutes: true,
          inactivityClosureMessage: true,
        },
      });
      if (!department?.inactivityTimeoutMinutes || !department.inactivityClosureMessage?.trim()) {
        return null;
      }
      const conversation = await tx.conversation.findFirst({
        where: {
          id: conversationId,
          tenantId,
          departmentId,
          status: { in: OPEN_SERVICE_STATUSES },
          isGroup: false,
          conversationType: ConversationType.DIRECT,
          NOT: { externalChatId: { endsWith: "@g.us", mode: "insensitive" } },
          archivedAt: null,
          connectionId: { not: null },
          externalChatId: { not: null },
        },
        select: {
          id: true,
          tenantId: true,
          contactId: true,
          connectionId: true,
          externalChatId: true,
          isGroup: true,
          conversationType: true,
        },
      });
      if (
        !conversation?.connectionId ||
        !conversation.externalChatId ||
        conversation.isGroup !== false ||
        conversation.conversationType !== ConversationType.DIRECT ||
        isGroupRemoteIdentity(conversation.externalChatId.trim().toLowerCase())
      )
        return null;

      const latest = await tx.message.findFirst({
        where: { tenantId, conversationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, direction: true, authorMembershipId: true, createdAt: true },
      });
      const cutoff = new Date(now.getTime() - department.inactivityTimeoutMinutes * 60_000);
      if (
        !latest ||
        latest.createdAt > cutoff ||
        latest.direction !== MessageDirection.OUTBOUND ||
        !latest.authorMembershipId
      ) {
        return null;
      }

      const clientMessageId = `automatic:inactivity:${latest.id}`;
      const existing = await tx.message.findFirst({
        where: { tenantId, conversationId, clientMessageId },
        select: { id: true },
      });
      if (existing) return null;

      const content = department.inactivityClosureMessage.trim();
      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          connectionId: conversation.connectionId,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          status: MessageStatus.QUEUED,
          content,
          providerChatId: conversation.externalChatId,
          clientMessageId,
          providerStatus: "inactivity_queued",
          queuedAt: now,
          createdAt: now,
        },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId,
          type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
          aggregateId: message.id,
          payload: { tenantId, messageId: message.id },
        },
      });
      await tx.message.create({
        data: {
          tenantId,
          conversationId,
          direction: MessageDirection.SYSTEM,
          type: MessageType.SYSTEM,
          content: "Atendimento encerrado automaticamente por inatividade.",
          clientMessageId: `system:inactivity:${latest.id}`,
          createdAt: now,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          status: ConversationStatus.FECHADA,
          closedAt: now,
          lastMessageAt: now,
          lastMessagePreview: content,
        },
      });
      return {
        tenantId,
        conversationId,
        connectionId: conversation.connectionId,
        contactId: conversation.contactId,
        message,
      };
    });
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error({
        event: "department.inactivity.poll_failed",
        error: error instanceof Error ? error.message : "Inactivity poll failed.",
      });
    } finally {
      this.running = false;
    }
  }

  private intervalMs() {
    return positiveInteger(this.config.get<string>("TRIXUS_INACTIVITY_POLLER_INTERVAL_MS"), 30_000);
  }

  private departmentBatchSize() {
    return positiveInteger(this.config.get<string>("TRIXUS_INACTIVITY_DEPARTMENT_BATCH_SIZE"), 50);
  }

  private conversationBatchSize() {
    return positiveInteger(
      this.config.get<string>("TRIXUS_INACTIVITY_CONVERSATION_BATCH_SIZE"),
      100,
    );
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
