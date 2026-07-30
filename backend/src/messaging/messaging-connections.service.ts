import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { MessagingConnectionStatus, MessagingProviderType, Prisma } from "../generated/prisma";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { EvolutionClient } from "./evolution/evolution.client";
import { assertEvolutionConfigured, evolutionConfigFromEnv } from "./evolution/evolution.config";
import { CreateEvolutionConnectionDto } from "./dto/create-evolution-connection.dto";

@Injectable()
export class MessagingConnectionsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EvolutionClient)
    private readonly evolution: EvolutionClient,
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

    const instanceName = cleanInstanceName(dto.instanceName ?? dto.name, current.tenantId, {
      unique: !dto.instanceName,
    });
    const response = await this.evolution.createInstance({
      instanceName,
    });
    if (!config.webhookPublicUrl || !config.webhookSecret) {
      await this.evolution.deleteInstance(instanceName).catch(() => undefined);
      throw new BadRequestException("Webhook Evolution nao configurado.");
    }
    await this.evolution.setWebhook({
      instanceName,
      webhookUrl: config.webhookPublicUrl,
      webhookSecret: config.webhookSecret,
    });

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
    return {
      ...this.serialize(connection),
      qrCodeBase64: response.qrcode?.base64 ?? null,
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
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { status: translateEvolutionState(state.instance?.state ?? state.instance?.status) },
    });
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
    await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { status: MessagingConnectionStatus.CONNECTING },
    });
    return {
      connectionId: connection.id,
      qrCodeBase64: response.qrcode?.base64 ?? null,
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

  async updateConnectionStatus(id: string, status: MessagingConnectionStatus) {
    return this.prisma.messagingConnection.update({ where: { id }, data: { status } });
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
      provider,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
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
  if (options.unique) return `${tenantId.slice(0, 8)}-${base}-${Date.now().toString(36).slice(-6)}`;
  return `${tenantId.slice(0, 8)}-${base}`;
}
