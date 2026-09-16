import { connectionIdAccess } from "../auth/connection-access";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  ConversationStatus,
  MessageDirection,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
  Prisma,
} from "../generated/prisma";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { GroupsSyncService } from "../conversations/groups-sync.service";
import { phoneFromRemoteIdentity } from "./messaging-identity";
import { EvolutionClient } from "./evolution/evolution.client";
import {
  assertEvolutionConfigured,
  evolutionConfigFromEnv,
  normalizeSecret,
} from "./evolution/evolution.config";
import { CreateEvolutionConnectionDto } from "./dto/create-evolution-connection.dto";
import { UpdateMessagingConnectionDto } from "./dto/update-messaging-connection.dto";
import { MessagingErrorCode, MessagingProviderError } from "./messaging.contracts";

@Injectable()
export class MessagingConnectionsService {
  private readonly logger = new Logger(MessagingConnectionsService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EvolutionClient)
    private readonly evolution: EvolutionClient,
    @Optional()
    @Inject(PlanEntitlementService)
    private readonly entitlements?: PlanEntitlementService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
    @Optional() @Inject(GroupsSyncService) private readonly groupsSync?: GroupsSyncService,
  ) {}

  async list(current: AuthenticatedUser) {
    const connections = await this.prisma.messagingConnection.findMany({
      where: {
        tenantId: current.tenantId,
        ...connectionIdAccess(current),
        providerType: MessagingProviderType.EVOLUTION,
        archivedAt: null,
      },
      orderBy: [{ providerType: "asc" }, { createdAt: "asc" }],
    });
    return connections.map((connection) => this.serialize(connection));
  }

  async detail(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    return this.serialize(connection);
  }

  async createEvolution(dto: CreateEvolutionConnectionDto, current: AuthenticatedUser) {
    const importHistoryEnabled = dto.importHistoryEnabled === true;
    const importHistoryStartDate = parseImportStartDate(dto.importHistoryStartDate);
    const importGroupsEnabled = dto.importGroupsEnabled === true;
    const importGroupsStartDate = parseImportStartDate(dto.importGroupsStartDate);
    if (importHistoryEnabled && !importHistoryStartDate) {
      throw new BadRequestException(
        "Informe a data inicial para importar o histórico de mensagens.",
      );
    }
    if (importGroupsEnabled && !importGroupsStartDate) {
      throw new BadRequestException("Informe a data inicial para importar mensagens de grupo.");
    }

    if (this.entitlements) {
      await this.entitlements.assertTenantOperational(current.tenantId);
      const usage = await this.entitlements.getUsage(current.tenantId);
      const entitlement = await this.entitlements.getEntitlements(current.tenantId);
      await this.entitlements.assertWithinLimit(
        current.tenantId,
        "maxConnections",
        usage.connections,
      );
      if (usage.connections >= 1 && !entitlement.features.multipleConnections) {
        throw new BadRequestException({ code: "PLAN_FEATURE_NOT_AVAILABLE" });
      }
    }
    const config = evolutionConfigFromEnv();
    if (!assertEvolutionConfigured(config)) {
      throw new BadRequestException("Evolution API não configurada.");
    }

    const instanceName = cleanInstanceName(dto.name, current.tenantId, { unique: true });
    let response: Awaited<ReturnType<EvolutionClient["createInstance"]>>;
    try {
      response = await this.evolution.createInstance({
        instanceName,
      });
    } catch (error) {
      this.logger.warn({
        event: "messaging.connection.create_failed",
        tenantId: current.tenantId,
        instanceName: sanitizeInstanceName(instanceName),
        providerError: sanitizeProviderError(error),
      });
      throw providerUnavailableForUi(error, "Não foi possível criar a instância na Evolution.");
    }
    if (!config.webhookPublicUrl || !config.webhookSecret) {
      await this.evolution.deleteInstance(instanceName).catch(() => undefined);
      throw new BadRequestException("Webhook Evolution não configurado.");
    }
    await this.ensureWebhookConfiguredSafely(instanceName, "pending-create");

    let connection: Awaited<ReturnType<PrismaService["messagingConnection"]["create"]>>;
    try {
      connection = await this.prisma.messagingConnection.create({
        data: {
          tenantId: current.tenantId,
          name: dto.name.trim(),
          color: normalizeColor(dto.color),
          providerType: MessagingProviderType.EVOLUTION,
          status: translateInitialStatus(
            response.instance?.status ?? response.instance?.connectionStatus,
          ),
          externalReference: instanceName,
          importHistoryEnabled,
          importHistoryStartDate: importHistoryEnabled ? importHistoryStartDate : null,
          importGroupsEnabled,
          importGroupsStartDate: importGroupsEnabled ? importGroupsStartDate : null,
        },
      });
    } catch (error) {
      await this.evolution.deleteInstance(instanceName).catch((cleanupError) => {
        this.logger.warn({
          event: "messaging.connection.create_cleanup_failed",
          tenantId: current.tenantId,
          instanceName: sanitizeInstanceName(instanceName),
          providerError: sanitizeProviderError(cleanupError),
        });
      });
      throw error;
    }
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      status: connection.status.toLowerCase(),
      updatedAt: connection.updatedAt,
    });
    this.enqueueGroupSyncForConnectedConnection(connection);
    return {
      ...this.serialize(connection),
      qrCodeBase64: evolutionQrBase64(response),
    };
  }

  async status(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      return this.serialize(connection);
    }
    const instance = await this.evolution.findInstance(connection.externalReference);
    if (!instance) return this.markOrphan(connection.id);
    const state = await this.evolution.connectionState(connection.externalReference);
    const translatedStatus = translateEvolutionState(
      state.instance?.state ?? state.instance?.status,
    );
    if (translatedStatus === MessagingConnectionStatus.CONNECTED) {
      await this.ensureWebhookConfiguredSafely(connection.externalReference, connection.id);
    }
    const ownerExternalId = instance.ownerJid ?? null;
    const ownerPhoneNormalized = normalizeOwnerPhone(ownerExternalId);
    const profilePictureUrl =
      translatedStatus === MessagingConnectionStatus.CONNECTED
        ? await this.fetchProfilePictureUrlSafely({
            instanceName: connection.externalReference,
            ownerExternalId,
            ownerPhoneNormalized,
          })
        : undefined;
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: {
        status: translatedStatus,
        ownerExternalId: ownerExternalId ?? undefined,
        ownerPhoneNormalized: ownerPhoneNormalized ?? undefined,
        logoUrl: profilePictureUrl,
      },
    });
    if (updated.status !== connection.status) {
      this.realtime?.publishConnectionStatusUpdated({
        tenantId: updated.tenantId,
        connectionId: updated.id,
        status: updated.status.toLowerCase(),
        updatedAt: updated.updatedAt,
      });
    }
    this.enqueueGroupSyncForConnectedConnection(updated);
    return this.serialize(updated, { existsInProvider: true, webhookUrl: instance.Webhook?.url });
  }

  async qrCode(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection não é Evolution.");
    }
    const instance = await this.evolution.findInstance(connection.externalReference);
    if (!instance) {
      await this.markOrphan(connection.id);
      throw new BadRequestException("INSTANCE_NOT_FOUND: instance Evolution não encontrada.");
    }
    const response = await this.evolution.connect(connection.externalReference);
    await this.ensureWebhookConfiguredSafely(connection.externalReference, connection.id);
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { status: MessagingConnectionStatus.CONNECTING },
    });
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: updated.tenantId,
      connectionId: updated.id,
      status: updated.status.toLowerCase(),
      updatedAt: updated.updatedAt,
    });
    return {
      connectionId: connection.id,
      qrCodeBase64: evolutionQrBase64(response),
      status: "connecting",
    };
  }

  async update(id: string, dto: UpdateMessagingConnectionDto, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (connection.archivedAt || connection.status === MessagingConnectionStatus.REMOVED) {
      throw new BadRequestException("Connection removida não pode ser editada.");
    }
    if (connection.status === MessagingConnectionStatus.CONNECTING) {
      throw new BadRequestException("Aguarde a conexão da instância para editá-la.");
    }
    const welcomeEnabled = dto.welcomeEnabled ?? connection.welcomeEnabled;
    const welcomeNewMessage =
      dto.welcomeNewMessage === undefined
        ? connection.welcomeNewMessage
        : cleanOptionalText(dto.welcomeNewMessage);
    const welcomeExistingMessage =
      dto.welcomeExistingMessage === undefined
        ? connection.welcomeExistingMessage
        : cleanOptionalText(dto.welcomeExistingMessage);
    if (welcomeEnabled && (!welcomeNewMessage || !welcomeExistingMessage)) {
      throw new BadRequestException(
        "Preencha as mensagens para novo contato e contato existente antes de ativar a saudação.",
      );
    }
    const absenceEnabled = dto.absenceEnabled ?? connection.absenceEnabled;
    const absenceMessage =
      dto.absenceMessage === undefined
        ? connection.absenceMessage
        : cleanOptionalText(dto.absenceMessage);
    if (absenceEnabled && !absenceMessage) {
      throw new BadRequestException("Preencha a mensagem de ausência antes de ativá-la.");
    }
    const updated = await this.prisma.messagingConnection.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: connection.id } },
      data: {
        name: dto.name?.trim(),
        color: normalizeColor(dto.color),
        welcomeEnabled,
        welcomeNewMessage,
        welcomeExistingMessage,
        absenceEnabled,
        absenceMessage,
        notes: cleanOptionalText(dto.notes),
      },
    });
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: updated.tenantId,
      connectionId: updated.id,
      status: updated.status.toLowerCase(),
      updatedAt: updated.updatedAt,
    });
    return this.serialize(updated);
  }

  async refreshProfilePicture(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    const { instanceName } = this.profilePictureLookupTarget(connection);
    const number = profilePictureLookupNumber(connection);
    if (!number) throw new BadRequestException("O número da instância não está disponível.");
    const logoUrl = await this.evolution.fetchProfilePictureUrl({
      instanceName,
      number,
    });
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { logoUrl },
    });
    return this.serialize(updated);
  }

  async updateProfilePicture(
    id: string,
    imageDataUrl: string | undefined,
    current: AuthenticatedUser,
  ) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    const { instanceName } = this.profilePictureLookupTarget(connection);
    const image = decodeProfilePictureDataUrl(imageDataUrl);
    await this.evolution.updateProfilePicture({
      instanceName,
      media: image.body,
      mimeType: image.mimeType,
      fileName: image.fileName,
    });
    const profilePictureUrl = await this.fetchProfilePictureUrlSafely({
      instanceName,
      ownerExternalId: connection.ownerExternalId,
      ownerPhoneNormalized: connection.ownerPhoneNormalized,
    });
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { logoUrl: profilePictureUrl ?? imageDataUrl },
    });
    return this.serialize(updated);
  }

  async removeProfilePicture(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    const { instanceName } = this.profilePictureLookupTarget(connection);
    await this.evolution.removeProfilePicture(instanceName);
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { logoUrl: null },
    });
    return this.serialize(updated);
  }

  async logout(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection não é Evolution.");
    }
    if (
      connection.status !== MessagingConnectionStatus.CONNECTED &&
      !connection.ownerPhoneNormalized
    ) {
      throw new BadRequestException(
        "Instância ainda não possui conexão concluída para desconectar.",
      );
    }
    if (connection.status === MessagingConnectionStatus.DISCONNECTED) {
      return this.serialize(connection);
    }
    try {
      await this.evolution.logout(connection.externalReference);
    } catch (error) {
      this.logger.warn({
        event: "messaging.connection.logout_provider_failed",
        connectionId: connection.id,
        tenantId: connection.tenantId,
        instanceName: sanitizeInstanceName(connection.externalReference),
        providerError: sanitizeProviderError(error),
        httpResult: 200,
      });
    }
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { status: MessagingConnectionStatus.DISCONNECTED },
    });
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: updated.tenantId,
      connectionId: updated.id,
      status: updated.status.toLowerCase(),
      updatedAt: updated.updatedAt,
    });
    return this.serialize(updated);
  }

  async providerHealth() {
    const config = evolutionConfigFromEnv();
    const missing = [
      !config.baseUrl ? "EVOLUTION_BASE_URL" : null,
      !config.apiKey ? "EVOLUTION_API_KEY" : null,
      !config.webhookSecret ? "EVOLUTION_WEBHOOK_SECRET" : null,
      !config.webhookPublicUrl ? "EVOLUTION_WEBHOOK_PUBLIC_URL" : null,
    ].filter(Boolean);
    if (missing.length) {
      return { ok: false, configured: false, missing };
    }
    return this.evolution.health();
  }

  async remove(id: string, current: AuthenticatedUser, options: RemoveConnectionOptions = {}) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    const references = await this.connectionReferenceCounts(connection.tenantId, connection.id);
    const baseLog = {
      event: "messaging.connection.remove",
      connectionId: connection.id,
      tenantId: connection.tenantId,
      instanceName: sanitizeInstanceName(connection.externalReference),
      connectionStatus: connection.status,
      references,
    };
    if (connection.archivedAt || connection.status === MessagingConnectionStatus.REMOVED) {
      const cleanup = await this.cleanupConnectionConversations(connection, options);
      this.logger.log({
        ...baseLog,
        authResult: "allowed",
        providerResult: "skipped_already_removed",
        httpResult: 200,
      });
      return {
        id: connection.id,
        removed: true,
        archived: true,
        status: "removed",
        providerInstanceExisted: false,
        idempotent: true,
        ...cleanup,
      };
    }
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection não é Evolution.");
    }

    const providerDelete = await this.deleteEvolutionInstanceForRemoval(
      connection.externalReference,
      baseLog,
    );
    const archivedAt = new Date();
    const cleanup = await this.cleanupConnectionConversations(connection, options, archivedAt);
    const updated = await this.prisma.messagingConnection.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: connection.id } },
      data: {
        status: MessagingConnectionStatus.REMOVED,
        externalReference: null,
        ownerExternalId: null,
        ownerPhoneNormalized: null,
        archivedAt,
      },
    });

    this.realtime?.publishConnectionStatusUpdated({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      status: "removed",
      updatedAt: updated.updatedAt,
    });
    this.logger.log({
      ...baseLog,
      providerResult: providerDelete.result,
      evolutionHttpStatus: providerDelete.httpStatus,
      httpResult: 200,
      archivedAt,
    });
    return {
      id: connection.id,
      removed: true,
      archived: true,
      status: "removed",
      providerInstanceExisted: providerDelete.instanceExisted,
      idempotent: providerDelete.idempotent,
      ...cleanup,
    };
  }

  private async cleanupConnectionConversations(
    connection: { id: string; tenantId: string },
    options: RemoveConnectionOptions,
    removedAt = new Date(),
  ) {
    if (options.removeConversationHistory) {
      const removed = await this.prisma.conversation.updateMany({
        where: {
          tenantId: connection.tenantId,
          connectionId: connection.id,
          archivedAt: null,
        },
        data: { archivedAt: removedAt, inboxArchivedAt: removedAt },
      });
      return {
        removedConversationHistoryCount: removed.count,
        closedChatConversationCount: 0,
      };
    }

    const activeConversations = await this.prisma.conversation.findMany({
      where: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        status: { not: ConversationStatus.FECHADA },
        archivedAt: null,
      },
      select: { id: true },
    });
    const closed = await this.prisma.conversation.updateMany({
      where: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        status: { not: ConversationStatus.FECHADA },
        archivedAt: null,
      },
      data: {
        status: ConversationStatus.FECHADA,
        closedAt: removedAt,
        inboxArchivedAt: null,
      },
    });
    if (activeConversations.length) {
      await this.prisma.message.createMany({
        data: activeConversations.map((conversation) => ({
          tenantId: connection.tenantId,
          conversationId: conversation.id,
          connectionId: connection.id,
          direction: MessageDirection.SYSTEM,
          type: MessageType.SYSTEM,
          content: INSTANCE_REMOVAL_CLOSE_MESSAGE,
          createdAt: removedAt,
        })),
      });
    }
    return {
      removedConversationHistoryCount: 0,
      closedChatConversationCount: closed.count,
    };
  }

  async findByEvolutionInstance(instanceName: string) {
    return this.prisma.messagingConnection.findFirst({
      where: {
        providerType: MessagingProviderType.EVOLUTION,
        externalReference: instanceName,
      },
    });
  }

  async ensureWebhookConfigured(instanceName: string) {
    const config = evolutionConfigFromEnv();
    if (!config.webhookPublicUrl || !config.webhookSecret) {
      throw new BadRequestException("Webhook Evolution não configurado.");
    }
    await this.evolution.setWebhook({
      instanceName,
      webhookUrl: config.webhookPublicUrl,
      webhookSecret: config.webhookSecret,
    });
    this.logger.log({
      event: "evolution.webhook.ensure_configured",
      instanceName,
      webhookUrl: config.webhookPublicUrl,
      secretBackendConfigured: true,
      secretEvolutionConfigured: true,
      secretMatch: true,
      headerJwtKeyPresent: true,
    });
    return { configured: true };
  }

  async auditWebhookConfiguration(instanceName: string) {
    const config = evolutionConfigFromEnv();
    const instance = await this.evolution.findInstance(instanceName);
    const headers = instance?.Webhook?.headers ?? null;
    const evolutionSecret = normalizeSecret(headers?.jwt_key);
    const result = {
      instanceName,
      urlCorrect: instance?.Webhook?.url === config.webhookPublicUrl,
      messagesUpsertPresent: !!instance?.Webhook?.events?.includes("MESSAGES_UPSERT"),
      secretBackendConfigured: !!config.webhookSecret,
      secretEvolutionConfigured: !!evolutionSecret,
      secretMatch:
        !!config.webhookSecret && !!evolutionSecret && evolutionSecret === config.webhookSecret,
      headerJwtKeyPresent: !!evolutionSecret,
    };
    this.logger.log({
      event: "evolution.webhook.audit",
      ...result,
    });
    return result;
  }

  async updateConnectionStatus(
    id: string,
    status: MessagingConnectionStatus,
    owner?: { ownerExternalId?: string | null; ownerPhoneNormalized?: string | null },
  ) {
    const current = await this.prisma.messagingConnection.findUniqueOrThrow({ where: { id } });
    const ownerData = {
      ownerExternalId: owner?.ownerExternalId ?? undefined,
      ownerPhoneNormalized: owner?.ownerPhoneNormalized ?? undefined,
    };
    if (status === MessagingConnectionStatus.CONNECTED && current.externalReference) {
      await this.ensureWebhookConfiguredSafely(current.externalReference, current.id);
    }
    const profilePictureUrl =
      status === MessagingConnectionStatus.CONNECTED
        ? await this.fetchProfilePictureUrlSafely({
            instanceName: current.externalReference,
            ownerExternalId: owner?.ownerExternalId ?? current.ownerExternalId,
            ownerPhoneNormalized: owner?.ownerPhoneNormalized ?? current.ownerPhoneNormalized,
          })
        : undefined;
    if (status === MessagingConnectionStatus.CONNECTED && owner?.ownerPhoneNormalized) {
      const duplicateOwner = await this.prisma.messagingConnection.findFirst({
        where: {
          tenantId: current.tenantId,
          id: { not: current.id },
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          ownerPhoneNormalized: owner.ownerPhoneNormalized,
        },
      });
      if (duplicateOwner) {
        const updated = await this.prisma.messagingConnection.update({
          where: { id },
          data: {
            status: MessagingConnectionStatus.ERROR,
            ...ownerData,
          },
        });
        this.realtime?.publishConnectionStatusUpdated({
          tenantId: updated.tenantId,
          connectionId: updated.id,
          status: updated.status.toLowerCase(),
          updatedAt: updated.updatedAt,
        });
        return updated;
      }
    }
    const updated = await this.prisma.messagingConnection.update({
      where: { id },
      data: { status, ...ownerData, logoUrl: profilePictureUrl },
    });
    if (updated.status !== current.status) {
      this.realtime?.publishConnectionStatusUpdated({
        tenantId: updated.tenantId,
        connectionId: updated.id,
        status: updated.status.toLowerCase(),
        updatedAt: updated.updatedAt,
      });
    }
    this.enqueueGroupSyncForConnectedConnection(updated);
    return updated;
  }

  private enqueueGroupSyncForConnectedConnection(connection: {
    id: string;
    tenantId: string;
    status: MessagingConnectionStatus;
  }) {
    if (connection.status !== MessagingConnectionStatus.CONNECTED) return;
    this.groupsSync?.enqueue({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      includeParticipants: false,
      followUpFullSync: true,
      delayMs: CONNECTED_GROUP_LIGHT_SYNC_DELAY_MS,
    });
  }

  private async ensureWebhookConfiguredSafely(instanceName: string, connectionId: string) {
    try {
      await this.ensureWebhookConfigured(instanceName);
    } catch (error) {
      this.logger.warn({
        event: "evolution.webhook.ensure_failed",
        instanceName,
        connectionId,
        error: sanitizeEnsureError(error),
      });
    }
  }

  private profilePictureLookupTarget(connection: ConnectionWithArchive) {
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference ||
      connection.status !== MessagingConnectionStatus.CONNECTED
    ) {
      throw new BadRequestException(
        "Conecte a instância ao WhatsApp antes de gerenciar a foto de perfil.",
      );
    }
    if (!profilePictureLookupNumber(connection)) {
      throw new BadRequestException(
        "O número da instância ainda não está disponível. Atualize o status e tente novamente.",
      );
    }
    return { instanceName: connection.externalReference };
  }

  private async fetchProfilePictureUrlSafely(input: {
    instanceName: string | null;
    ownerExternalId: string | null | undefined;
    ownerPhoneNormalized: string | null | undefined;
  }) {
    if (!input.instanceName) return undefined;
    const number = input.ownerExternalId ?? input.ownerPhoneNormalized;
    if (!number) return undefined;
    try {
      return await this.evolution.fetchProfilePictureUrl({
        instanceName: input.instanceName,
        number,
      });
    } catch (error) {
      this.logger.debug({
        event: "messaging.connection.profile_picture_sync_failed",
        instanceName: sanitizeInstanceName(input.instanceName),
        error: sanitizeEnsureError(error),
      });
      return undefined;
    }
  }

  private async findTenantConnection(id: string, tenantId: string) {
    const connection = await this.prisma.messagingConnection.findFirst({
      where: { id, tenantId },
    });
    if (!connection) throw new NotFoundException("Connection não encontrada.");
    return connection;
  }

  private async markOrphan(id: string) {
    const updated = await this.prisma.messagingConnection.update({
      where: { id },
      data: { status: MessagingConnectionStatus.ERROR },
    });
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: updated.tenantId,
      connectionId: updated.id,
      status: updated.status.toLowerCase(),
      updatedAt: updated.updatedAt,
    });
    return this.serialize(updated, {
      existsInProvider: false,
      reason: "INSTANCE_NOT_FOUND",
    });
  }

  private async connectionReferenceCounts(tenantId: string, connectionId: string) {
    const [conversations, messages, campaigns, campaignRecipients, tickets] = await Promise.all([
      this.prisma.conversation.count({ where: { tenantId, connectionId } }),
      this.prisma.message.count({ where: { tenantId, connectionId } }),
      this.prisma.campaign.count({ where: { tenantId, connectionId } }),
      this.prisma.campaignRecipient.count({ where: { tenantId, campaign: { connectionId } } }),
      this.prisma.ticket.count({ where: { tenantId, conversation: { connectionId } } }),
    ]);
    return { conversations, messages, campaigns, campaignRecipients, tickets };
  }

  private async deleteEvolutionInstanceForRemoval(
    instanceName: string,
    baseLog: Record<string, unknown>,
  ) {
    const endpoint = `/instance/delete/${sanitizeInstanceName(instanceName)}`;
    try {
      await this.evolution.deleteInstance(instanceName);
      return {
        result: "deleted",
        endpoint,
        httpStatus: 204,
        instanceExisted: true,
        idempotent: false,
      };
    } catch (error) {
      if (isProviderNotFound(error)) {
        this.logger.log({
          ...baseLog,
          evolutionEndpoint: endpoint,
          evolutionHttpStatus: providerHttpStatus(error),
          providerResult: "not_found_idempotent",
        });
        return {
          result: "not_found_idempotent",
          endpoint,
          httpStatus: providerHttpStatus(error) ?? 404,
          instanceExisted: false,
          idempotent: true,
        };
      }
      this.logger.warn({
        ...baseLog,
        evolutionEndpoint: endpoint,
        evolutionHttpStatus: providerHttpStatus(error),
        providerResult: "provider_unavailable_cleanup_pending",
        providerError: sanitizeProviderError(error),
        httpResult: 200,
      });
      return {
        result: "provider_unavailable_cleanup_pending",
        endpoint,
        httpStatus: providerHttpStatus(error) ?? 503,
        instanceExisted: true,
        idempotent: false,
        cleanupPending: true,
      };
    }
  }

  private serialize(
    connection: ConnectionWithArchive,
    provider?: { existsInProvider?: boolean; webhookUrl?: string | null; reason?: string },
  ) {
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      name: connection.name,
      providerType: connection.providerType.toLowerCase(),
      status: connection.status.toLowerCase(),
      externalReference: connection.externalReference,
      color: connection.color,
      logoUrl: connection.logoUrl,
      welcomeEnabled: connection.welcomeEnabled,
      welcomeNewMessage: connection.welcomeNewMessage,
      welcomeExistingMessage: connection.welcomeExistingMessage,
      absenceEnabled: connection.absenceEnabled,
      absenceMessage: connection.absenceMessage,
      notes: connection.notes,
      importHistoryEnabled: connection.importHistoryEnabled,
      importHistoryStartDate: connection.importHistoryStartDate,
      importGroupsEnabled: connection.importGroupsEnabled,
      importGroupsStartDate: connection.importGroupsStartDate,
      ownerPhoneMasked: maskPhone(connection.ownerPhoneNormalized),
      ownerPhone: connection.ownerPhoneNormalized,
      archivedAt: connection.archivedAt,
      provider,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}

