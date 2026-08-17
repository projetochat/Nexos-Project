import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { evolutionConfigFromEnv } from "./evolution.config";
import type { EvolutionWebhookPayload } from "./evolution.types";
import { EvolutionWebhookTranslator } from "./evolution-webhook.translator";
import { MessagingConnectionsService } from "../messaging-connections.service";
import { MessagingInboundService } from "../messaging-inbound.service";
import { MessagingReactionService } from "../messaging-reaction.service";
import { MessagingStatusService } from "../messaging-status.service";

@Controller("webhooks/evolution")
export class EvolutionWebhookController {
  private readonly logger = new Logger(EvolutionWebhookController.name);

  constructor(
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(MessagingConnectionsService)
    private readonly connections: MessagingConnectionsService,
    @Inject(EvolutionWebhookTranslator)
    private readonly translator: EvolutionWebhookTranslator,
    @Inject(MessagingInboundService)
    private readonly inbound: MessagingInboundService,
    @Inject(MessagingReactionService)
    private readonly reactions: MessagingReactionService,
    @Inject(MessagingStatusService)
    private readonly status: MessagingStatusService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Body() payload: EvolutionWebhookPayload,
    @Headers("authorization") authorization?: string,
    @Headers("jwt_key") jwtKey?: string,
  ) {
    const requestId = randomUUID();
    const authStrategy = jwtKey
      ? "jwt_key"
      : authorization?.startsWith("Bearer ")
        ? "bearer_jwt"
        : "none";
    const authResult = await this.assertWebhookAuth(authorization, jwtKey, payload, requestId);
    this.logger.log({
      event: "evolution.webhook.received",
      requestId,
      instanceName: payload.instance ?? null,
      eventType: payload.event ?? null,
      authStrategy,
      authResult,
      httpResult: 200,
    });
    if (!payload.instance) return { ok: true, ignored: "missing_instance" };

    const connection = await this.connections.findByEvolutionInstance(payload.instance);
    if (!connection) {
      this.logger.warn({
        event: "evolution.webhook.unknown_instance",
        requestId,
        instanceName: payload.instance,
        eventType: payload.event ?? null,
        ignoredReason: "CONNECTION_NOT_FOUND",
        httpResult: 200,
      });
      return { ok: true, ignored: "CONNECTION_NOT_FOUND" };
    }

    const translated = this.translator.translate(payload, connection);
    this.logger.log({
      event: "evolution.webhook.translated",
      requestId,
      instanceName: payload.instance,
      connectionId: connection.id,
      tenantId: connection.tenantId,
      kind: translated.kind,
      ignoredReason: translated.kind === "ignored" ? translated.reason : null,
      httpResult: 200,
    });
    if (translated.kind === "inbound") {
      const result = await this.inbound.process(translated.event);
      this.logger.log({
        event: "evolution.webhook.inbound_persisted",
        requestId,
        instanceName: payload.instance,
        connectionId: connection.id,
        tenantId: connection.tenantId,
        messageId: result.message.id,
        externalMessageId: translated.event.externalMessageId,
        resolutionResult: result.duplicate ? "ignored_duplicate" : "persisted",
        duplicate: result.duplicate,
      });
    } else if (translated.kind === "status") {
      await this.status.process(translated.event);
    } else if (translated.kind === "edit") {
      await this.inbound.processEdit(translated.event);
    } else if (translated.kind === "reaction") {
      await this.reactions.process(translated.event);
    } else if (translated.kind === "connection") {
      await this.connections.updateConnectionStatus(connection.id, translated.status, {
        ownerExternalId: translated.ownerExternalId,
        ownerPhoneNormalized: translated.ownerPhoneNormalized,
      });
    } else {
      this.logger.log({
        event: "evolution.webhook.ignored",
        requestId,
        instanceName: payload.instance,
        connectionId: connection.id,
        tenantId: connection.tenantId,
        ignoredReason: translated.reason,
      });
    }

    return {
      ok: true,
      kind: translated.kind,
    };
  }

  private async assertWebhookAuth(
    authorization: string | undefined,
    jwtKey: string | undefined,
    payload: EvolutionWebhookPayload,
    requestId: string,
  ) {
    const config = evolutionConfigFromEnv();
    if (!config.webhookSecret) {
      this.logger.warn({
        event: "evolution.webhook.auth_failed",
        requestId,
        instanceName: payload.instance ?? null,
        eventType: payload.event ?? null,
        authStrategy: jwtKey
          ? "jwt_key"
          : authorization?.startsWith("Bearer ")
            ? "bearer_jwt"
            : "none",
        authResult: "secret_not_configured",
        httpResult: 401,
      });
      throw new UnauthorizedException("Webhook secret not configured.");
    }
    if (jwtKey && jwtKey === config.webhookSecret) return "authenticated";
    if (jwtKey && jwtKey !== config.webhookSecret) {
      this.logger.warn({
        event: "evolution.webhook.auth_failed",
        requestId,
        instanceName: payload.instance ?? null,
        eventType: payload.event ?? null,
        authStrategy: "jwt_key",
        authResult: "invalid_jwt_key",
        httpResult: 401,
      });
      throw new UnauthorizedException("Webhook token invalido.");
    }
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      this.logger.warn({
        event: "evolution.webhook.auth_failed",
        requestId,
        instanceName: payload.instance ?? null,
        eventType: payload.event ?? null,
        authStrategy: "none",
        authResult: "missing_token",
        httpResult: 401,
      });
      throw new UnauthorizedException("Webhook token ausente.");
    }
    try {
      const decoded = await this.jwt.verifyAsync<{ app?: string; action?: string }>(token, {
        secret: config.webhookSecret,
      });
      if (decoded.app !== "evolution" || decoded.action !== "webhook") {
        throw new Error("Invalid claims.");
      }
      return "authenticated";
    } catch {
      this.logger.warn({
        event: "evolution.webhook.auth_failed",
        requestId,
        instanceName: payload.instance ?? null,
        eventType: payload.event ?? null,
        authStrategy: "bearer_jwt",
        authResult: "invalid_token",
        httpResult: 401,
      });
      throw new UnauthorizedException("Webhook token invalido.");
    }
  }
}
