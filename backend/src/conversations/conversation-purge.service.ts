import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { CampaignRecipientStatus, OutboxEventStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import {
  changedDeletion,
  deletionSnapshot,
  type DeletionImpactPreview,
} from "../common/deletion-impact";
import { MessagingMediaStorageService } from "../messaging/media/messaging-media-storage.service";

type DatabaseClient = PrismaService | Prisma.TransactionClient;

type ConversationPurgeState = Awaited<
  ReturnType<ConversationPurgeService["loadConversationState"]>
>;
type ContactPurgeState = Awaited<ReturnType<ConversationPurgeService["loadContactState"]>>;

@Injectable()
export class ConversationPurgeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingMediaStorageService)
    private readonly mediaStorage: MessagingMediaStorageService,
  ) {}

  async conversationImpact(id: string, tenantId: string): Promise<DeletionImpactPreview> {
    return this.conversationImpactFromState(
      await this.loadConversationState(this.prisma, [id], tenantId),
    );
  }

  async purgeConversation(id: string, snapshotToken: string, tenantId: string) {
    const preview = await this.conversationImpact(id, tenantId);
    if (snapshotToken !== preview.snapshotToken) return changedDeletion(preview);
    if (preview.blockedReason) throw new BadRequestException(preview.blockedReason);

    const result = await this.prisma.$transaction(async (tx) => {
      const state = await this.loadConversationState(tx, [id], tenantId);
      const current = this.conversationImpactFromState(state);
      if (snapshotToken !== current.snapshotToken)
        return { kind: "changed" as const, impact: current };
      if (current.blockedReason) throw new BadRequestException(current.blockedReason);
      await this.purgeConversationsInTransaction(tx, state, tenantId);
      return { kind: "deleted" as const, mediaStorageKeys: state.mediaStorageKeys };
    });
    if (result.kind === "changed") return changedDeletion(result.impact);
    const cleanup = await this.cleanupMedia(result.mediaStorageKeys);
    return { status: "deleted" as const, cleanup };
  }

  async contactImpact(id: string, tenantId: string): Promise<DeletionImpactPreview> {
    return this.contactImpactFromState(await this.loadContactState(this.prisma, id, tenantId));
  }

  async purgeContact(id: string, snapshotToken: string, tenantId: string) {
    const preview = await this.contactImpact(id, tenantId);
    if (snapshotToken !== preview.snapshotToken) return changedDeletion(preview);
    if (preview.blockedReason) throw new BadRequestException(preview.blockedReason);

    const result = await this.prisma.$transaction(async (tx) => {
      const state = await this.loadContactState(tx, id, tenantId);
      const current = this.contactImpactFromState(state);
      if (snapshotToken !== current.snapshotToken)
        return { kind: "changed" as const, impact: current };
      if (current.blockedReason) throw new BadRequestException(current.blockedReason);

      const recipientIds = state.recipients.map((recipient) => recipient.id);
      if (recipientIds.length) {
        await tx.message.updateMany({
          where: { tenantId, campaignRecipientId: { in: recipientIds } },
          data: { campaignRecipientId: null },
        });
        await tx.outboxEvent.deleteMany({
          where: {
            tenantId,
            aggregateId: { in: recipientIds },
            status: { not: OutboxEventStatus.PROCESSING },
          },
        });
        await tx.campaignRecipient.deleteMany({ where: { tenantId, id: { in: recipientIds } } });
      }
      await tx.ticket.updateMany({
        where: { tenantId, requesterContactId: id },
        data: { requesterContactId: null },
      });
      await this.purgeConversationsInTransaction(tx, state.conversations, tenantId);
      const deleted = await tx.contact.deleteMany({
        where: { id, tenantId, updatedAt: state.contact.updatedAt },
      });
      if (deleted.count !== 1)
        return {
          kind: "changed" as const,
          impact: await this.contactImpactFromDatabase(tx, id, tenantId),
        };
      return {
        kind: "deleted" as const,
        mediaStorageKeys: state.conversations.mediaStorageKeys,
      };
    });
    if (result.kind === "changed") return changedDeletion(result.impact);
    const cleanup = await this.cleanupMedia(result.mediaStorageKeys);
    return { status: "deleted" as const, cleanup };
  }

  private async contactImpactFromDatabase(db: DatabaseClient, id: string, tenantId: string) {
    return this.contactImpactFromState(await this.loadContactState(db, id, tenantId));
  }

  private async loadConversationState(db: DatabaseClient, ids: string[], tenantId: string) {
    const conversations = await db.conversation.findMany({
      where: { tenantId, id: { in: ids } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        contactId: true,
        protocol: true,
        groupName: true,
        externalChatId: true,
        conversationType: true,
        updatedAt: true,
        messages: {
          orderBy: { id: "asc" },
          select: { id: true, mediaStorageKey: true, updatedAt: true },
        },
        contact: { select: { name: true, phone: true } },
        _count: { select: { participants: true, tickets: true } },
      },
    });
    if (conversations.length !== ids.length)
      throw new NotFoundException("Conversa não encontrada.");
    const messageIds = conversations.flatMap((conversation) =>
      conversation.messages.map((message) => message.id),
    );
    const aggregateIds = [...ids, ...messageIds];
    const outbox = aggregateIds.length
      ? await db.outboxEvent.findMany({
          where: { tenantId, aggregateId: { in: aggregateIds } },
          orderBy: { id: "asc" },
          select: { id: true, aggregateId: true, type: true, status: true, updatedAt: true },
        })
      : [];
    return {
      conversations,
      messageIds,
      outbox,
      mediaStorageKeys: [
        ...new Set(
          conversations.flatMap((conversation) =>
            conversation.messages.flatMap((message) =>
              message.mediaStorageKey ? [message.mediaStorageKey] : [],
            ),
          ),
        ),
      ],
    };
  }

  private conversationImpactFromState(state: ConversationPurgeState): DeletionImpactPreview {
    const first = state.conversations[0];
    const messages = state.conversations.reduce((total, item) => total + item.messages.length, 0);
    const participants = state.conversations.reduce(
      (total, item) => total + item._count.participants,
      0,
    );
    const tickets = state.conversations.reduce((total, item) => total + item._count.tickets, 0);
    const processingOutbox = state.outbox.filter(
      (item) => item.status === OutboxEventStatus.PROCESSING,
    );
    return {
      snapshotToken: deletionSnapshot({
        conversations: state.conversations.map((conversation) => ({
          id: conversation.id,
          updatedAt: conversation.updatedAt,
          messages: conversation.messages.map((message) => [message.id, message.updatedAt]),
          tickets: conversation._count.tickets,
          participants: conversation._count.participants,
        })),
        outbox: state.outbox.map((event) => [event.id, event.status, event.updatedAt]),
      }),
      title:
        first.conversationType === "GROUP"
          ? "Remover grupo localmente?"
          : "Excluir histórico da conversa?",
      prompt: "Revise tudo que será apagado permanentemente antes de confirmar.",
      record: {
        name: first.groupName ?? first.contact.name,
        identifiers: [
          { label: "Protocolo", value: first.protocol ?? "Sem protocolo" },
          { label: "Contato", value: first.contact.phone },
        ],
      },
      dependencies: [
        {
          id: "messages",
          label: "Mensagens e mídias",
          count: messages,
          operation: "delete",
          operationLabel: "Serão apagadas permanentemente",
        },
        {
          id: "participants",
          label: "Participantes",
          count: participants,
          operation: "delete",
          operationLabel: "Serão removidos do histórico local",
        },
        {
          id: "tickets",
          label: "Chamados",
          count: tickets,
          operation: "unlink",
          operationLabel: "Serão preservados sem vínculo com a conversa",
        },
        {
          id: "outbox",
          label: "Eventos pendentes",
          count: state.outbox.length,
          operation: "delete",
          operationLabel: "Eventos seguros serão cancelados e removidos",
        },
      ],
      consequences: [
        {
          id: "history",
          text: "O histórico e suas mídias não poderão ser recuperados.",
          irreversible: true,
        },
        {
          id: "tickets",
          text: "Chamados serão mantidos, porém sem abrir esta conversa.",
          irreversible: false,
        },
      ],
      confirmation: {
        level: "high",
        confirmLabel: "Excluir definitivamente",
        phrase: "EXCLUIR HISTÓRICO",
        inputLabel: "Digite EXCLUIR HISTÓRICO",
        instruction: "Esta ação é irreversível.",
      },
      ...(processingOutbox.length
        ? {
            blockedReason:
              "Existe processamento de mensagens em andamento. Aguarde a conclusão antes de excluir.",
          }
        : {}),
    };
  }

  private async loadContactState(db: DatabaseClient, id: string, tenantId: string) {
    const contact = await db.contact.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, phone: true, normalizedPhone: true, updatedAt: true },
    });
    if (!contact) throw new NotFoundException("Contato não encontrado.");
    const conversationIds = (
      await db.conversation.findMany({ where: { tenantId, contactId: id }, select: { id: true } })
    ).map((conversation) => conversation.id);
    const conversations = conversationIds.length
      ? await this.loadConversationState(db, conversationIds, tenantId)
      : { conversations: [], messageIds: [], outbox: [], mediaStorageKeys: [] };
    const [recipients, ticketCount, customFieldCount, tagCount, preferenceCount, leadCount] =
      await Promise.all([
        db.campaignRecipient.findMany({
          where: { tenantId, contactId: id },
          orderBy: { id: "asc" },
          select: { id: true, status: true, updatedAt: true },
        }),
        db.ticket.count({ where: { tenantId, requesterContactId: id } }),
        db.contactCustomFieldValue.count({ where: { tenantId, contactId: id } }),
        db.contactTag.count({ where: { tenantId, contactId: id } }),
        db.contactMessagingPreference.count({ where: { tenantId, contactId: id } }),
        db.lead.count({ where: { tenantId, contactId: id } }),
      ]);
    const recipientOutbox = recipients.length
      ? await db.outboxEvent.findMany({
          where: { tenantId, aggregateId: { in: recipients.map((recipient) => recipient.id) } },
          orderBy: { id: "asc" },
          select: { id: true, status: true, updatedAt: true },
        })
      : [];
    return {
      contact,
      conversations,
      recipients,
      recipientOutbox,
      ticketCount,
      customFieldCount,
      tagCount,
      preferenceCount,
      leadCount,
    };
  }

  private contactImpactFromState(state: ContactPurgeState): DeletionImpactPreview {
    const messageCount = state.conversations.conversations.reduce(
      (total, conversation) => total + conversation.messages.length,
      0,
    );
    const activeRecipientStatuses = new Set<CampaignRecipientStatus>([
      CampaignRecipientStatus.PENDING,
      CampaignRecipientStatus.QUEUED,
      CampaignRecipientStatus.PROCESSING,
    ]);
    const activeRecipients = state.recipients.filter((recipient) =>
      activeRecipientStatuses.has(recipient.status),
    );
    const processingOutbox = [...state.conversations.outbox, ...state.recipientOutbox].filter(
      (event) => event.status === OutboxEventStatus.PROCESSING,
    );
    return {
      snapshotToken: deletionSnapshot({
        contact: [state.contact.id, state.contact.updatedAt],
        conversations: state.conversations.conversations.map((conversation) => [
          conversation.id,
          conversation.updatedAt,
          conversation.messages.map((message) => [message.id, message.updatedAt]),
        ]),
        recipients: state.recipients.map((recipient) => [
          recipient.id,
          recipient.status,
          recipient.updatedAt,
        ]),
        recipientOutbox: state.recipientOutbox.map((event) => [
          event.id,
          event.status,
          event.updatedAt,
        ]),
        ticketCount: state.ticketCount,
        customFieldCount: state.customFieldCount,
        tagCount: state.tagCount,
        preferenceCount: state.preferenceCount,
        leadCount: state.leadCount,
      }),
      title: "Excluir contato e todo o histórico?",
      prompt: "Esta exclusão remove o contato e todas as conversas associadas.",
      record: {
        name: state.contact.name,
        identifiers: [{ label: "WhatsApp", value: state.contact.phone }],
      },
      dependencies: [
        {
          id: "conversations",
          label: "Conversas",
          count: state.conversations.conversations.length,
          operation: "delete",
          operationLabel: "Serão apagadas permanentemente",
        },
        {
          id: "messages",
          label: "Mensagens e mídias",
          count: messageCount,
          operation: "delete",
          operationLabel: "Serão apagadas permanentemente",
        },
        {
          id: "campaigns",
          label: "Destinatários de campanhas",
          count: state.recipients.length,
          operation: "delete",
          operationLabel: "Serão removidos das campanhas",
        },
        {
          id: "tickets",
          label: "Chamados",
          count: state.ticketCount,
          operation: "unlink",
          operationLabel: "Serão preservados sem o contato/conversa",
        },
        {
          id: "auxiliary",
          label: "Etiquetas, campos e preferências",
          count: state.customFieldCount + state.tagCount + state.preferenceCount,
          operation: "delete",
          operationLabel: "Serão apagados com o contato",
        },
      ],
      consequences: [
        {
          id: "contact",
          text: "O contato, conversas e mídias não poderão ser recuperados.",
          irreversible: true,
        },
        {
          id: "tickets",
          text: "Chamados permanecem disponíveis para auditoria.",
          irreversible: false,
        },
      ],
      confirmation: {
        level: "high",
        confirmLabel: "Excluir contato definitivamente",
        phrase: "EXCLUIR CONTATO",
        inputLabel: "Digite EXCLUIR CONTATO",
        instruction: "Confirme somente após revisar os impactos.",
      },
      ...(activeRecipients.length
        ? {
            blockedReason:
              "O contato possui campanha pendente ou em processamento. Cancele ou conclua o envio antes de excluir.",
          }
        : processingOutbox.length
          ? {
              blockedReason:
                "Existem operações em processamento para este contato. Aguarde a conclusão.",
            }
          : {}),
    };
  }

  private async purgeConversationsInTransaction(
    tx: Prisma.TransactionClient,
    state: ConversationPurgeState,
    tenantId: string,
  ) {
    const conversationIds = state.conversations.map((conversation) => conversation.id);
    if (!conversationIds.length) return;
    if (state.messageIds.length) {
      await tx.campaignRecipient.updateMany({
        where: { tenantId, messageId: { in: state.messageIds } },
        data: { messageId: null },
      });
    }
    await tx.ticket.updateMany({
      where: { tenantId, conversationId: { in: conversationIds } },
      data: { conversationId: null },
    });
    await tx.outboxEvent.deleteMany({
      where: {
        tenantId,
        aggregateId: { in: [...conversationIds, ...state.messageIds] },
        status: { not: OutboxEventStatus.PROCESSING },
      },
    });
    const deleted = await tx.conversation.deleteMany({
      where: { tenantId, id: { in: conversationIds } },
    });
    if (deleted.count !== conversationIds.length) {
      throw new BadRequestException("As conversas mudaram durante a exclusão. Tente novamente.");
    }
  }

  private async cleanupMedia(keys: string[]) {
    const results = await Promise.allSettled(
      keys.map((key) => this.mediaStorage.deleteObject(key)),
    );
    return results.some((result) => result.status === "rejected") ? "pending" : "completed";
  }
}
