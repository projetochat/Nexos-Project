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
      where: { tenantId: current.tenantId },
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

    const instanceName = cleanInstanceName(dto.instanceName ?? dto.name, current.tenantId);
    const response = await this.evolution.createInstance({
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
    const state = await this.evolution.connectionState(connection.externalReference);
    const updated = await this.prisma.messagingConnection.update({
      where: { id: connection.id },
      data: { status: translateEvolutionState(state.instance?.state ?? state.instance?.status) },
    });
    return this.serialize(updated);
  }

  async qrCode(id: string, current: AuthenticatedUser) {
    const connection = await this.findTenantConnection(id, current.tenantId);
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Connection nao e Evolution.");
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
    return this.evolution.health();
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

  private serialize(connection: Prisma.MessagingConnectionGetPayload<object>) {
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      name: connection.name,
      providerType: connection.providerType.toLowerCase(),
      status: connection.status.toLowerCase(),
      externalReference: connection.externalReference,
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

function cleanInstanceName(value: string, tenantId: string) {
  const base = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  if (!base) throw new BadRequestException("Nome da instance invalido.");
  return `${tenantId.slice(0, 8)}-${base}`;
}