const INSTANCE_REMOVAL_CLOSE_MESSAGE = "Conversa encerrada via remoção da instância";
const CONNECTED_GROUP_LIGHT_SYNC_DELAY_MS = 10 * 1000;

type RemoveConnectionOptions = {
  removeConversationHistory?: boolean;
};

type ConnectionWithArchive = Prisma.MessagingConnectionGetPayload<object> & {
  archivedAt?: Date | null;
};

export function evolutionQrBase64(response: { base64?: string; qrcode?: { base64?: string } }) {
  return response.qrcode?.base64 ?? response.base64 ?? null;
}

export function translateEvolutionState(value: string | null | undefined) {
  const normalized = value?.toLowerCase();
  if (normalized === "open") return MessagingConnectionStatus.CONNECTED;
  if (normalized === "connecting") return MessagingConnectionStatus.CONNECTING;
  if (normalized === "close" || normalized === "closed")
    return MessagingConnectionStatus.DISCONNECTED;
  return MessagingConnectionStatus.ERROR;
}

function parseImportStartDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function translateInitialStatus(value: string | null | undefined) {
  return translateEvolutionState(value ?? "connecting");
}

export function cleanInstanceName(
  value: string,
  tenantId: string,
  options: { unique?: boolean } = {},
) {
  const base = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  if (!base) throw new BadRequestException("Nome da instance inválido.");
  if (options.unique) return `${tenantId.slice(0, 8)}-${base}-${randomUUID().slice(0, 8)}`;
  return `${tenantId.slice(0, 8)}-${base}`;
}

