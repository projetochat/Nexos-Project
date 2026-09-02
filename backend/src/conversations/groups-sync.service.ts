import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ConversationStatus,
  ConversationType,
  MessagingConnectionStatus,
  MessagingProviderType,
} from "../generated/prisma";
import { EvolutionClient } from "../messaging/evolution/evolution.client";
import { PrismaService } from "../prisma/prisma.service";

type EvolutionGroupSnapshot = Awaited<ReturnType<EvolutionClient["fetchGroups"]>>[number];

@Injectable()
export class GroupsSyncService {
  private readonly logger = new Logger(GroupsSyncService.name);
  private readonly queuedKeys = new Set<string>();
  private readonly recentAttempts = new Map<string, number>();
  private pending: Array<{ tenantId: string; connectionId?: string }> = [];
  private draining = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
  ) {}

  enqueue(input: { tenantId: string; connectionId?: string }) {
    const key = queueKey(input);
    const now = Date.now();
    const lastAttempt = this.recentAttempts.get(key);
    if (this.queuedKeys.has(key) || (lastAttempt && now - lastAttempt < GROUP_SYNC_RETRY_MS)) {
      return;
    }
    this.queuedKeys.add(key);
    this.pending.push(input);
    this.scheduleDrain();
  }

  async sync(input: { tenantId: string; connectionId?: string }) {
    const connections = await this.prisma.messagingConnection.findMany({
      where: {
        tenantId: input.tenantId,
        archivedAt: null,
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        ...(input.connectionId ? { id: input.connectionId } : {}),
      },
    });

    let synced = 0;
    for (const connection of connections) {
      if (!connection.externalReference) continue;
      const groups = await this.evolution.fetchGroups({
        instanceName: connection.externalReference,
      });
      for (const group of groups) {
        const detailedGroup = await this.safeGroupInfo(connection.externalReference, group);
        const imageUrl =
          detailedGroup.imageUrl ??
          (await this.safeGroupPicture(connection.externalReference, detailedGroup.groupJid));
        await this.upsertSyncedGroup(input.tenantId, connection.id, connection.externalReference, {
          ...detailedGroup,
          imageUrl,
        });
        synced += 1;
      }
    }

    return { synced };
  }

  private scheduleDrain() {
    if (this.drainTimer || this.draining) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      void this.drain();
    }, 250);
  }

  private async safeGroupInfo(instanceName: string, group: EvolutionGroupSnapshot) {
    try {
      const detail = await this.evolution.findGroupInfo({
        instanceName,
        groupJid: group.groupJid,
      });
      if (!detail) return group;
      const detailParticipants = detail.participants ?? [];
      return {
        ...group,
        subject: detail.subject ?? detail.name ?? group.subject,
        imageUrl: group.imageUrl ?? detail.imageUrl,
        createdAt: group.createdAt ?? detail.createdAt,
        participants:
          detailParticipants.length > group.participants.length
            ? detailParticipants
            : group.participants,
      };
    } catch {
      return group;
    }
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length) {
        const item = this.pending.shift();
        if (!item) break;
        const key = queueKey(item);
        this.queuedKeys.delete(key);
        this.recentAttempts.set(key, Date.now());
        await this.sync(item);
      }
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel sincronizar grupos em segundo plano: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.draining = false;
      this.trimRecentAttempts(Date.now());
      if (this.pending.length) this.scheduleDrain();
    }
  }

  private async safeGroupPicture(instanceName: string, groupJid: string) {
    try {
      return await this.evolution.fetchProfilePictureUrl({ instanceName, number: groupJid });
    } catch {
      return null;
    }
  }

  private async upsertSyncedGroup(
    tenantId: string,
    connectionId: string,
    instanceName: string,
    group: EvolutionGroupSnapshot,
  ) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.upsert({
        where: {
          tenantId_normalizedPhone: {
            tenantId,
            normalizedPhone: `group:${group.groupJid}`,
          },
        },
        update: {
          name: group.subject,
          phone: group.groupJid,
          avatarUrl: group.imageUrl ?? undefined,
          instance: instanceName,
          archivedAt: null,
        },
        create: {
          tenantId,
          name: group.subject,
          phone: group.groupJid,
          normalizedPhone: `group:${group.groupJid}`,
          avatarUrl: group.imageUrl ?? undefined,
          instance: instanceName,
        },
      });

      const existingConversation = await tx.conversation.findFirst({
        where: {
          tenantId,
          connectionId,
          externalChatId: group.groupJid,
          conversationType: ConversationType.GROUP,
        },
      });

      const metadata = {
        syncedAt: now.toISOString(),
        createdAt: group.createdAt?.toISOString() ?? null,
      };
      const conversation = existingConversation
        ? await tx.conversation.update({
            where: { tenantId_id: { tenantId, id: existingConversation.id } },
            data: {
              contactId: contact.id,
              groupName: group.subject,
              groupImageUrl: group.imageUrl ?? undefined,
              groupMetadataJson: metadata,
              isGroup: true,
              conversationType: ConversationType.GROUP,
              archivedAt: null,
            },
          })
        : await tx.conversation.create({
            data: {
              tenantId,
              contactId: contact.id,
              connectionId,
              status: ConversationStatus.ABERTA,
              isGroup: true,
              conversationType: ConversationType.GROUP,
              externalChatId: group.groupJid,
              externalGroupId: group.groupJid,
              groupName: group.subject,
              groupImageUrl: group.imageUrl ?? undefined,
              groupMetadataJson: metadata,
            },
          });

      for (const participant of group.participants) {
        await tx.conversationParticipant.upsert({
          where: {
            tenantId_conversationId_externalParticipantId: {
              tenantId,
              conversationId: conversation.id,
              externalParticipantId: participant.externalParticipantId,
            },
          },
          update: {
            phone: participant.phone ?? undefined,
            displayName: participant.displayName ?? undefined,
            isAdmin: participant.isAdmin,
            isSuperAdmin: participant.isSuperAdmin,
            active: true,
            lastSeenAt: now,
          },
          create: {
            tenantId,
            conversationId: conversation.id,
            externalParticipantId: participant.externalParticipantId,
            phone: participant.phone,
            displayName: participant.displayName,
            isAdmin: participant.isAdmin,
            isSuperAdmin: participant.isSuperAdmin,
            lastSeenAt: now,
          },
        });
      }
    });
  }

  private trimRecentAttempts(now: number) {
    for (const [key, attemptedAt] of this.recentAttempts) {
      if (now - attemptedAt > GROUP_SYNC_RETRY_MS) {
        this.recentAttempts.delete(key);
      }
    }
  }
}

const GROUP_SYNC_RETRY_MS = 3 * 60 * 60 * 1000;

function queueKey(input: { tenantId: string; connectionId?: string }) {
  return `${input.tenantId}:${input.connectionId ?? "all"}`;
}
