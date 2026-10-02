import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import {
  ConversationStatus,
  ConversationType,
  MessagingConnectionStatus,
  MessagingProviderType,
} from "../generated/prisma";
import { EvolutionClient } from "../messaging/evolution/evolution.client";
import { PrismaService } from "../prisma/prisma.service";
import { contactPhoneDuplicateCandidates, normalizePhone } from "../crm/phone-normalization";

type EvolutionGroupSnapshot = Awaited<ReturnType<EvolutionClient["fetchGroups"]>>[number];
type GroupSyncInput = {
  tenantId: string;
  connectionId?: string;
  includeParticipants?: boolean;
  departmentIds?: string[];
};

type GroupPictureTarget = {
  tenantId: string;
  contactId: string;
  conversationId: string;
  instanceName: string;
  groupJid: string;
};

@Injectable()
export class GroupsSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(GroupsSyncService.name);
  private readonly queuedPictureKeys = new Set<string>();
  private readonly recentPictureAttempts = new Map<string, number>();
  private pendingPictures: GroupPictureTarget[] = [];
  private drainingPictures = false;
  private pictureDrainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
  ) {}

  onModuleDestroy() {
    if (this.pictureDrainTimer) clearTimeout(this.pictureDrainTimer);
  }

  async reconcileGroupParticipantNames(input: {
    tenantId: string;
    connectionIds?: string[];
    departmentIds?: string[];
  }) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        tenantId: input.tenantId,
        active: true,
        conversation: {
          tenantId: input.tenantId,
          archivedAt: null,
          conversationType: ConversationType.GROUP,
          ...(input.connectionIds ? { connectionId: { in: input.connectionIds } } : {}),
          ...(input.departmentIds ? { departmentId: { in: input.departmentIds } } : {}),
        },
      },
      select: {
        id: true,
        phone: true,
        externalParticipantId: true,
        displayName: true,
        conversation: {
          select: {
            connection: {
              select: { ownerPhoneNormalized: true },
            },
          },
        },
      },
    });
    if (!participants.length) return { updated: 0, checked: 0 };

    const participantCandidates = participants.map((participant) => ({
      id: participant.id,
      currentName: participant.displayName,
      ownerPhone: participant.conversation.connection?.ownerPhoneNormalized ?? null,
      candidates: participantPhoneCandidates(participant.phone, participant.externalParticipantId),
    }));
    const allPhoneCandidates = [
      ...new Set(participantCandidates.flatMap((participant) => participant.candidates)),
    ];
    const contacts = allPhoneCandidates.length
      ? await this.prisma.contact.findMany({
          where: {
            tenantId: input.tenantId,
            archivedAt: null,
            normalizedPhone: { in: allPhoneCandidates },
            NOT: { normalizedPhone: { startsWith: "group:" } },
          },
          select: { name: true, normalizedPhone: true },
        })
      : [];
    const contactByPhone = new Map(
      contacts.map((contact) => [contact.normalizedPhone, contact.name]),
    );

    let updated = 0;
    for (const participant of participantCandidates) {
      const resolvedName = resolveParticipantDisplayName(participant, contactByPhone);
      if (!resolvedName || resolvedName === participant.currentName) continue;
      await this.prisma.conversationParticipant.updateMany({
        where: { tenantId: input.tenantId, id: participant.id },
        data: { displayName: resolvedName },
      });
      updated += 1;
    }

    return { updated, checked: participants.length };
  }

  async sync(input: GroupSyncInput) {
    const startedAt = Date.now();
    const connections = await this.prisma.messagingConnection.findMany({
      where: {
        tenantId: input.tenantId,
        archivedAt: null,
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        ...(input.connectionId ? { id: input.connectionId } : {}),
      },
    });

    const includeParticipants = input.includeParticipants ?? true;
    const result = {
      synced: 0,
      created: 0,
      updated: 0,
      failed: 0,
      connections: connections.length,
      groups: 0,
      participants: 0,
      inactiveParticipants: 0,
      participantNamesUpdated: 0,
      includeParticipants,
    };

    for (const connection of connections) {
      if (!connection.externalReference) continue;
      await this.markConnectionSyncing(input.tenantId, connection.id);
      let connectionFailed = false;
      let connectionSynced = 0;
      try {
        const departmentId = await this.groupDepartmentId(
          input.tenantId,
          connection.id,
          input.departmentIds,
        );
        const groups = await this.evolution.fetchGroups({
          instanceName: connection.externalReference,
          getParticipants: includeParticipants,
        });
        result.groups += groups.length;

        const groupResults = await mapWithConcurrency(
          groups,
          GROUP_SYNC_CONCURRENCY,
          async (group) => {
            const detailedGroup = includeParticipants
              ? await this.safeGroupInfo(connection.externalReference!, group)
              : group;
            return this.upsertSyncedGroup(
              input.tenantId,
              connection.id,
              connection.externalReference!,
              departmentId,
              input.departmentIds,
              detailedGroup,
            );
          },
        );

        for (const groupResult of groupResults) {
          if (groupResult.status === "fulfilled") {
            if (groupResult.value.skipped) continue;
            result.synced += 1;
            connectionSynced += 1;
            result.participants += groupResult.value.participants;
            result.inactiveParticipants += groupResult.value.inactiveParticipants;
            if (groupResult.value.created) result.created += 1;
            else result.updated += 1;
          } else {
            connectionFailed = true;
            result.failed += 1;
            this.logger.warn(
              `Nao foi possivel sincronizar um grupo da instancia ${connection.id}: ${
                groupResult.reason instanceof Error
                  ? groupResult.reason.message
                  : String(groupResult.reason)
              }`,
            );
          }
        }
      } catch (error) {
        connectionFailed = true;
        result.failed += 1;
        await this.markConnectionSyncFinished(
          input.tenantId,
          connection.id,
          "ERROR",
          connectionSynced,
          error,
        );
        this.logger.warn(
          `Nao foi possivel buscar grupos da instancia ${connection.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }

      await this.markConnectionSyncFinished(
        input.tenantId,
        connection.id,
        connectionFailed ? "PARTIAL_ERROR" : "SUCCESS",
        connectionSynced,
        connectionFailed ? "Alguns grupos não puderam ser sincronizados." : null,
      );
    }

    if (includeParticipants) {
      const reconciliation = await this.reconcileGroupParticipantNames({
        tenantId: input.tenantId,
        ...(input.connectionId ? { connectionIds: [input.connectionId] } : {}),
        ...(input.departmentIds ? { departmentIds: input.departmentIds } : {}),
      });
      result.participantNamesUpdated = reconciliation.updated;
    }

    this.logger.debug({
      event: "groups.sync",
      durationMs: Date.now() - startedAt,
      connectionId: input.connectionId ?? null,
      connections: result.connections,
      groups: result.groups,
      participants: result.participants,
      failed: result.failed,
      includeParticipants,
    });
    return result;
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

  private enqueueGroupPicture(target: GroupPictureTarget) {
    const key = `${target.tenantId}:${target.conversationId}`;
    const now = Date.now();
    const lastAttempt = this.recentPictureAttempts.get(key);
    if (
      this.queuedPictureKeys.has(key) ||
      (lastAttempt && now - lastAttempt < GROUP_PICTURE_RETRY_INTERVAL_MS)
    ) {
      return;
    }
    this.queuedPictureKeys.add(key);
    this.pendingPictures.push(target);
    if (this.pendingPictures.length > 100) {
      const overflow = this.pendingPictures.splice(0, this.pendingPictures.length - 100);
      for (const item of overflow)
        this.queuedPictureKeys.delete(`${item.tenantId}:${item.conversationId}`);
    }
    this.schedulePictureDrain();
  }

  private schedulePictureDrain() {
    if (this.pictureDrainTimer || this.drainingPictures) return;
    this.pictureDrainTimer = setTimeout(() => {
      this.pictureDrainTimer = null;
      void this.drainPictures();
    }, 250);
  }

  private async drainPictures() {
    if (this.drainingPictures) return;
    this.drainingPictures = true;
    try {
      while (this.pendingPictures.length) {
        const target = this.pendingPictures.shift();
        if (!target) break;
        const key = `${target.tenantId}:${target.conversationId}`;
        this.queuedPictureKeys.delete(key);
        this.recentPictureAttempts.set(key, Date.now());
        const imageUrl = await this.safeGroupPicture(target.instanceName, target.groupJid);
        if (!imageUrl) continue;
        await this.prisma.$transaction([
          this.prisma.contact.updateMany({
            where: {
              tenantId: target.tenantId,
              id: target.contactId,
              OR: [{ avatarUrl: null }, { avatarUrl: "" }],
            },
            data: { avatarUrl: imageUrl },
          }),
          this.prisma.conversation.updateMany({
            where: {
              tenantId: target.tenantId,
              id: target.conversationId,
              OR: [{ groupImageUrl: null }, { groupImageUrl: "" }],
            },
            data: { groupImageUrl: imageUrl },
          }),
        ]);
      }
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel sincronizar fotos de grupos em segundo plano: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.drainingPictures = false;
      this.trimRecentPictureAttempts(Date.now());
      if (this.pendingPictures.length) this.schedulePictureDrain();
    }
  }

  private async safeGroupPicture(instanceName: string, groupJid: string) {
    try {
      return await this.evolution.fetchProfilePictureUrl({ instanceName, number: groupJid });
    } catch {
      return null;
    }
  }

  private trimRecentPictureAttempts(now: number) {
    for (const [key, attemptedAt] of this.recentPictureAttempts) {
      if (now - attemptedAt > GROUP_PICTURE_RETRY_INTERVAL_MS) {
        this.recentPictureAttempts.delete(key);
      }
    }
  }

  private async markConnectionSyncing(tenantId: string, connectionId: string) {
    await this.prisma.messagingConnection.updateMany({
      where: { tenantId, id: connectionId },
      data: { groupsSyncStatus: "SYNCING", groupsSyncError: null },
    });
  }

  private async markConnectionSyncFinished(
    tenantId: string,
    connectionId: string,
    status: "SUCCESS" | "PARTIAL_ERROR" | "ERROR",
    syncedCount: number,
    error: unknown,
  ) {
    await this.prisma.messagingConnection.updateMany({
      where: { tenantId, id: connectionId },
      data: {
        groupsLastSyncedAt: new Date(),
        groupsSyncStatus: status,
        groupsSyncError: error ? errorMessage(error) : null,
        groupsSyncedCount: syncedCount,
      },
    });
  }

  private async upsertSyncedGroup(
    tenantId: string,
    connectionId: string,
    instanceName: string,
    departmentId: string | null,
    allowedDepartmentIds: string[] | undefined,
    group: EvolutionGroupSnapshot,
  ) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const existingConversation = await tx.conversation.findFirst({
        where: {
          tenantId,
          connectionId,
          externalChatId: group.groupJid,
          conversationType: ConversationType.GROUP,
        },
      });
      if (
        allowedDepartmentIds &&
        (existingConversation
          ? !existingConversation.departmentId ||
            !allowedDepartmentIds.includes(existingConversation.departmentId)
          : !departmentId)
      ) {
        return {
          skipped: true as const,
          contactId: "",
          conversationId: "",
          created: false,
          participants: 0,
          inactiveParticipants: 0,
        };
      }

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
              departmentId: existingConversation.departmentId ?? departmentId,
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
              departmentId,
              externalChatId: group.groupJid,
              externalGroupId: group.groupJid,
              groupName: group.subject,
              groupImageUrl: group.imageUrl ?? undefined,
              groupMetadataJson: metadata,
              inboxArchivedAt: null,
            },
          });

      const participants = group.participants.filter(
        (participant) => participant.externalParticipantId,
      );
      for (const participant of participants) {
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

      let inactiveParticipants = 0;
      if (participants.length) {
        const inactive = await tx.conversationParticipant.updateMany({
          where: {
            tenantId,
            conversationId: conversation.id,
            active: true,
            externalParticipantId: {
              notIn: participants.map((participant) => participant.externalParticipantId),
            },
          },
          data: { active: false },
        });
        inactiveParticipants = inactive.count;
      }

      return {
        skipped: false as const,
        contactId: contact.id,
        conversationId: conversation.id,
        created: !existingConversation,
        participants: participants.length,
        inactiveParticipants,
      };
    });

    if (result.skipped) return result;
    if (!group.imageUrl) {
      this.enqueueGroupPicture({
        tenantId,
        contactId: result.contactId,
        conversationId: result.conversationId,
        instanceName,
        groupJid: group.groupJid,
      });
    }

    return result;
  }

  private async groupDepartmentId(
    tenantId: string,
    connectionId: string,
    allowedDepartmentIds?: string[],
  ) {
    const department = await this.prisma.department.findFirst({
      where: {
        tenantId,
        active: true,
        connections: { some: { connectionId } },
        ...(allowedDepartmentIds ? { id: { in: allowedDepartmentIds } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return department?.id ?? null;
  }
}

const GROUP_SYNC_CONCURRENCY = 4;
const GROUP_PICTURE_RETRY_INTERVAL_MS = 3 * 60 * 60 * 1000;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index]) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function participantPhoneCandidates(...values: Array<string | null | undefined>) {
  const candidates = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const raw = value.split("@")[0]?.split(":")[0] ?? value;
    const digits = raw.replace(/\D/g, "");
    if (!digits) continue;
    for (const candidate of [raw, digits, `+${digits}`]) {
      try {
        for (const normalized of contactPhoneDuplicateCandidates(normalizePhone(candidate))) {
          candidates.add(normalized);
        }
      } catch {
        // Ignore identifiers that are not valid phone numbers for the CRM catalog.
      }
    }
  }
  return [...candidates];
}

function resolveParticipantDisplayName(
  participant: {
    currentName: string | null;
    ownerPhone: string | null;
    candidates: string[];
  },
  contactByPhone: Map<string, string>,
) {
  const ownerCandidates = participantPhoneCandidates(participant.ownerPhone);
  if (ownerCandidates.some((candidate) => participant.candidates.includes(candidate)))
    return "Você";
  for (const candidate of participant.candidates) {
    const contactName = contactByPhone.get(candidate)?.trim();
    if (contactName) return contactName;
  }
  return null;
}
