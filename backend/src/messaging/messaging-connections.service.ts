import { validateServiceHours } from "./dto/service-hours.dto";
import { connectionReference } from "./connection-reference";
import { connectionIdAccess } from "../auth/connection-access";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  CampaignRecipientStatus,
  CampaignStatus,
  MessagingHistoryImportKind,
  MessagingHistoryImportStatus,
  MessagingConnection,
  MessagingConnectionStatus,
  MessagingProviderType,
  OutboxEventStatus,
  Prisma,
  ScheduleExecutionStatus,
} from "../generated/prisma";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { TransactionalEmailService } from "../email/transactional-email.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { normalizeRemotePhoneCandidates, phoneFromRemoteIdentity } from "./messaging-identity";
import { EvolutionClient } from "./evolution/evolution.client";
import { EvolutionQrCodeStore } from "./evolution/evolution-qr-code.store";
import {
  assertEvolutionConfigured,
  evolutionConfigFromEnv,
  normalizeSecret,
} from "./evolution/evolution.config";
import { CreateEvolutionConnectionDto } from "./dto/create-evolution-connection.dto";
import { UpdateMessagingConnectionDto } from "./dto/update-messaging-connection.dto";
import { MessagingErrorCode, MessagingProviderError } from "./messaging.contracts";
import { MessagingHistoryImportService } from "./messaging-history-import.service";
import {
  MessagingMediaStorageService,
  resolveMessageType,
  validatePolicy,
} from "./media/messaging-media-storage.service";

export const CONNECTION_OWNER_MISMATCH = "OWNER_PHONE_MISMATCH";
import type { QuickReplyAttachmentDto } from "../quick-replies/dto/quick-reply-message.dto";
import {
  MESSAGING_MEDIA_CLEANUP_REQUESTED,
  MessagingMediaCleanupService,
} from "./messaging-media-cleanup.service";

const IDEMPOTENT_EVOLUTION_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;
const QR_STATUS_RECONCILIATION_INTERVAL_MS = 10_000;

function qrReconnectWaitMs() {
  const configured = Number(process.env.TRIXUS_EVOLUTION_QR_RECONNECT_WAIT_MS);
  if (!Number.isFinite(configured)) return 30_000;
  return Math.min(60_000, Math.max(5_000, Math.trunc(configured)));
}

