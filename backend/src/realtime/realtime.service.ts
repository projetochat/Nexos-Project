import { connectionAccess, roleConnectionIds } from "../auth/connection-access";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { Namespace, Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { PrismaService } from "../prisma/prisma.service";
import { realtimeConfig } from "./realtime.config";
import { realtimeEnvelope, RealtimeServerEvent } from "./realtime-events";
import { realtimeRooms } from "./realtime-rooms";
import { RealtimeSocketContext } from "./realtime-auth.service";

type EmitTarget =
  | { room: string }
  | { tenantId: string }
  | { membershipId: string }
  | { departmentId: string }
  | { conversationId: string }
  | { ticketId: string }
  | { campaignId: string };

type RealtimeHealth = {
  enabled: boolean;
  status: "up" | "down" | "degraded";
  adapter: "none" | "redis" | "redis_degraded";
  sockets: number;
  accepted: number;
  rejected: number;
  emitted: number;
  emitFailures: number;
  activeMemberships: number;
};

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | Namespace | null = null;
  private readonly socketMemberships = new Map<string, RealtimeSocketContext>();
  private readonly membershipSockets = new Map<string, Set<string>>();
  private readonly typingTimers = new Map<string, NodeJS.Timeout>();
  private adapter: RealtimeHealth["adapter"] = "none";
  private accepted = 0;
  private rejected = 0;
  private emitted = 0;
  private emitFailures = 0;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  get config() {
    return realtimeConfig(this.configService);
  }

  async attachServer(server: Server | Namespace) {
    this.server = server;
    const config = this.config;
    if (!config.enabled || !config.redisAdapterEnabled) return;

    const redisUrl = this.configService.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    const pubClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      const adapterTarget = this.adapterTarget(server);
      adapterTarget.adapter(createAdapter(pubClient, subClient));
      this.adapter = "redis";
    } catch (error) {
      this.adapter = "redis_degraded";
      this.logger.warn({
        event: "realtime.redis_adapter.degraded",
        error: error instanceof Error ? error.message : "Redis adapter unavailable.",
      });
    }
  }

  private adapterTarget(server: Server | Namespace): Server {
    const candidate = server as Server & { server?: Server };
    return typeof candidate.adapter === "function" ? candidate : candidate.server!;
  }

  async registerSocket(socketId: string, context: RealtimeSocketContext) {
    this.accepted += 1;
    this.socketMemberships.set(socketId, context);
    const sockets = this.membershipSockets.get(context.membershipId) ?? new Set<string>();
    const wasOffline = sockets.size === 0;
    sockets.add(socketId);
    this.membershipSockets.set(context.membershipId, sockets);
    await this.writePresence(context, "online");
    if (wasOffline) {
      this.publishPresence(context.tenantId, {
        membershipId: context.membershipId,
        userId: context.userId,
        status: "online",
      });
    }
  }

  async unregisterSocket(socketId: string) {
    const context = this.socketMemberships.get(socketId);
    if (!context) return;
    this.socketMemberships.delete(socketId);
    const sockets = this.membershipSockets.get(context.membershipId);
    sockets?.delete(socketId);
    if (!sockets || sockets.size === 0) {
      this.membershipSockets.delete(context.membershipId);
      await this.deletePresence(context);
      this.publishPresence(context.tenantId, {
        membershipId: context.membershipId,
        userId: context.userId,
        status: "offline",
      });
    }
  }

  rejectConnection() {
    this.rejected += 1;
  }

  private async currentConnectionScope(context: RealtimeSocketContext) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: context.membershipId,
        tenantId: context.tenantId,
        userId: context.userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
      },
      include: { role: true },
    });
    if (!membership) return null;
    return { roleKey: membership.role.key, connectionIds: roleConnectionIds(membership.role) };
  }

  async canAccessConversation(context: RealtimeSocketContext, conversationId: string) {
    const scope = await this.currentConnectionScope(context);
    if (!scope) return false;
    return !!(await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        tenantId: context.tenantId,
        archivedAt: null,
        ...connectionAccess(scope),
      },
      select: { id: true },
    }));
  }

  private async publishScoped<T>(room: string, event: RealtimeServerEvent, data: T) {
    if (!this.server) return;
    const payload = data as { conversationId?: string; connectionId?: string; contactId?: string };
    const sockets = await this.server.in(room).fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const context = socket.data.context as RealtimeSocketContext | undefined;
        if (!context) return;
        const scope = await this.currentConnectionScope(context);
        if (!scope) return;
        if (payload.conversationId) {
          const conversation = await this.prisma.conversation.findFirst({
            where: {
              id: payload.conversationId,
              tenantId: context.tenantId,
              ...connectionAccess(scope),
            },
            select: { id: true },
          });
          if (!conversation) return;
        } else if (payload.connectionId && scope.roleKey !== "tenant_admin") {
          if (!scope.connectionIds?.includes(payload.connectionId)) return;
        } else if (payload.contactId && scope.roleKey !== "tenant_admin") {
          const contact = await this.prisma.contact.findFirst({
            where: {
              id: payload.contactId,
              tenantId: context.tenantId,
              conversations: { some: connectionAccess(scope) },
            },
            select: { id: true },
          });
          if (!contact) return;
        }
        socket.emit(event, realtimeEnvelope(event, data));
      }),
    );
  }

  publish<T>(target: EmitTarget, event: RealtimeServerEvent, data: T) {
    const server = this.server;
    if (!server || !this.config.enabled) return;
    const room = targetRoom(target);
    const payload = data as { conversationId?: string; connectionId?: string; contactId?: string };
    if (payload.conversationId || payload.connectionId || payload.contactId) {
      void this.publishScoped(room, event, data).catch(() => {
        this.emitFailures += 1;
      });
      return;
    }
    try {
      server.to(room).emit(event, realtimeEnvelope(event, data));
      this.emitted += 1;
    } catch (error) {
      this.emitFailures += 1;
      this.logger.warn({
        event: "realtime.emit_failed",
        roomType: room.split(":")[0],
        realtimeEvent: event,
        error: error instanceof Error ? error.message : "Emit failed.",
      });
    }
  }

  publishPresence(
    tenantId: string,
    data: { membershipId: string; userId: string; status: string },
  ) {
    this.publish({ tenantId }, "presence.updated", data);
  }

  startTyping(context: RealtimeSocketContext, conversationId: string) {
    const key = `${context.membershipId}:${conversationId}`;
    this.clearTypingTimer(key);
    this.publish({ conversationId }, "typing.started", {
      conversationId,
      membershipId: context.membershipId,
      userId: context.userId,
    });
    this.typingTimers.set(
      key,
      setTimeout(() => this.stopTyping(context, conversationId), this.config.typingTtlMs),
    );
  }

  stopTyping(context: RealtimeSocketContext, conversationId: string) {
    const key = `${context.membershipId}:${conversationId}`;
    this.clearTypingTimer(key);
    this.publish({ conversationId }, "typing.stopped", {
      conversationId,
      membershipId: context.membershipId,
      userId: context.userId,
    });
  }

  async heartbeat(context: RealtimeSocketContext, status: "online" | "away" = "online") {
    await this.writePresence(context, status);
    this.publishPresence(context.tenantId, {
      membershipId: context.membershipId,
      userId: context.userId,
      status,
    });
  }

  health(): RealtimeHealth {
    const enabled = this.config.enabled;
    return {
      enabled,
      status: !enabled ? "down" : this.adapter === "redis_degraded" ? "degraded" : "up",
      adapter: this.adapter,
      sockets: this.socketMemberships.size,
      accepted: this.accepted,
      rejected: this.rejected,
      emitted: this.emitted,
      emitFailures: this.emitFailures,
      activeMemberships: this.membershipSockets.size,
    };
  }

  private async writePresence(context: RealtimeSocketContext, status: "online" | "away") {
    const ttl = Math.max(this.config.presenceTtlSeconds, 10);
    await this.prisma.$executeRaw`SELECT 1`;
    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (!redisUrl) return;
    const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    try {
      await client.connect();
      await client.set(
        `trixus:presence:${context.tenantId}:${context.membershipId}`,
        JSON.stringify({ status, userId: context.userId, updatedAt: new Date().toISOString() }),
        "EX",
        ttl,
      );
    } catch {
      this.adapter = this.adapter === "redis" ? "redis_degraded" : this.adapter;
    } finally {
      client.disconnect();
    }
  }

  private async deletePresence(context: RealtimeSocketContext) {
    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (!redisUrl) return;
    const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    try {
      await client.connect();
      await client.del(`trixus:presence:${context.tenantId}:${context.membershipId}`);
    } catch {
      this.adapter = this.adapter === "redis" ? "redis_degraded" : this.adapter;
    } finally {
      client.disconnect();
    }
  }

  private clearTypingTimer(key: string) {
    const timer = this.typingTimers.get(key);
    if (timer) clearTimeout(timer);
    this.typingTimers.delete(key);
  }
}

function targetRoom(target: EmitTarget) {
  if ("room" in target) return target.room;
  if ("tenantId" in target) return realtimeRooms.tenant(target.tenantId);
  if ("membershipId" in target) return realtimeRooms.membership(target.membershipId);
  if ("departmentId" in target) return realtimeRooms.department(target.departmentId);
  if ("ticketId" in target) return realtimeRooms.ticket(target.ticketId);
  if ("campaignId" in target) return `campaign:${target.campaignId}`;
  return realtimeRooms.conversation(target.conversationId);
}