function maskPhone(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return `******${digits.slice(-4)}`;
}

function normalizeColor(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  if (!trimmed) return "#22c55e";
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : "#22c55e";
}

function cleanOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOwnerPhone(value: string | null) {
  const phone = phoneFromRemoteIdentity(value);
  return phone ? `+${phone}` : null;
}

function profilePictureLookupNumber(connection: {
  ownerExternalId?: string | null;
  ownerPhoneNormalized?: string | null;
}) {
  return connection.ownerExternalId ?? connection.ownerPhoneNormalized ?? null;
}

function decodeProfilePictureDataUrl(value: string | undefined) {
  const match = value?.match(/^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new BadRequestException("Selecione uma imagem válida.");
  const body = Buffer.from(match[2], "base64");
  if (!body.length || body.length > 2 * 1024 * 1024) {
    throw new BadRequestException("A imagem deve ter no máximo 2 MB.");
  }
  const subtype = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  return {
    body,
    mimeType: `image/${subtype}`,
    fileName: `foto-perfil.${subtype}`,
  };
}

function sanitizeEnsureError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 200);
  return "webhook ensure failed";
}

function sanitizeInstanceName(value: string | null | undefined) {
  if (!value) return null;
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${value.slice(0, 8)}...${value.slice(-4)}#${hash}`;
}

