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
import { MessagingConnectionStatus, MessagingProviderType, Prisma } from "../generated/prisma";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
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

  async detail(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    return this.serialize(connection);
  }

  async createEvolution(dto: CreateEvolutionConnectionDto, current: AuthenticatedUser) {
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
      throw new BadRequestException("Evolution API nao configurada.");
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
      throw providerUnavailableForUi(error, "Nao foi possivel criar a instancia na Evolution.");
    }
    if (!config.webhookPublicUrl || !config.webhookSecret) {
      await this.evolution.deleteInstance(instanceName).catch(() => undefined);
      throw new BadRequestException("Webhook Evolution nao configurado.");
    }
    await this.ensureWebhookConfiguredSafely(instanceName, "pending-create");

    let connection: Awaited<ReturnType<PrismaService["messagingConnection"]["create"]>>;
    try {
      connection = await this.prisma.messagingConnection.create({
        data: {
          tenantId: current.tenantId,
          name: dto.name.trim(),
          providerType: MessagingProviderType.EVOLUTION,
          status: translateInitialStatus(
            response.instance?.status ?? response.instance?.connectionStatus,
          ),
          externalReference: instanceName,
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
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: {
        status: translatedStatus,
        ownerExternalId: ownerExternalId ?? undefined,
        ownerPhoneNormalized: ownerPhoneNormalized ?? undefined,
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
    return this.serialize(updated, { existsInProvider: true, webhookUrl: instance.Webhook?.url });
  }

  async qrCode(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection nao e Evolution.");
    }
    const instance = await this.evolution.findInstance(connection.externalReference);
    if (!instance) {
      await this.markOrphan(connection.id);
      throw new BadRequestException("INSTANCE_NOT_FOUND: instance Evolution nao encontrada.");
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
      throw new BadRequestException("Connection removida nao pode ser editada.");
    }
    const updated = await this.prisma.messagingConnection.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: connection.id } },
      data: {
        name: dto.name?.trim(),
        color: normalizeColor(dto.color),
        welcomeEnabled: dto.welcomeEnabled,
        welcomeNewMessage: cleanOptionalText(dto.welcomeNewMessage),
        welcomeExistingMessage: cleanOptionalText(dto.welcomeExistingMessage),
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

  async logout(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection nao e Evolution.");
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
    if (connection.archivedAt || connection.status === MessagingConnectionStatus.REMOVED) {
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
      };
    }
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection nao e Evolution.");
    }

    const providerDelete = await this.deleteEvolutionInstanceForRemoval(
      connection.externalReference,
      baseLog,
    );
    const archivedAt = new Date();
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
      throw new BadRequestException("Webhook Evolution nao configurado.");
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
      data: { status, ...ownerData },
    });
    if (updated.status !== current.status) {
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

  private async findTenantConnection(id: string, tenantId: string) {
    const connection = await this.prisma.messagingConnection.findFirst({
      where: { id, tenantId },
    });
    if (!connection) throw new NotFoundException("Connection nao encontrada.");
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
      welcomeEnabled: connection.welcomeEnabled,
      welcomeNewMessage: connection.welcomeNewMessage,
      welcomeExistingMessage: connection.welcomeExistingMessage,
      notes: connection.notes,
      ownerPhoneMasked: maskPhone(connection.ownerPhoneNormalized),
      ownerPhone: connection.ownerPhoneNormalized,
      archivedAt: connection.archivedAt,
      provider,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}

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
  if (!base) throw new BadRequestException("Nome da instance invalido.");
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
