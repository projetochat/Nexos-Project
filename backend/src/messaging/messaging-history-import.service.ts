import { Inject, Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import {
  ConversationStatus,
  LeadSource,
  LeadStatus,
  MessagingConnectionStatus,
  MessagingHistoryImportKind,
  MessagingHistoryImportStatus,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { EvolutionClient } from "./evolution/evolution.client";
import { EvolutionWebhookTranslator } from "./evolution/evolution-webhook.translator";
import { isGroupRemoteIdentity } from "./messaging-identity";
import { MessagingInboundService } from "./messaging-inbound.service";

type ImportConnection = {
  id: string;
  tenantId: string;
  externalReference: string | null;
  status: MessagingConnectionStatus;
  importHistoryEnabled: boolean;
  importHistoryStartDate: Date | null;
  importGroupsEnabled: boolean;
  importGroupsStartDate: Date | null;
};
type ImportedConversation = {
  conversationId: string;
  lastAt: Date;
  lastFromMe: boolean;
  lastPreview: string | null;
};

@Injectable()
export class MessagingHistoryImportService implements OnModuleInit {
  private readonly logger = new Logger(MessagingHistoryImportService.name);
  private readonly queued = new Set<string>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
    @Inject(EvolutionWebhookTranslator) private readonly translator: EvolutionWebhookTranslator,
    @Inject(MessagingInboundService) private readonly inbound: MessagingInboundService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
  ) {}

  async onModuleInit() {
    const interrupted = await this.prisma.messagingHistoryImport.findMany({
      where: {
        status: { in: [MessagingHistoryImportStatus.PENDING, MessagingHistoryImportStatus.RUNNING] },
        connection: { archivedAt: null, status: MessagingConnectionStatus.CONNECTED },
      },
    });
    for (const job of interrupted) {
      if (job.status === MessagingHistoryImportStatus.RUNNING) {
        await this.prisma.messagingHistoryImport.update({
          where: { id: job.id },
          data: { status: MessagingHistoryImportStatus.PENDING, error: "Importação retomada após reinício." },
        });
      }
      this.enqueue(job.id);
    }

    // Existing connected instances may have been configured before this
    // process started. Scheduling them here makes the feature deployable
    // without requiring the operator to disconnect and scan the QR code again.
    const eligibleConnections = await this.prisma.messagingConnection.findMany({
      where: {
        archivedAt: null,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: { not: null },
        OR: [
          { importHistoryEnabled: true, importHistoryStartDate: { not: null } },
          { importGroupsEnabled: true, importGroupsStartDate: { not: null } },
        ],
      },
    });
    for (const connection of eligibleConnections) {
      await this.enqueueForConnection(connection);
    }
  }

  async enqueueForConnection(connection: ImportConnection) {
    if (connection.status !== MessagingConnectionStatus.CONNECTED || !connection.externalReference) return;
    await Promise.all([
      this.requestImport(connection, MessagingHistoryImportKind.DIRECT, {
        enabled: connection.importHistoryEnabled,
        startDate: connection.importHistoryStartDate,
      }),
      this.requestImport(connection, MessagingHistoryImportKind.GROUP, {
        enabled: connection.importGroupsEnabled,
        startDate: connection.importGroupsStartDate,
      }),
    ]);
  }

  async retry(connectionId: string, kind?: MessagingHistoryImportKind) {
    const jobs = await this.prisma.messagingHistoryImport.findMany({
      where: { connectionId, ...(kind ? { kind } : {}) },
    });
    for (const job of jobs) {
      await this.prisma.messagingHistoryImport.update({
        where: { id: job.id },
        data: {
          status: MessagingHistoryImportStatus.PENDING,
          error: null,
          chatsProcessed: 0,
          messagesImported: 0,
          messagesSkipped: 0,
          startedAt: null,
          finishedAt: null,
        },
      });
      this.enqueue(job.id);
    }
  }

  private async requestImport(
    connection: ImportConnection,
    kind: MessagingHistoryImportKind,
    input: { enabled: boolean; startDate: Date | null },
  ) {
    if (!input.enabled || !input.startDate) return;
    const existing = await this.prisma.messagingHistoryImport.findUnique({
      where: { connectionId_kind: { connectionId: connection.id, kind } },
    });
    const shouldRestart =
      !existing ||
      existing.startDate.getTime() !== input.startDate.getTime() ||
      existing.status === MessagingHistoryImportStatus.FAILED ||
      existing.status === MessagingHistoryImportStatus.PARTIAL_FAILED;
    const job = await this.prisma.messagingHistoryImport.upsert({
      where: { connectionId_kind: { connectionId: connection.id, kind } },
      create: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        kind,
        startDate: input.startDate,
        status: MessagingHistoryImportStatus.PENDING,
      },
      update: shouldRestart
        ? {
            startDate: input.startDate,
            status: MessagingHistoryImportStatus.PENDING,
            chatsProcessed: 0,
            messagesImported: 0,
            messagesSkipped: 0,
            error: null,
            startedAt: null,
            finishedAt: null,
          }
        : {},
    });
    if (job.status === MessagingHistoryImportStatus.PENDING) this.enqueue(job.id);
  }

  private enqueue(jobId: string) {
    if (this.queued.has(jobId)) return;
    this.queued.add(jobId);
    setTimeout(() => {
      void this.run(jobId).finally(() => this.queued.delete(jobId));
    }, 250);
  }

  private async run(jobId: string) {
    const job = await this.prisma.messagingHistoryImport.findUnique({
      where: { id: jobId },
      include: { connection: true },
    });
    if (!job || job.status === MessagingHistoryImportStatus.COMPLETED) return;
    const connection = job.connection;
    if (connection.archivedAt || connection.status !== MessagingConnectionStatus.CONNECTED || !connection.externalReference) return;

    await this.prisma.messagingHistoryImport.update({
      where: { id: job.id },
      data: {
        status: MessagingHistoryImportStatus.RUNNING,
        error: null,
        startedAt: new Date(),
        finishedAt: null,
        chatsProcessed: 0,
        messagesImported: 0,
        messagesSkipped: 0,
      },
    });

    let chatsProcessed = 0;
    let messagesImported = 0;
    let messagesSkipped = 0;
    let failedChats = 0;
    const conversations = new Map<string, ImportedConversation>();
    try {
      const chats = await this.fetchAllChats(connection.externalReference);
      const chatIds = unique(
        chats
          .map((chat) => chatRemoteJid(chat))
          .filter((chatId): chatId is string => Boolean(chatId))
          .filter((chatId) =>
            job.kind === MessagingHistoryImportKind.GROUP
              ? isGroupRemoteIdentity(chatId)
              : !isGroupRemoteIdentity(chatId),
          ),
      );
      for (const chatId of chatIds) {
        try {
          const records = await this.fetchAllMessages(connection.externalReference, chatId);
          const ordered = records
            .map((record) => ({ record, at: recordTimestamp(record) }))
            .filter((item) => item.at && item.at >= job.startDate)
            .sort((left, right) => left.at!.getTime() - right.at!.getTime());
          for (const item of ordered) {
            const translation = this.translateStoredMessage(item.record, connection);
            if (translation.kind !== "inbound") {
              messagesSkipped += 1;
              continue;
            }
            if (
              (job.kind === MessagingHistoryImportKind.GROUP) !==
              (translation.event.conversationType === "GROUP")
            ) {
              messagesSkipped += 1;
              continue;
            }
            if (translation.event.occurredAt < job.startDate) {
              messagesSkipped += 1;
              continue;
            }
            const stored = await this.inbound.process(translation.event, { historical: true });
            const conversationId = stored.message.conversationId ?? stored.conversationId;
            if (!conversationId) {
              messagesSkipped += 1;
              continue;
            }
            conversations.set(conversationId, {
              conversationId,
              lastAt: translation.event.occurredAt,
              lastFromMe: translation.event.fromMe,
              lastPreview: translation.event.content ?? null,
            });
            if (stored.duplicate) {
              messagesSkipped += 1;
              continue;
            }
            messagesImported += 1;
          }
          chatsProcessed += 1;
          await this.persistProgress(job.id, chatsProcessed, messagesImported, messagesSkipped);
        } catch (error) {
          failedChats += 1;
          chatsProcessed += 1;
          this.logger.warn({
            event: "messaging.history_import.chat_failed",
            importId: job.id,
            tenantId: job.tenantId,
            connectionId: connection.id,
            chatId: sanitizeChatId(chatId),
            error: error instanceof Error ? error.message : "Falha ao importar conversa.",
          });
          await this.persistProgress(job.id, chatsProcessed, messagesImported, messagesSkipped);
        }
      }

      const leads = await this.finalizeConversations(job, conversations);
      await this.prisma.messagingHistoryImport.update({
        where: { id: job.id },
        data: {
          status: failedChats > 0 ? MessagingHistoryImportStatus.PARTIAL_FAILED : MessagingHistoryImportStatus.COMPLETED,
          chatsProcessed,
          messagesImported,
          messagesSkipped,
          error: failedChats > 0 ? String(failedChats) + " conversa(s) não puderam ser importadas. Tente novamente para concluir." : null,
          finishedAt: new Date(),
        },
      });
      for (const conversation of conversations.values()) {
        this.realtime?.publishConversationUpdated({
          tenantId: job.tenantId,
          conversationId: conversation.conversationId,
          reason: "history.imported",
        });
      }
      for (const lead of leads) {
        this.realtime?.publishLeadCreated({
          tenantId: job.tenantId,
          leadId: lead.id,
          conversationId: lead.conversationId,
        });
      }
      this.logger.log({
        event: "messaging.history_import.completed",
        importId: job.id,
        kind: job.kind,
        tenantId: job.tenantId,
        connectionId: connection.id,
        chatsProcessed,
        messagesImported,
        messagesSkipped,
        failedChats,
      });
    } catch (error) {
      await this.prisma.messagingHistoryImport.update({
        where: { id: job.id },
        data: {
          status: MessagingHistoryImportStatus.FAILED,
          chatsProcessed,
          messagesImported,
          messagesSkipped,
          error: error instanceof Error ? error.message : "Não foi possível iniciar a importação.",
          finishedAt: new Date(),
        },
      });
      this.logger.error({
        event: "messaging.history_import.failed",
        importId: job.id,
        kind: job.kind,
        tenantId: job.tenantId,
        connectionId: connection.id,
        error: error instanceof Error ? error.message : "Falha inesperada.",
      });
    }
  }

  private translateStoredMessage(record: Record<string, unknown>, connection: ImportConnection) {
    const data = record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : record;
    return this.translator.translate(
      { event: "MESSAGES_UPSERT", instance: connection.externalReference ?? undefined, data },
      { tenantId: connection.tenantId, id: connection.id },
    );
  }

  private async finalizeConversations(
    job: { tenantId: string; kind: MessagingHistoryImportKind },
    conversations: Map<string, ImportedConversation>,
  ) {
    const leads: Array<{ id: string; conversationId: string }> = [];
    for (const imported of conversations.values()) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { tenantId: job.tenantId, id: imported.conversationId },
        select: { id: true, contactId: true, departmentId: true, isGroup: true },
      });
      if (!conversation) continue;
      if (job.kind === MessagingHistoryImportKind.GROUP || conversation.isGroup || imported.lastFromMe) {
        await this.prisma.$transaction([
          this.prisma.conversation.update({
            where: { tenantId_id: { tenantId: job.tenantId, id: conversation.id } },
            data: {
              status: ConversationStatus.FECHADA,
              closedAt: imported.lastAt,
              assignedMembershipId: null,
              protocol: null,
              unreadCount: 0,
              inboxArchivedAt: null,
            },
          }),
          this.prisma.lead.deleteMany({ where: { tenantId: job.tenantId, conversationId: conversation.id } }),
        ]);
        continue;
      }
      const lead = await this.prisma.$transaction(async (tx) => {
        await tx.conversation.update({
          where: { tenantId_id: { tenantId: job.tenantId, id: conversation.id } },
          data: {
            status: ConversationStatus.ABERTA,
            closedAt: null,
            assignedMembershipId: null,
            protocol: null,
            unreadCount: 0,
            inboxArchivedAt: null,
          },
        });
        return tx.lead.upsert({
          where: { tenantId_conversationId: { tenantId: job.tenantId, conversationId: conversation.id } },
          update: {
            contactId: conversation.contactId,
            departmentId: conversation.departmentId,
            source: LeadSource.WHATSAPP,
            status: LeadStatus.NEW,
            firstMessagePreview: imported.lastPreview,
            convertedAt: null,
            discardedAt: null,
          },
          create: {
            tenantId: job.tenantId,
            contactId: conversation.contactId,
            conversationId: conversation.id,
            departmentId: conversation.departmentId,
            source: LeadSource.WHATSAPP,
            status: LeadStatus.NEW,
            firstMessagePreview: imported.lastPreview,
          },
        });
      });
      leads.push({ id: lead.id, conversationId: conversation.id });
    }
    return leads;
  }

  private async persistProgress(id: string, chatsProcessed: number, messagesImported: number, messagesSkipped: number) {
    await this.prisma.messagingHistoryImport.update({
      where: { id },
      data: { chatsProcessed, messagesImported, messagesSkipped },
    });
  }

  private async fetchAllChats(instanceName: string) {
    const records: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_CHAT_PAGES; page += 1) {
      const current = await this.evolution.findChats({ instanceName, page, pageSize: PROVIDER_PAGE_SIZE });
      records.push(...current);
      if (current.length < PROVIDER_PAGE_SIZE) break;
    }
    return records;
  }

  private async fetchAllMessages(instanceName: string, remoteJid: string) {
    const records: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= MAX_MESSAGE_PAGES; page += 1) {
      const current = await this.evolution.findMessages({ instanceName, remoteJid, page, pageSize: PROVIDER_PAGE_SIZE });
      const uniquePage = current.filter((record) => {
        const id = messageExternalId(record);
        const key = id ? remoteJid + ":" + id : JSON.stringify(record);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      records.push(...uniquePage);
      if (current.length < PROVIDER_PAGE_SIZE || uniquePage.length === 0) break;
    }
    return records;
  }
}