function isProviderNotFound(error: unknown) {
  if (error instanceof MessagingProviderError) {
    return (
      error.httpStatus === 404 ||
      (!error.retryable &&
        error.code === MessagingErrorCode.PROVIDER_UNAVAILABLE &&
        error.message.toLowerCase().includes("not found"))
    );
  }
  return false;
}

function providerHttpStatus(error: unknown) {
  return error instanceof MessagingProviderError ? error.httpStatus : undefined;
}

function sanitizeProviderError(error: unknown) {
  if (error instanceof MessagingProviderError) {
    return {
      code: error.code,
      retryable: error.retryable,
      message: error.message.slice(0, 200),
    };
  }
  if (error instanceof Error) return { message: error.message.slice(0, 200) };
  return { message: "provider error" };
}

function providerUnavailableForUi(error: unknown, fallbackMessage: string) {
  if (error instanceof MessagingProviderError) {
    return new ServiceUnavailableException({
      code: error.code,
      message: error.message || fallbackMessage,
      retryable: error.retryable,
      providerHttpStatus: error.httpStatus,
    });
  }
  if (error instanceof Error) {
    return new ServiceUnavailableException({
      code: MessagingErrorCode.PROVIDER_UNAVAILABLE,
      message: error.message || fallbackMessage,
      retryable: true,
    });
  }
  return new ServiceUnavailableException({
    code: MessagingErrorCode.PROVIDER_UNAVAILABLE,
    message: fallbackMessage,
    retryable: true,
  });
}
