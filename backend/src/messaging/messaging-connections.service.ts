import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MessagingConnectionStatus, MessagingProviderType, Prisma } from "../generated/prisma";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { phoneFromRemoteIdentity } from "./messaging-identity";
import { EvolutionClient } from "./evolution/evolution.client";
import { assertEvolutionConfigured, evolutionConfigFromEnv } from "./evolution/evolution.config";
import { CreateEvolutionConnectionDto } from "./dto/create-evolution-connection.dto";

@Injectable()
export class MessagingConnectionsService {
  private readonly logger = new Logger(MessagingConnectionsService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EvolutionClient)
    private readonly evolution: EvolutionClient,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
  ) {}

  async list(current: AuthenticatedUser) {
    const connections = await this.prisma.messagingConnection.findMany({
      where: { tenantId: current.tenantId, providerType: MessagingProviderType.EVOLUTION },
      orderBy: [{ providerType: "asc" }, { createdAt: "asc" }],
    });
    return connections.map((connection) => this.serialize(connection));
  }

  async detail(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    return this.serialize(connection);
  }

  async createEvolution(dto: CreateEvolutionConnectionDto, current: AuthenticatedUser) {
    const config = evolutionConfigFromEnv();
    if (!assertEvolutionConfigured(config)) {
      throw new BadRequestException("Evolution API nao configurada.");
    }

    const instanceName = cleanInstanceName(dto.name, current.tenantId, { unique: true });
    const response = await this.evolution.createInstance({
      instanceName,
    });
    if (!config.webhookPublicUrl || !config.webhookSecret) {
      await this.evolution.deleteInstance(instanceName).catch(() => undefined);
      throw new BadRequestException("Webhook Evolution nao configurado.");
    }
    await this.ensureWebhookConfigured(instanceName);

    const connection = await this.prisma.messagingConnection.create({
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
      await this.ensureWebhookConfigured(connection.externalReference);
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
    await this.ensureWebhookConfigured(connection.externalReference);
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

  async logout(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection nao e Evolution.");
    }
    await this.evolution.logout(connection.externalReference);
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
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection nao e Evolution.");
    }

    const instance = await this.evolution.findInstance(connection.externalReference);
    if (instance) await this.evolution.deleteInstance(connection.externalReference);

    await this.prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: { tenantId: current.tenantId, connectionId: connection.id },
        data: { connectionId: null },
      });
      await tx.conversation.updateMany({
        where: { tenantId: current.tenantId, connectionId: connection.id },
        data: { connectionId: null },
      });
      await tx.messagingConnection.delete({
        where: { tenantId_id: { tenantId: current.tenantId, id: connection.id } },
      });
    });

    this.realtime?.publishConnectionStatusUpdated({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      status: "removed",
      updatedAt: new Date(),
    });
    return {
      id: connection.id,
      removed: true,
      providerInstanceExisted: !!instance,
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
    });
    return { configured: true };
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

  private serialize(
    connection: Prisma.MessagingConnectionGetPayload<object>,
    provider?: { existsInProvider?: boolean; webhookUrl?: string | null; reason?: string },
  ) {
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      name: connection.name,
      providerType: connection.providerType.toLowerCase(),
      status: connection.status.toLowerCase(),
      externalReference: connection.externalReference,
      ownerPhoneMasked: maskPhone(connection.ownerPhoneNormalized),
      provider,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}

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

function normalizeOwnerPhone(value: string | null) {
  const phone = phoneFromRemoteIdentity(value);
  return phone ? `+${phone}` : null;
}

function sanitizeEnsureError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 200);
  return "webhook ensure failed";
}
