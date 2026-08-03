import { Inject, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { realtimeConfig } from "./realtime.config";
import { REALTIME_NAMESPACE, REALTIME_PATH } from "./realtime-events";
import {
  RealtimeAuthError,
  RealtimeAuthService,
  RealtimeSocketContext,
} from "./realtime-auth.service";
import { RealtimeService } from "./realtime.service";
import { realtimeRooms, conversationRoomId } from "./realtime-rooms";
import { ConfigService } from "@nestjs/config";

type RealtimeSocket = Socket & {
  data: {
    context?: RealtimeSocketContext;
    conversationRooms?: Set<string>;
    eventHits?: Map<string, number[]>;
  };
};

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  path: REALTIME_PATH,
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(RealtimeAuthService) private readonly auth: RealtimeAuthService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}

  async afterInit(server: Server) {
    await this.realtime.attachServer(server);
  }

  async handleConnection(socket: RealtimeSocket) {
    const config = realtimeConfig(this.configService);
    if (!config.enabled) {
      socket.emit("realtime.error", { code: "REALTIME_DISABLED" });
      socket.disconnect(true);
      return;
    }
    try {
      const context = await this.auth.authenticate(socket.handshake.auth?.accessToken);
      socket.data.context = context;
      socket.data.conversationRooms = new Set<string>();
      await socket.join(realtimeRooms.tenant(context.tenantId));
      await socket.join(realtimeRooms.membership(context.membershipId));
      for (const departmentId of context.departmentIds) {
        await socket.join(realtimeRooms.department(departmentId));
      }
      await this.realtime.registerSocket(socket.id, context);
      socket.emit("realtime.ready", {
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        departmentIds: context.departmentIds,
      });
    } catch (error) {
      this.realtime.rejectConnection();
      const code = error instanceof RealtimeAuthError ? error.code : "REALTIME_TOKEN_INVALID";
      socket.emit("realtime.auth_failed", { code });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: RealtimeSocket) {
    await this.realtime.unregisterSocket(socket.id);
  }

  @SubscribeMessage("conversation.subscribe")
  async subscribeConversation(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const context = this.requireContext(socket);
    this.assertRate(socket, "conversation.subscribe", 20);
    const conversationId = validId(body?.conversationId);
    if (!conversationId) return { ok: false, code: "NOT_FOUND" };
    if ((socket.data.conversationRooms?.size ?? 0) >= this.realtime.config.subscriptionLimit) {
      return { ok: false, code: "SUBSCRIPTION_LIMIT" };
    }
    const allowed = await this.realtime.canAccessConversation(context, conversationId);
    if (!allowed) return { ok: false, code: "NOT_FOUND" };
    const room = realtimeRooms.conversation(conversationId);
    await socket.join(room);
    socket.data.conversationRooms?.add(room);
    return { ok: true, conversationId };
  }

  @SubscribeMessage("conversation.unsubscribe")
  async unsubscribeConversation(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    this.requireContext(socket);
    const conversationId = validId(body?.conversationId);
    if (!conversationId) return { ok: false, code: "NOT_FOUND" };
    const room = realtimeRooms.conversation(conversationId);
    await socket.leave(room);
    socket.data.conversationRooms?.delete(room);
    return { ok: true, conversationId };
  }

  @SubscribeMessage("typing.start")
  async typingStart(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const context = this.requireContext(socket);
    this.assertRate(socket, "typing.start", 40);
    const conversationId = validId(body?.conversationId);
    if (!conversationId) return { ok: false, code: "NOT_FOUND" };
    const subscribed = socket.data.conversationRooms?.has(
      realtimeRooms.conversation(conversationId),
    );
    const allowed =
      subscribed || (await this.realtime.canAccessConversation(context, conversationId));
    if (!allowed) return { ok: false, code: "NOT_FOUND" };
    this.realtime.startTyping(context, conversationId);
    return { ok: true };
  }

  @SubscribeMessage("typing.stop")
  async typingStop(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const context = this.requireContext(socket);
    this.assertRate(socket, "typing.stop", 60);
    const conversationId = validId(body?.conversationId);
    if (!conversationId) return { ok: false, code: "NOT_FOUND" };
    const allowed =
      socket.data.conversationRooms?.has(realtimeRooms.conversation(conversationId)) ??
      (await this.realtime.canAccessConversation(context, conversationId));
    if (!allowed) return { ok: false, code: "NOT_FOUND" };
    this.realtime.stopTyping(context, conversationId);
    return { ok: true };
  }

  @SubscribeMessage("presence.heartbeat")
  async heartbeat(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: { status?: "online" | "away" },
  ) {
    const context = this.requireContext(socket);
    this.assertRate(socket, "presence.heartbeat", 30);
    await this.realtime.heartbeat(context, body?.status === "away" ? "away" : "online");
    return { ok: true };
  }

  private requireContext(socket: RealtimeSocket) {
    const context = socket.data.context;
    if (!context) {
      socket.disconnect(true);
      throw new Error("Missing realtime context.");
    }
    return context;
  }

  private assertRate(socket: RealtimeSocket, event: string, limitPerMinute: number) {
    const now = Date.now();
    const hits = socket.data.eventHits ?? new Map<string, number[]>();
    const recent = (hits.get(event) ?? []).filter((item: number) => now - item < 60_000);
    recent.push(now);
    hits.set(event, recent);
    socket.data.eventHits = hits;
    if (recent.length > limitPerMinute) {
      this.logger.warn({
        event: "realtime.client_event.rate_limited",
        socketId: socket.id.slice(0, 8),
        realtimeEvent: event,
      });
      throw new Error("RATE_LIMITED");
    }
  }
}

function validId(value: unknown) {
  return typeof value === "string" && value.trim().length >= 8 ? value.trim() : null;
}