@Injectable()
export class MessagingConnectionsService {
  private readonly logger = new Logger(MessagingConnectionsService.name);
  private readonly qrGenerationRequests = new Map<string, Promise<QrCodeResult>>();
  private readonly localQrCodes = new Map<string, { value: string; expiresAt: number }>();
  private readonly qrStatusReconciledAt = new Map<string, number>();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EvolutionClient)
    private readonly evolution: EvolutionClient,
    @Optional()
    @Inject(PlanEntitlementService)
    private readonly entitlements?: PlanEntitlementService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
    @Optional()
    @Inject(MessagingHistoryImportService)
    private readonly historyImport?: MessagingHistoryImportService,
    @Optional()
    @Inject(EvolutionQrCodeStore)
    private readonly qrCodes?: EvolutionQrCodeStore,
    @Optional()
    @Inject(MessagingMediaStorageService)
    private readonly mediaStorage?: MessagingMediaStorageService,
    @Optional()
    @Inject(MessagingMediaCleanupService)
    private readonly mediaCleanup?: MessagingMediaCleanupService,
    @Optional()
    @Inject(TransactionalEmailService)
    private readonly email?: TransactionalEmailService,
  ) {}

  async list(current: AuthenticatedUser) {
    const connections = await this.prisma.messagingConnection.findMany({
      where: {
        tenantId: current.tenantId,
        providerType: MessagingProviderType.EVOLUTION,
        archivedAt: null,
      },
      orderBy: [{ providerType: "asc" }, { createdAt: "asc" }],
    });
    return connections.map((connection) => this.serialize(connection));
  }

  async listChatScope(current: AuthenticatedUser) {
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

  async importStatus(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    return this.prisma.messagingHistoryImport.findMany({
      where: { tenantId: connection.tenantId, connectionId: connection.id },
      orderBy: { kind: "asc" },
    });
  }

  async retryImport(id: string, current: AuthenticatedUser, kind?: MessagingHistoryImportKind) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    this.assertNotRemovalPending(connection);
    if (!this.historyImport) throw new ServiceUnavailableException("Importação indisponível.");
    await this.historyImport.retry(connection.id, kind);
    return this.importStatus(id, current);
  }

  async webhookStatus(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Esta instância não usa a integração Evolution.");
    }
    return this.auditWebhookConfiguration(connection.externalReference);
  }

  async ensureWebhookForConnection(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    this.assertNotRemovalPending(connection);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Esta instância não usa a integração Evolution.");
    }
    await this.ensureWebhookConfigured(connection.externalReference);
    return this.auditWebhookConfiguration(connection.externalReference);
  }

  async createEvolution(dto: CreateEvolutionConnectionDto, current: AuthenticatedUser) {
    const displayName = dto.name.trim();
    if (displayName.length < 2) {
      throw new BadRequestException("Informe um nome válido para a instância.");
    }
    if (!dto.idempotencyKey) await this.assertNameAvailable(current.tenantId, displayName);
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

    const existingIdempotentConnection = dto.idempotencyKey
      ? await this.prisma.messagingConnection.findFirst({
          where: {
            tenantId: current.tenantId,
            providerType: MessagingProviderType.EVOLUTION,
            externalReference: cleanInstanceName(displayName, current.tenantId, {
              idempotencyKey: dto.idempotencyKey,
            }),
            archivedAt: null,
          },
          select: { id: true },
        })
      : null;

    if (this.entitlements) {
      await this.entitlements.assertTenantOperational(current.tenantId);
      if (!existingIdempotentConnection) {
        const usage = await this.entitlements.getUsage(current.tenantId);
        await this.entitlements.assertWithinLimit(
          current.tenantId,
          "maxConnections",
          usage.connections,
        );
      }
    }
    const config = evolutionConfigFromEnv();
    if (!assertEvolutionConfigured(config)) {
      throw new BadRequestException("Evolution API não configurada.");
    }

    if (dto.idempotencyKey) {
      return this.createEvolutionIdempotent(
        dto,
        current,
        displayName,
        importHistoryEnabled,
        importHistoryStartDate,
        importGroupsEnabled,
        importGroupsStartDate,
      );
    }

    const instanceName = cleanInstanceName(displayName, current.tenantId, { unique: true });
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
      connection = await this.prisma.$transaction(async (tx) => {
        const created = await tx.messagingConnection.create({
          data: {
            tenantId: current.tenantId,
            name: displayName,
            color: normalizeColor(dto.color),
            providerType: MessagingProviderType.EVOLUTION,
            status: translateInitialStatus(
              response.instance?.status ?? response.instance?.connectionStatus,
            ),
            externalReference: instanceName,
            serviceEnabled: dto.serviceEnabled ?? true,
            importHistoryEnabled,
            importHistoryStartDate: importHistoryEnabled ? importHistoryStartDate : null,
            importGroupsEnabled,
            importGroupsStartDate: importGroupsEnabled ? importGroupsStartDate : null,
          },
        });

        return created;
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
      if (isUniqueConstraintError(error)) throw duplicateConnectionNameError();
      throw error;
    }
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      status: connection.status.toLowerCase(),
      updatedAt: connection.updatedAt,
    });
    void this.historyImport?.enqueueForConnection(connection);
    return {
      ...this.serialize(connection),
      qrCodeBase64: evolutionQrBase64(response),
    };
  }

  private async createEvolutionIdempotent(
    dto: CreateEvolutionConnectionDto,
    current: AuthenticatedUser,
    displayName: string,
    importHistoryEnabled: boolean,
    importHistoryStartDate: Date | null,
    importGroupsEnabled: boolean,
    importGroupsStartDate: Date | null,
  ) {
    const instanceName = cleanInstanceName(displayName, current.tenantId, {
      idempotencyKey: dto.idempotencyKey,
    });
    let result: {
      connection: MessagingConnection;
      response: Awaited<ReturnType<EvolutionClient["createInstance"]>>;
    };
    const existing = await this.prisma.messagingConnection.findFirst({
      where: {
        tenantId: current.tenantId,
        providerType: MessagingProviderType.EVOLUTION,
        externalReference: instanceName,
        archivedAt: null,
      },
    });
    if (existing) {
      this.assertIdempotentPayload(existing.name, displayName);
      const recovered = await this.ensureIdempotentProvider(instanceName, existing.status);
      const providerStatus = translateInitialStatus(
        recovered.response.instance?.status ?? recovered.response.instance?.connectionStatus,
      );
      const connection =
        providerStatus === existing.status
          ? existing
          : await this.prisma.messagingConnection.update({
              where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
              data: { status: providerStatus },
            });
      result = { connection, response: recovered.response };
      return this.completeIdempotentEvolutionCreation(instanceName, result);
    }

    const recovered = await this.ensureIdempotentProvider(instanceName);
    const providerCreatedByThisRequest = recovered.createdByThisRequest;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`
          SELECT "tenantId"
          FROM "tenant_onboarding_states"
          WHERE "tenantId" = ${current.tenantId}
          FOR UPDATE
        `,
        );
        const existing = await tx.messagingConnection.findFirst({
          where: {
            tenantId: current.tenantId,
            providerType: MessagingProviderType.EVOLUTION,
            externalReference: instanceName,
            archivedAt: null,
          },
        });
        if (existing) {
          this.assertIdempotentPayload(existing.name, displayName);
          return { connection: existing, response: recovered.response };
        }
        const data = {
          tenantId: current.tenantId,
          name: displayName,
          color: normalizeColor(dto.color),
          providerType: MessagingProviderType.EVOLUTION,
          status: translateInitialStatus(
            recovered.response.instance?.status ?? recovered.response.instance?.connectionStatus,
          ),
          externalReference: instanceName,
          serviceEnabled: dto.serviceEnabled ?? true,
          importHistoryEnabled,
          importHistoryStartDate: importHistoryEnabled ? importHistoryStartDate : null,
          importGroupsEnabled,
          importGroupsStartDate: importGroupsEnabled ? importGroupsStartDate : null,
        };
        const connection = await tx.messagingConnection.create({ data });
        return { connection, response: recovered.response };
      }, IDEMPOTENT_EVOLUTION_TRANSACTION_OPTIONS);
    } catch (error) {
      let raced: MessagingConnection | null;
      try {
        raced = await this.prisma.messagingConnection.findFirst({
          where: {
            tenantId: current.tenantId,
            providerType: MessagingProviderType.EVOLUTION,
            externalReference: instanceName,
            archivedAt: null,
          },
        });
      } catch {
        if (providerCreatedByThisRequest) {
          await this.deleteCompensatedInstance(instanceName, current.tenantId);
        }
        throw error;
      }
      if (!raced) {
        if (providerCreatedByThisRequest) {
          await this.deleteCompensatedInstance(instanceName, current.tenantId);
        }
        throw error;
      }
      this.assertIdempotentPayload(raced.name, displayName);
      result = { connection: raced, response: recovered.response };
    }

    return this.completeIdempotentEvolutionCreation(instanceName, result);
  }

  private completeIdempotentEvolutionCreation(
    instanceName: string,
    result: {
      connection: MessagingConnection;
      response: Awaited<ReturnType<EvolutionClient["createInstance"]>>;
    },
  ) {
    void this.ensureWebhookConfiguredSafely(instanceName, result.connection.id);
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: result.connection.tenantId,
      connectionId: result.connection.id,
      status: result.connection.status.toLowerCase(),
      updatedAt: result.connection.updatedAt,
    });
    void this.historyImport?.enqueueForConnection(result.connection);
    return {
      ...this.serialize(result.connection),
      qrCodeBase64: evolutionQrBase64(result.response),
    };
  }

  private async deleteCompensatedInstance(instanceName: string, tenantId: string) {
    try {
      await this.evolution.deleteInstance(instanceName);
    } catch (cleanupError) {
      this.logger.warn({
        event: "messaging.connection.create_cleanup_failed",
        tenantId,
        instanceName: sanitizeInstanceName(instanceName),
        providerError: sanitizeProviderError(cleanupError),
      });
    }
  }

  private assertIdempotentPayload(existingName: string, requestedName: string) {
    if (
      existingName.trim().toLocaleLowerCase("pt-BR") !== requestedName.toLocaleLowerCase("pt-BR")
    ) {
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
        message: "Esta chave de idempotência já foi utilizada com outro nome de instância.",
      });
    }
  }

  private async ensureIdempotentProvider(
    instanceName: string,
    localStatus?: MessagingConnectionStatus,
  ): Promise<{
    response: Awaited<ReturnType<EvolutionClient["createInstance"]>>;
    createdByThisRequest: boolean;
  }> {
    const provider = await this.evolution.findInstance(instanceName);
    if (provider) {
      if (localStatus === MessagingConnectionStatus.CONNECTED) {
        return {
          response: { instance: provider },
          createdByThisRequest: false,
        } as never;
      }
      return {
        response: await this.evolution.connect(instanceName),
        createdByThisRequest: false,
      };
    }
    try {
      return {
        response: await this.evolution.createInstance({ instanceName }),
        createdByThisRequest: true,
      };
    } catch (error) {
      const reconciled = await this.evolution.findInstance(instanceName).catch(() => null);
      if (!reconciled) {
        throw providerUnavailableForUi(error, "Não foi possível criar a instância na Evolution.");
      }
      return {
        response: await this.evolution.connect(instanceName),
        createdByThisRequest: false,
      };
    }
  }

  async status(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    this.assertNotRemovalPending(connection);
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
    const ownerExternalId = instance.ownerJid ?? null;
    const ownerPhoneNormalized = normalizeOwnerPhone(ownerExternalId);
    const updated = await this.updateConnectionStatus(
      connection.id,
      translatedStatus,
      translatedStatus === MessagingConnectionStatus.CONNECTED
        ? { ownerExternalId, ownerPhoneNormalized }
        : undefined,
    );
    return this.serialize(updated, { existsInProvider: true, webhookUrl: instance.Webhook?.url });
  }

  async qrCode(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    this.assertNotRemovalPending(connection);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection não é Evolution.");
    }
    const currentRequest = this.qrGenerationRequests.get(connection.id);
    if (currentRequest) return currentRequest;
    const request = this.generateQrCode(connection).finally(() => {
      this.qrGenerationRequests.delete(connection.id);
    });
    this.qrGenerationRequests.set(connection.id, request);
    return request;
  }

  async qrCodeStatus(id: string, current: AuthenticatedUser) {
    let connection = await this.findTenantConnection(id, current.tenantId);
    this.assertNotRemovalPending(connection);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection não é Evolution.");
    }
    const instanceName = connection.externalReference;
    const lastReconciledAt = this.qrStatusReconciledAt.get(connection.id) ?? 0;
    if (
      connection.status !== MessagingConnectionStatus.CONNECTED &&
      Date.now() - lastReconciledAt >= QR_STATUS_RECONCILIATION_INTERVAL_MS &&
      typeof this.evolution.connectionState === "function"
    ) {
      this.qrStatusReconciledAt.set(connection.id, Date.now());
      try {
        const state = await this.evolution.connectionState(instanceName);
        const providerStatus = translateEvolutionState(
          state.instance?.state ?? state.instance?.status,
        );
        if (providerStatus === MessagingConnectionStatus.CONNECTED) {
          const instance = await this.evolution.findInstance(instanceName);
          const ownerExternalId = instance?.ownerJid ?? null;
          connection = await this.updateConnectionStatus(
            connection.id,
            MessagingConnectionStatus.CONNECTED,
            {
              ownerExternalId,
              ownerPhoneNormalized: normalizeOwnerPhone(ownerExternalId),
            },
          );
        }
      } catch (error) {
        this.logger.debug({
          event: "evolution.qr.status_reconciliation_failed",
          connectionId: connection.id,
          instanceName: sanitizeInstanceName(instanceName),
          error: error instanceof Error ? error.message.slice(0, 200) : "Provider unavailable",
        });
      }
    }
    return this.qrCodeResult(connection, await this.readQrCode(instanceName));
  }

  async captureEvolutionQrCode(connectionId: string, instanceName: string, value: string | null) {
    const qrCodeBase64 = normalizeQrCode(value);
    if (!qrCodeBase64) return false;
    await this.writeQrCode(instanceName, qrCodeBase64);
    this.logger.log({
      event: "evolution.qr.captured",
      connectionId,
      instanceName: sanitizeInstanceName(instanceName),
    });
    return true;
  }

  private async generateQrCode(connection: ConnectionWithArchive): Promise<QrCodeResult> {
    const instanceName = connection.externalReference!;
    const cached = await this.readQrCode(instanceName);
    if (cached) return this.qrCodeResult(connection, cached);

    const lockToken = await this.qrCodes?.acquireGenerationLock(instanceName);
    if (this.qrCodes && !lockToken) {
      return this.qrCodeResult(connection, await this.readQrCode(instanceName));
    }
    const stopLockRenewal = this.startQrLockRenewal(instanceName, lockToken);
    try {
      const instance = await this.evolution.findInstance(instanceName);
      if (!instance) {
        await this.assertQrLockOwner(instanceName, lockToken);
        const response = await this.recreateExternalSession(connection, false);
        return this.completeQrGeneration(connection, response);
      }

      const state = await this.evolution.connectionState(instanceName);
      const providerStatus = translateEvolutionState(
        state.instance?.state ?? state.instance?.status ?? instance.connectionStatus,
      );
      if (providerStatus === MessagingConnectionStatus.CONNECTED) {
        const updated = await this.updateConnectionStatus(
          connection.id,
          MessagingConnectionStatus.CONNECTED,
          {
            ownerExternalId: instance.ownerJid ?? null,
            ownerPhoneNormalized: normalizeOwnerPhone(instance.ownerJid ?? null),
          },
        );
        return this.qrCodeResult(updated, null);
      }

      await this.ensureWebhookConfigured(instanceName);
      await this.clearQrCode(instanceName);
      const response = await this.evolution.connect(instanceName);
      const immediateQr = normalizeQrCode(evolutionQrBase64(response));
      if (immediateQr) {
        await this.writeQrCode(instanceName, immediateQr);
        return this.completeQrGeneration(connection, response);
      }

      if (providerStatus === MessagingConnectionStatus.DISCONNECTED) {
        const delayedQr = await this.waitForQrCode(instanceName, qrReconnectWaitMs());
        if (delayedQr) return this.markQrConnecting(connection, delayedQr);
        const confirmed = await this.evolution.connectionState(instanceName);
        const confirmedStatus = translateEvolutionState(
          confirmed.instance?.state ?? confirmed.instance?.status,
        );
        if (confirmedStatus === MessagingConnectionStatus.DISCONNECTED) {
          await this.assertQrLockOwner(instanceName, lockToken);
          const recreated = await this.recreateExternalSession(connection, true);
          return this.completeQrGeneration(connection, recreated);
        }
      }

      return this.markQrConnecting(connection, await this.readQrCode(instanceName));
    } finally {
      stopLockRenewal();
      if (lockToken) await this.qrCodes?.releaseGenerationLock(instanceName, lockToken);
    }
  }

  private startQrLockRenewal(instanceName: string, lockToken: string | null | undefined) {
    if (!lockToken || !this.qrCodes) return () => undefined;
    const interval = setInterval(() => {
      void this.qrCodes?.renewGenerationLock(instanceName, lockToken);
    }, 20_000);
    interval.unref?.();
    return () => clearInterval(interval);
  }

  private async assertQrLockOwner(instanceName: string, lockToken: string | null | undefined) {
    if (!lockToken || !this.qrCodes) return;
    if (await this.qrCodes.renewGenerationLock(instanceName, lockToken)) return;
    throw new ServiceUnavailableException(
      "Outra tentativa de reconexão assumiu esta instância. Aguarde alguns segundos e tente novamente.",
    );
  }

  private async recreateExternalSession(
    connection: ConnectionWithArchive,
    deleteExisting: boolean,
  ) {
    const instanceName = connection.externalReference!;
    if (deleteExisting) {
      try {
        await this.evolution.deleteInstance(instanceName);
      } catch (error) {
        if (!isProviderNotFound(error)) throw error;
      }
    }

    let response: Awaited<ReturnType<EvolutionClient["createInstance"]>>;
    try {
      response = await this.evolution.createInstance({ instanceName });
    } catch (error) {
      const reconciled = await this.evolution.findInstance(instanceName).catch(() => null);
      if (!reconciled) throw error;
      response = { instance: reconciled };
    }
    await this.ensureWebhookConfigured(instanceName);
    const immediateQr = normalizeQrCode(evolutionQrBase64(response));
    if (immediateQr) {
      await this.writeQrCode(instanceName, immediateQr);
      return response;
    }
    return this.evolution.connect(instanceName);
  }

  private async completeQrGeneration(
    connection: ConnectionWithArchive,
    response: Awaited<ReturnType<EvolutionClient["createInstance"]>>,
  ) {
    const qrCodeBase64 = normalizeQrCode(evolutionQrBase64(response));
    if (qrCodeBase64) await this.writeQrCode(connection.externalReference!, qrCodeBase64);
    return this.markQrConnecting(
      connection,
      qrCodeBase64 ?? (await this.readQrCode(connection.externalReference!)),
    );
  }

  private async markQrConnecting(connection: ConnectionWithArchive, qrCodeBase64: string | null) {
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { status: MessagingConnectionStatus.CONNECTING, connectionErrorCode: null },
    });
    if (updated.status !== connection.status) {
      this.realtime?.publishConnectionStatusUpdated({
        tenantId: updated.tenantId,
        connectionId: updated.id,
        status: updated.status.toLowerCase(),
        updatedAt: updated.updatedAt,
      });
    }
    return this.qrCodeResult(updated, qrCodeBase64);
  }

  private qrCodeResult(connection: ConnectionWithArchive, qrCodeBase64: string | null) {
    return {
      connectionId: connection.id,
      qrCodeBase64,
      status: connection.status.toLowerCase(),
      ...(connection.connectionErrorCode
        ? { errorCode: connection.connectionErrorCode }
        : {}),
      ...(connection.ownerPhoneNormalized
        ? { expectedOwnerPhone: maskPhone(connection.ownerPhoneNormalized) }
        : {}),
    };
  }

  private async writeQrCode(instanceName: string, value: string) {
    this.localQrCodes.set(instanceName, { value, expiresAt: Date.now() + 90_000 });
    await this.qrCodes?.put(instanceName, value);
  }

  private async readQrCode(instanceName: string) {
    const shared = await this.qrCodes?.get(instanceName);
    if (shared) return shared;
    const local = this.localQrCodes.get(instanceName);
    if (!local) return null;
    if (local.expiresAt <= Date.now()) {
      this.localQrCodes.delete(instanceName);
      return null;
    }
    return local.value;
  }

  private async clearQrCode(instanceName: string) {
    this.localQrCodes.delete(instanceName);
    await this.qrCodes?.clear(instanceName);
  }

  private async waitForQrCode(instanceName: string, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await this.readQrCode(instanceName);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  }

  async update(id: string, dto: UpdateMessagingConnectionDto, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    this.assertNotRemovalPending(connection);
    if (connection.archivedAt || connection.status === MessagingConnectionStatus.REMOVED) {
      throw new BadRequestException("Connection removida não pode ser editada.");
    }
    const hasWhatsAppNumber = Boolean(connection.ownerPhoneNormalized);
    const canEdit =
      hasWhatsAppNumber &&
      (connection.status === MessagingConnectionStatus.CONNECTED ||
        connection.status === MessagingConnectionStatus.DISCONNECTED);
    if (!canEdit) {
      throw new BadRequestException(
        hasWhatsAppNumber
          ? "Esta instância não está disponível para edição."
          : "Conecte a instância ao WhatsApp para cadastrar o número antes de editá-la.",
      );
    }
    const displayName = dto.name?.trim();
    if (dto.name !== undefined) {
      if (!displayName || displayName.length < 2) {
        throw new BadRequestException("Informe um nome válido para a instância.");
      }
      await this.assertNameAvailable(current.tenantId, displayName, connection.id);
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
    const welcomeNewAttachment = normalizeAutomaticAttachment(
      dto.welcomeNewAttachment,
      connection.welcomeNewAttachment,
    );
    const welcomeExistingAttachment = normalizeAutomaticAttachment(
      dto.welcomeExistingAttachment,
      connection.welcomeExistingAttachment,
    );
    if (welcomeEnabled && (!welcomeNewMessage || !welcomeExistingMessage)) {
      throw new BadRequestException(
        "Preencha as mensagens para novo contato e contato existente antes de ativar a saudação.",
      );
    }
    const serviceHours =
      dto.serviceHours === undefined ? undefined : validateServiceHours(dto.serviceHours);
    if (dto.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: dto.timezone }).format();
      } catch {
        throw new BadRequestException("Fuso horário inválido.");
      }
    }
    const absenceEnabled = dto.absenceEnabled ?? connection.absenceEnabled;
    const absenceMessage =
      dto.absenceMessage === undefined
        ? connection.absenceMessage
        : cleanOptionalText(dto.absenceMessage);
    const absenceAttachment = normalizeAutomaticAttachment(
      dto.absenceAttachment,
      connection.absenceAttachment,
    );
    if (absenceEnabled && !absenceMessage) {
      throw new BadRequestException("Preencha a mensagem de ausência antes de ativá-la.");
    }
    let updated: Awaited<ReturnType<PrismaService["messagingConnection"]["update"]>>;
    try {
      updated = await this.prisma.messagingConnection.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: connection.id } },
        data: {
          name: displayName,
          color: normalizeColor(dto.color),
          welcomeEnabled,
          welcomeNewMessage,
          welcomeExistingMessage,
          welcomeNewAttachment,
          welcomeExistingAttachment,
          absenceEnabled,
          absenceMessage,
          absenceAttachment,
          serviceHours,
          timezone: dto.timezone,
          serviceEnabled: dto.serviceEnabled,
          notes: cleanOptionalText(dto.notes),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw duplicateConnectionNameError();
      throw error;
    }
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: updated.tenantId,
      connectionId: updated.id,
      status: updated.status.toLowerCase(),
      updatedAt: updated.updatedAt,
    });
    return this.serialize(updated);
  }

  private async assertNameAvailable(tenantId: string, name: string, excludeId?: string) {
    const duplicate = await this.prisma.messagingConnection.findFirst({
      where: {
        tenantId,
        archivedAt: null,
        id: excludeId ? { not: excludeId } : undefined,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) throw duplicateConnectionNameError();
  }

  async refreshProfilePicture(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    this.assertNotRemovalPending(connection);
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
    this.assertNotRemovalPending(connection);
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
    this.assertNotRemovalPending(connection);
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
    this.assertNotRemovalPending(connection);
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
      data: { status: MessagingConnectionStatus.DISCONNECTED, connectionErrorCode: null },
    });
    this.realtime?.publishConnectionStatusUpdated({
      tenantId: updated.tenantId,
      connectionId: updated.id,
      status: updated.status.toLowerCase(),
      updatedAt: updated.updatedAt,
    });
    await this.notifyDisconnectedAdministrator(updated);
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

  async remove(id: string, current: AuthenticatedUser) {
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
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      (!connection.externalReference && connection.status !== MessagingConnectionStatus.REMOVED)
    ) {
      throw new BadRequestException("Connection não é Evolution.");
    }

    await this.assertConnectionPurgeAvailable(this.prisma, connection.tenantId, connection.id);

    const removalAlreadyPending =
      connection.status === MessagingConnectionStatus.ERROR && connection.serviceEnabled === false;
    const previousStatus = connection.status;
    const previousServiceEnabled = connection.serviceEnabled !== false;
    const legacyRemoved =
      connection.status === MessagingConnectionStatus.REMOVED || !!connection.archivedAt;
    if (!legacyRemoved) {
      const claimed = await this.prisma.messagingConnection.updateMany({
        where: {
          id: connection.id,
          tenantId: current.tenantId,
          archivedAt: null,
          status: connection.status,
          updatedAt: connection.updatedAt,
        },
        data: {
          status: MessagingConnectionStatus.ERROR,
          serviceEnabled: false,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "A conexão foi alterada durante a remoção. Atualize a tela e tente novamente.",
        );
      }
    }

    let providerDelete = {
      result: "skipped_already_removed",
      endpoint: null as string | null,
      httpStatus: 200,
      instanceExisted: false,
      idempotent: true,
    };
    try {
      if (!legacyRemoved && connection.externalReference) {
        providerDelete = await this.deleteEvolutionInstanceForRemoval(
          connection.externalReference,
          baseLog,
        );
      }
    } catch (error) {
      if (!removalAlreadyPending) {
        await this.prisma.messagingConnection
          .updateMany({
            where: {
              id: connection.id,
              tenantId: current.tenantId,
              archivedAt: null,
              status: MessagingConnectionStatus.ERROR,
              serviceEnabled: false,
              externalReference: connection.externalReference,
            },
            data: {
              status: previousStatus,
              serviceEnabled: previousServiceEnabled,
            },
          })
          .catch((restoreError) => {
            this.logger.error({
              ...baseLog,
              event: "messaging.connection.remove_restore_failed",
              error: sanitizeEnsureError(restoreError),
            });
          });
      }
      throw error;
    }

    const finalized = await this.prisma.$transaction(async (tx) =>
      this.purgeConnectionData(
        tx,
        connection.tenantId,
        connection.id,
        connection.externalReference,
        legacyRemoved,
      ),
    );
    const mediaCleanup = await this.cleanupConnectionMedia(
      finalized.mediaCleanupEventId,
      finalized.mediaStorageKeys,
    );
    if (connection.externalReference) {
      this.localQrCodes.delete(connection.externalReference);
      await this.qrCodes?.clear(connection.externalReference).catch((error) => {
        this.logger.warn({
          ...baseLog,
          event: "messaging.connection.remove_qr_cleanup_failed",
          error: sanitizeEnsureError(error),
        });
      });
    }
    this.qrGenerationRequests.delete(connection.id);
    this.qrStatusReconciledAt.delete(connection.id);

    this.realtime?.publishConnectionStatusUpdated({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      status: "deleted",
      updatedAt: new Date(),
    });
    this.logger.log({
      ...baseLog,
      providerResult: providerDelete.result,
      evolutionHttpStatus: providerDelete.httpStatus,
      httpResult: 200,
      deleted: true,
      mediaCleanup,
      counts: finalized.counts,
    });
    return {
      id: connection.id,
      deleted: true,
      providerInstanceExisted: providerDelete.instanceExisted,
      idempotent: providerDelete.idempotent,
      mediaCleanup,
      ...finalized.counts,
    };
  }

  private async assertConnectionPurgeAvailable(
    db: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
  ) {
    const state = await this.loadConnectionPurgeState(db, tenantId, connectionId);
    if (
      state.activeCampaignCount > 0 ||
      state.activeRecipientCount > 0 ||
      state.processingOutboxCount > 0 ||
      state.runningImportCount > 0
    ) {
      throw new ConflictException(
        "Existem mensagens ou campanhas em processamento. Aguarde a conclusão antes de excluir a instância.",
      );
    }
    if (state.blockingScheduleCount > 0) {
      throw new ConflictException(
        "Existem mensagens agendadas em processamento. Aguarde a conclusão antes de excluir a instância.",
      );
    }
    return state;
  }

  private async loadConnectionPurgeState(
    db: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
  ) {
    const [
      conversations,
      directMessages,
      campaigns,
      schedules,
      notificationCount,
      runningImportCount,
    ] = await Promise.all([
      db.conversation.findMany({
        where: { tenantId, connectionId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          messages: {
            orderBy: { id: "asc" },
            select: { id: true, mediaStorageKey: true },
          },
        },
      }),
      db.message.findMany({
        where: { tenantId, connectionId },
        orderBy: { id: "asc" },
        select: { id: true, mediaStorageKey: true },
      }),
      db.campaign.findMany({
        where: { tenantId, connectionId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          recipients: { orderBy: { id: "asc" }, select: { id: true, status: true } },
        },
      }),
      db.schedule.findMany({
        where: { tenantId, connectionId },
        orderBy: { id: "asc" },
        select: { id: true, executionStatus: true },
      }),
      db.notification.count({ where: { tenantId, connectionId } }),
      db.messagingHistoryImport.count({
        where: { tenantId, connectionId, status: MessagingHistoryImportStatus.RUNNING },
      }),
    ]);
    const conversationMessages = conversations.flatMap((item) => item.messages);
    const messages = [
      ...new Map(
        [...conversationMessages, ...directMessages].map((message) => [message.id, message]),
      ).values(),
    ];
    const recipientIds = campaigns.flatMap((campaign) =>
      campaign.recipients.map((recipient) => recipient.id),
    );
    const aggregateIds = [
      ...conversations.map((item) => item.id),
      ...messages.map((item) => item.id),
      ...campaigns.map((item) => item.id),
      ...recipientIds,
      ...schedules.map((item) => item.id),
    ];
    const processingOutboxCount = aggregateIds.length
      ? await db.outboxEvent.count({
          where: {
            tenantId,
            aggregateId: { in: aggregateIds },
            status: OutboxEventStatus.PROCESSING,
          },
        })
      : 0;
    return {
      conversationIds: conversations.map((item) => item.id),
      messageIds: messages.map((item) => item.id),
      campaignIds: campaigns.map((item) => item.id),
      recipientIds,
      scheduleIds: schedules.map((item) => item.id),
      aggregateIds,
      notificationCount,
      runningImportCount,
      processingOutboxCount,
      activeCampaignCount: campaigns.filter(
        (item) =>
          ![
            CampaignStatus.DRAFT,
            CampaignStatus.CANCELLED,
            CampaignStatus.COMPLETED,
            CampaignStatus.FAILED,
          ].includes(item.status as never),
      ).length,
      activeRecipientCount: campaigns.reduce(
        (total, campaign) =>
          total +
          campaign.recipients.filter((item) =>
            [
              CampaignRecipientStatus.PENDING,
              CampaignRecipientStatus.QUEUED,
              CampaignRecipientStatus.PROCESSING,
            ].includes(item.status as never),
          ).length,
        0,
      ),
      blockingScheduleCount: schedules.filter(
        (item) =>
          item.executionStatus === ScheduleExecutionStatus.CLAIMED ||
          item.executionStatus === ScheduleExecutionStatus.QUEUED,
      ).length,
      mediaStorageKeys: [
        ...new Set(
          messages.flatMap((item) => (item.mediaStorageKey ? [item.mediaStorageKey] : [])),
        ),
      ],
    };
  }

  private async purgeConnectionData(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
    externalReference: string | null,
    legacyRemoved: boolean,
  ) {
    const state = await this.assertConnectionPurgeAvailable(tx, tenantId, connectionId);
    if (state.messageIds.length) {
      await tx.campaignRecipient.updateMany({
        where: { tenantId, messageId: { in: state.messageIds } },
        data: { messageId: null },
      });
    }
    if (state.conversationIds.length) {
      await tx.ticket.updateMany({
        where: { tenantId, conversationId: { in: state.conversationIds } },
        data: { conversationId: null },
      });
    }
    if (state.aggregateIds.length) {
      await tx.outboxEvent.deleteMany({
        where: {
          tenantId,
          aggregateId: { in: state.aggregateIds },
          status: { not: OutboxEventStatus.PROCESSING },
        },
      });
    }
    const mediaCleanupEvent = state.mediaStorageKeys.length
      ? await tx.outboxEvent.create({
          data: {
            tenantId,
            type: MESSAGING_MEDIA_CLEANUP_REQUESTED,
            aggregateId: connectionId,
            payload: { connectionId, objectKeys: state.mediaStorageKeys },
          },
          select: { id: true },
        })
      : null;
    const deletedConversations = await tx.conversation.deleteMany({
      where: { tenantId, connectionId },
    });
    const deletedMessages = await tx.message.deleteMany({ where: { tenantId, connectionId } });
    const deletedRecipients = state.campaignIds.length
      ? await tx.campaignRecipient.deleteMany({
          where: { tenantId, campaignId: { in: state.campaignIds } },
        })
      : { count: 0 };
    const deletedCampaigns = await tx.campaign.deleteMany({ where: { tenantId, connectionId } });
    const deletedNotifications = await tx.notification.deleteMany({
      where: { tenantId, connectionId },
    });
    const deletedSchedules = await tx.schedule.deleteMany({ where: { tenantId, connectionId } });
    const unlinkedContacts = await this.removeConnectionFromContacts(
      tx,
      tenantId,
      connectionId,
      externalReference,
    );
    await this.removeConnectionFromRoleMetadata(tx, tenantId, connectionId);
    const deletedConnection = await tx.messagingConnection.deleteMany({
      where: {
        tenantId,
        id: connectionId,
        ...(legacyRemoved
          ? {}
          : { status: MessagingConnectionStatus.ERROR, serviceEnabled: false }),
      },
    });
    if (deletedConnection.count !== 1) {
      throw new ConflictException(
        "A conexão foi alterada durante a exclusão. Atualize a tela e tente novamente.",
      );
    }
    return {
      mediaCleanupEventId: mediaCleanupEvent?.id ?? null,
      mediaStorageKeys: state.mediaStorageKeys,
      counts: {
        deletedConversationCount: deletedConversations.count,
        deletedMessageCount: state.messageIds.length + deletedMessages.count,
        deletedCampaignCount: deletedCampaigns.count,
        deletedCampaignRecipientCount: deletedRecipients.count,
        deletedNotificationCount: deletedNotifications.count,
        deletedScheduleCount: deletedSchedules.count,
        unlinkedContactCount: unlinkedContacts,
      },
    };
  }

  private async removeConnectionFromContacts(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
    externalReference: string | null,
  ) {
    const references = [...new Set([connectionId, externalReference].filter(Boolean))] as string[];
    const contacts = await tx.contact.findMany({
      where: {
        tenantId,
        OR: [{ instanceIds: { hasSome: references } }, { instance: { in: references } }],
      },
      select: { id: true, instance: true, instanceIds: true },
    });
    for (const contact of contacts) {
      const instanceIds = contact.instanceIds.filter((item) => !references.includes(item));
      const instance =
        contact.instance && references.includes(contact.instance)
          ? (instanceIds[0] ?? null)
          : contact.instance;
      await tx.contact.update({
        where: { id: contact.id },
        data: { instance, instanceIds },
      });
    }
    return contacts.length;
  }

  private async removeConnectionFromRoleMetadata(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
  ) {
    const roles = await tx.role.findMany({
      where: { tenantId },
      select: { id: true, metadata: true },
    });
    for (const role of roles) {
      if (!role.metadata || typeof role.metadata !== "object" || Array.isArray(role.metadata))
        continue;
      const metadata = { ...(role.metadata as Prisma.JsonObject) };
      let changed = false;
      if (Array.isArray(metadata.connectionIds)) {
        const connectionIds = metadata.connectionIds.filter((item) => item !== connectionId);
        changed ||= connectionIds.length !== metadata.connectionIds.length;
        metadata.connectionIds = connectionIds;
      }
      if (Array.isArray(metadata.chatScopes)) {
        const chatScopes = metadata.chatScopes.filter(
          (item) =>
            !item ||
            typeof item !== "object" ||
            Array.isArray(item) ||
            (item as Prisma.JsonObject).connectionId !== connectionId,
        );
        changed ||= chatScopes.length !== metadata.chatScopes.length;
        metadata.chatScopes = chatScopes;
      }
      if (changed) {
        await tx.role.update({ where: { id: role.id }, data: { metadata } });
      }
    }
  }

  private async cleanupConnectionMedia(eventId: string | null, keys: string[]) {
    if (!eventId || !keys.length) return "completed" as const;
    if (this.mediaCleanup) {
      return (await this.mediaCleanup.process(eventId))
        ? ("completed" as const)
        : ("pending" as const);
    }
    if (!this.mediaStorage) return "pending" as const;
    const results = await Promise.allSettled(
      keys.map((key) => this.mediaStorage?.deleteObject(key)),
    );
    const failed = results.find((result) => result.status === "rejected");
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: failed
        ? {
            status: OutboxEventStatus.FAILED,
            lastError: sanitizeEnsureError(failed.reason),
          }
        : {
            status: OutboxEventStatus.PROCESSED,
            processedAt: new Date(),
            lastError: null,
          },
    });
    return failed ? ("pending" as const) : ("completed" as const);
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

  async reconcileConnectedWebhooks() {
    const config = evolutionConfigFromEnv();
    if (!assertEvolutionConfigured(config) || !config.webhookPublicUrl || !config.webhookSecret) {
      return { scanned: 0, healthy: 0, repaired: 0, failed: 0, skipped: true };
    }
    const connections = await this.prisma.messagingConnection.findMany({
      where: {
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: { not: null },
        archivedAt: null,
      },
      select: { id: true, tenantId: true, externalReference: true },
    });
    let healthy = 0;
    let repaired = 0;
    let failed = 0;
    for (const connection of connections) {
      const instanceName = connection.externalReference;
      if (!instanceName) continue;
      try {
        const audit = await this.auditWebhookConfiguration(instanceName);
        if (
          audit.urlCorrect &&
          audit.messagesUpsertPresent &&
          audit.messagesEditedPresent &&
          audit.messagesDeletePresent &&
          audit.secretMatch
        ) {
          healthy += 1;
          continue;
        }
        await this.ensureWebhookConfigured(instanceName);
        const verified = await this.auditWebhookConfiguration(instanceName);
        if (
          verified.urlCorrect &&
          verified.messagesUpsertPresent &&
          verified.messagesEditedPresent &&
          verified.messagesDeletePresent &&
          verified.secretMatch
        ) {
          repaired += 1;
          this.logger.log({
            event: "evolution.webhook.reconciled",
            connectionId: connection.id,
            tenantId: connection.tenantId,
            instanceName: sanitizeInstanceName(instanceName),
          });
        } else {
          failed += 1;
          this.logger.warn({
            event: "evolution.webhook.reconcile_failed",
            connectionId: connection.id,
            tenantId: connection.tenantId,
            instanceName: sanitizeInstanceName(instanceName),
            reason: "VERIFICATION_FAILED",
          });
        }
      } catch (error) {
        failed += 1;
        this.logger.warn({
          event: "evolution.webhook.reconcile_failed",
          connectionId: connection.id,
          tenantId: connection.tenantId,
          instanceName: sanitizeInstanceName(instanceName),
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return { scanned: connections.length, healthy, repaired, failed, skipped: false };
  }

  async auditWebhookConfiguration(instanceName: string) {
    const config = evolutionConfigFromEnv();
    const clientWithWebhookLookup = this.evolution as EvolutionClient & {
      findWebhook?: (name: string) => Promise<{
        url?: string | null;
        events?: string[] | null;
        headers?: Record<string, string | undefined> | null;
      }>;
    };
    const webhook = clientWithWebhookLookup.findWebhook
      ? await clientWithWebhookLookup.findWebhook(instanceName)
      : (await this.evolution.findInstance(instanceName))?.Webhook;
    const headers = webhook?.headers ?? null;
    const evolutionSecret = normalizeSecret(headers?.jwt_key);
    const result = {
      instanceName,
      urlCorrect: webhook?.url === config.webhookPublicUrl,
      messagesUpsertPresent: !!webhook?.events?.includes("MESSAGES_UPSERT"),
      messagesEditedPresent: !!webhook?.events?.includes("MESSAGES_EDITED"),
      messagesDeletePresent: !!webhook?.events?.includes("MESSAGES_DELETE"),
      qrCodeUpdatedPresent: !!webhook?.events?.includes("QRCODE_UPDATED"),
      connectionUpdatePresent: !!webhook?.events?.includes("CONNECTION_UPDATE"),
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
    if (
      current.connectionErrorCode === CONNECTION_OWNER_MISMATCH &&
      status !== MessagingConnectionStatus.CONNECTED
    ) {
      return current;
    }
    let resolvedOwner = owner;
    if (
      status === MessagingConnectionStatus.CONNECTED &&
      current.externalReference &&
      !resolvedOwner?.ownerPhoneNormalized
    ) {
      const instance = await this.evolution
        .findInstance(current.externalReference)
        .catch(() => null);
      const ownerExternalId = instance?.ownerJid ?? null;
      resolvedOwner = {
        ownerExternalId,
        ownerPhoneNormalized: normalizeOwnerPhone(ownerExternalId),
      };
    }
    if (status === MessagingConnectionStatus.CONNECTED && !resolvedOwner?.ownerPhoneNormalized) {
      return this.updateConnectionState(current, MessagingConnectionStatus.CONNECTING, {
        connectionErrorCode: null,
      });
    }
    if (
      status === MessagingConnectionStatus.CONNECTED &&
      current.ownerPhoneNormalized &&
      resolvedOwner?.ownerPhoneNormalized &&
      !sameOwnerPhone(current.ownerPhoneNormalized, resolvedOwner.ownerPhoneNormalized)
    ) {
      return this.rejectDifferentOwner(current, resolvedOwner.ownerPhoneNormalized);
    }
    const ownerData = {
      ownerExternalId: resolvedOwner?.ownerExternalId ?? undefined,
      ownerPhoneNormalized: resolvedOwner?.ownerPhoneNormalized ?? undefined,
    };
    if (status === MessagingConnectionStatus.CONNECTED && current.externalReference) {
      await this.clearQrCode(current.externalReference);
    }
    if (status === MessagingConnectionStatus.CONNECTED && current.externalReference) {
      await this.ensureWebhookConfiguredSafely(current.externalReference, current.id);
    }
    const profilePictureUrl =
      status === MessagingConnectionStatus.CONNECTED
        ? await this.fetchProfilePictureUrlSafely({
            instanceName: current.externalReference,
            ownerExternalId: resolvedOwner?.ownerExternalId ?? current.ownerExternalId,
            ownerPhoneNormalized:
              resolvedOwner?.ownerPhoneNormalized ?? current.ownerPhoneNormalized,
          })
        : undefined;
    if (status === MessagingConnectionStatus.CONNECTED && resolvedOwner?.ownerPhoneNormalized) {
      const duplicateOwner = await this.prisma.messagingConnection.findFirst({
        where: {
          tenantId: current.tenantId,
          id: { not: current.id },
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          ownerPhoneNormalized: resolvedOwner.ownerPhoneNormalized,
        },
      });
      if (duplicateOwner) {
        const updated = await this.prisma.messagingConnection.update({
          where: { id },
          data: {
            status: MessagingConnectionStatus.ERROR,
            ...ownerData,
            connectionErrorCode: null,
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
      data: { status, ...ownerData, logoUrl: profilePictureUrl, connectionErrorCode: null },
    });
    if (updated.status !== current.status) {
      this.realtime?.publishConnectionStatusUpdated({
        tenantId: updated.tenantId,
        connectionId: updated.id,
        status: updated.status.toLowerCase(),
        updatedAt: updated.updatedAt,
      });
      if (updated.status === MessagingConnectionStatus.DISCONNECTED) {
        await this.notifyDisconnectedAdministrator(updated);
      }
    }
    void this.historyImport?.enqueueForConnection(updated);
    return updated;
  }

  private async notifyDisconnectedAdministrator(connection: ConnectionWithArchive) {
    if (!this.email) return;
    try {
      const administrator = await this.prisma.tenantMembership.findFirst({
        where: {
          tenantId: connection.tenantId,
          status: "ACTIVE",
          role: { key: "tenant_admin" },
          user: { status: "ACTIVE" },
        },
        orderBy: { createdAt: "asc" },
        select: { user: { select: { email: true, name: true } } },
      });
      const recipient = administrator?.user.email?.trim();
      if (!administrator || !recipient) {
        this.logger.warn({
          event: "messaging.connection.disconnected_email_skipped",
          tenantId: connection.tenantId,
          connectionId: connection.id,
          reason: "tenant_administrator_email_unavailable",
        });
        return;
      }
      await this.email.sendDisconnectedInstanceAlert({
        to: recipient,
        administratorName: administrator.user.name,
        instanceName: connection.name,
        phone: connection.ownerPhoneNormalized,
        disconnectedAt: connection.updatedAt,
      });
    } catch (error) {
      this.logger.warn({
        event: "messaging.connection.disconnected_email_failed",
        tenantId: connection.tenantId,
        connectionId: connection.id,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async rejectDifferentOwner(current: ConnectionWithArchive, attemptedOwnerPhone: string) {
    if (current.externalReference) {
      try {
        await this.evolution.logout(current.externalReference);
      } catch (error) {
        this.logger.warn({
          event: "messaging.connection.owner_mismatch_logout_failed",
          connectionId: current.id,
          tenantId: current.tenantId,
          instanceName: sanitizeInstanceName(current.externalReference),
          providerError: sanitizeProviderError(error),
        });
      }
    }
    this.logger.warn({
      event: "messaging.connection.owner_mismatch_rejected",
      connectionId: current.id,
      tenantId: current.tenantId,
      expectedOwnerPhone: maskPhone(current.ownerPhoneNormalized),
      attemptedOwnerPhone: maskPhone(attemptedOwnerPhone),
    });
    return this.updateConnectionState(current, MessagingConnectionStatus.ERROR, {
      connectionErrorCode: CONNECTION_OWNER_MISMATCH,
    });
  }

  private async updateConnectionState(
    current: ConnectionWithArchive,
    status: MessagingConnectionStatus,
    data: Pick<Prisma.MessagingConnectionUpdateInput, "connectionErrorCode">,
  ) {
    const updated = await this.prisma.messagingConnection.update({
      where: { id: current.id },
      data: { status, ...data },
    });
    if (
      updated.status !== current.status ||
      updated.connectionErrorCode !== current.connectionErrorCode
    ) {
      this.realtime?.publishConnectionStatusUpdated({
        tenantId: updated.tenantId,
        connectionId: updated.id,
        status: updated.status.toLowerCase(),
        updatedAt: updated.updatedAt,
      });
    }
    return updated;
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

  private assertNotRemovalPending(connection: {
    status: MessagingConnectionStatus;
    serviceEnabled: boolean;
  }) {
    if (
      connection.status === MessagingConnectionStatus.ERROR &&
      connection.serviceEnabled === false
    ) {
      throw new ConflictException(
        "A conexão está com remoção pendente. Conclua ou tente novamente a remoção antes de alterá-la.",
      );
    }
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
        providerResult: "provider_delete_failed",
        providerError: sanitizeProviderError(error),
        httpResult: 503,
      });
      throw new ServiceUnavailableException(
        "Não foi possível remover a instância no provedor. Nenhuma remoção local foi concluída.",
      );
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
      serviceEnabled: connection.serviceEnabled,
      providerType: connection.providerType.toLowerCase(),
      status: connection.status.toLowerCase(),
      externalReference: connection.externalReference,
      reference: connectionReference(connection),
      color: connection.color,
      logoUrl: connection.logoUrl,
      welcomeEnabled: connection.welcomeEnabled,
      welcomeNewMessage: connection.welcomeNewMessage,
      welcomeExistingMessage: connection.welcomeExistingMessage,
      welcomeNewAttachment: connection.welcomeNewAttachment,
      welcomeExistingAttachment: connection.welcomeExistingAttachment,
      absenceEnabled: connection.absenceEnabled,
      absenceMessage: connection.absenceMessage,
      absenceAttachment: connection.absenceAttachment,
      serviceHours: connection.serviceHours,
      timezone: connection.timezone,
      notes: connection.notes,
      importHistoryEnabled: connection.importHistoryEnabled,
      importHistoryStartDate: connection.importHistoryStartDate,
      importGroupsEnabled: connection.importGroupsEnabled,
      importGroupsStartDate: connection.importGroupsStartDate,
      ownerPhoneMasked: maskPhone(connection.ownerPhoneNormalized),
      ownerPhone: connection.ownerPhoneNormalized,
      connectionErrorCode: connection.connectionErrorCode,
      archivedAt: connection.archivedAt,
      provider,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}

function normalizeAutomaticAttachment(
  value: QuickReplyAttachmentDto | null | undefined,
  current: Prisma.JsonValue | null,
) {
  if (value === undefined)
    return current === null ? Prisma.DbNull : (current as Prisma.InputJsonValue);
  if (value === null) return Prisma.DbNull;
  const [metadata, encoded] = value.dataUrl.split(",");
  const size = Buffer.from(encoded ?? "", "base64").byteLength;
  if (metadata !== `data:${value.mimeType};base64` || size !== value.size) {
    throw new BadRequestException("Os dados do arquivo da mensagem automática são inválidos.");
  }
  validatePolicy(resolveMessageType(value.mimeType, ""), value.mimeType, size);
  return { ...value } satisfies Prisma.InputJsonObject;
}

type ConnectionWithArchive = Prisma.MessagingConnectionGetPayload<object> & {
  archivedAt?: Date | null;
};

type QrCodeResult = {
  connectionId: string;
  qrCodeBase64: string | null;
  status: string;
};

export function evolutionQrBase64(response: { base64?: string; qrcode?: { base64?: string } }) {
  return response.qrcode?.base64 ?? response.base64 ?? null;
}

function normalizeQrCode(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 1_500_000) return null;
  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(normalized)) {
    return normalized.replace(/\s+/g, "");
  }
  if (/^[a-z0-9+/=\s]+$/i.test(normalized)) {
    return `data:image/png;base64,${normalized.replace(/\s+/g, "")}`;
  }
  return null;
}

export function translateEvolutionState(value: string | null | undefined) {
  const normalized = value?.toLowerCase();
  if (normalized === "open") return MessagingConnectionStatus.CONNECTED;
  if (normalized === "connecting") return MessagingConnectionStatus.CONNECTING;
  if (normalized === "close" || normalized === "closed")
    return MessagingConnectionStatus.DISCONNECTED;
  return MessagingConnectionStatus.ERROR;
}

export function parseImportStartDate(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localUtc = Date.UTC(year, month - 1, day);
  if (
    new Date(localUtc).getUTCFullYear() !== year ||
    new Date(localUtc).getUTCMonth() !== month - 1 ||
    new Date(localUtc).getUTCDate() !== day
  ) {
    return null;
  }
  return dateAtStartOfDayInTimezone(year, month, day, "America/Sao_Paulo");
}

function dateAtStartOfDayInTimezone(year: number, month: number, day: number, timezone: string) {
  const intendedUtc = Date.UTC(year, month - 1, day);
  let candidate = intendedUtc;
  // Resolve the zone offset twice so the calculation remains correct around
  // daylight-saving transitions in timezones that still observe them.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(candidate));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === type)?.value ?? 0);
    const displayedUtc = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    );
    candidate = intendedUtc - (displayedUtc - candidate);
  }
  return new Date(candidate);
}

function translateInitialStatus(value: string | null | undefined) {
  return translateEvolutionState(value ?? "connecting");
}

export function cleanInstanceName(
  value: string,
  tenantId: string,
  options: { unique?: boolean; idempotencyKey?: string } = {},
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
  if (options.idempotencyKey) {
    const fingerprint = createHash("sha256")
      .update(`${tenantId}:${options.idempotencyKey}`)
      .digest("hex")
      .slice(0, 16);
    return `${tenantId.slice(0, 8)}-onboarding-${fingerprint}`;
  }
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

function duplicateConnectionNameError() {
  return new BadRequestException({
    code: "CONNECTION_NAME_ALREADY_EXISTS",
    message: "Já existe uma instância com este nome.",
  });
}

function isUniqueConstraintError(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
    (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
  );
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

function sameOwnerPhone(expected: string, received: string) {
  const expectedCandidates = new Set(normalizeRemotePhoneCandidates(expected));
  return normalizeRemotePhoneCandidates(received).some((candidate) =>
    expectedCandidates.has(candidate),
  );
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