const PROVIDER_PAGE_SIZE = 100;
const MAX_CHAT_PAGES = 500;
const MAX_MESSAGE_PAGES = 1_000;

function unique(values: string[]) {
  return [...new Set(values)];
}
function chatRemoteJid(record: Record<string, unknown>): string | null {
  const direct = stringAt(record, ["remoteJid"]) ?? stringAt(record, ["id"]) ?? stringAt(record, ["jid"]);
  if (direct?.includes("@")) return direct;
  return stringAt(record, ["key", "remoteJid"]) ?? stringAt(record, ["data", "key", "remoteJid"]) ?? null;
}
function messageExternalId(record: Record<string, unknown>) {
  return stringAt(record, ["key", "id"]) ?? stringAt(record, ["data", "key", "id"]) ?? stringAt(record, ["id"]) ?? null;
}
function recordTimestamp(record: Record<string, unknown>) {
  const value = valueAt(record, ["messageTimestamp"]) ?? valueAt(record, ["timestamp"]) ??
    valueAt(record, ["data", "messageTimestamp"]) ?? valueAt(record, ["data", "timestamp"]);
  if (typeof value === "number") return new Date(value < 10_000_000_000 ? value * 1_000 : value);
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) return new Date(asNumber < 10_000_000_000 ? asNumber * 1_000 : asNumber);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
function valueAt(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
function stringAt(value: unknown, path: string[]) {
  const result = valueAt(value, path);
  return typeof result === "string" && result.trim() ? result : null;
}
function sanitizeChatId(value: string) {
  return value.length <= 20 ? value : value.slice(0, 8) + "…" + value.slice(-8);
}

