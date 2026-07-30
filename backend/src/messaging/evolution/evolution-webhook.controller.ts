import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { evolutionConfigFromEnv } from "./evolution.config";
import { EvolutionWebhookPayload } from "./evolution.types";
import { EvolutionWebhookTranslator } from "./evolution-webhook.translator";
import { MessagingConnectionsService } from "../messaging-connections.service";
import { MessagingInboundService } from "../messaging-inbound.service";
import { MessagingStatusService } from "../messaging-status.service";

@Controller("webhooks/evolution")
export class EvolutionWebhookController {
  constructor(
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(MessagingConnectionsService)
    private readonly connections: MessagingConnectionsService,
    @Inject(EvolutionWebhookTranslator)
    private readonly translator: EvolutionWebhookTranslator,
    @Inject(MessagingInboundService)
    private readonly inbound: MessagingInboundService,
    @Inject(MessagingStatusService)
    private readonly status: MessagingStatusService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Body() payload: EvolutionWebhookPayload,
    @Headers("authorization") authorization?: string,
  ) {
    await this.assertWebhookAuth(authorization);
    if (!payload.instance) return { ok: true, ignored: "missing_instance" };

    const connection = await this.connections.findByEvolutionInstance(payload.instance);
    if (!connection) return { ok: true, ignored: "unknown_instance" };

    const translated = this.translator.translate(payload, connection);
    if (translated.kind === "inbound") {
      await this.inbound.process(translated.event);
    } else if (translated.kind === "status") {
      await this.status.process(translated.event);
    } else if (translated.kind === "connection") {
      await this.connections.updateConnectionStatus(connection.id, translated.status);
    }

    return {
      ok: true,
      kind: translated.kind,
    };
  }

  private async assertWebhookAuth(authorization?: string) {
    const config = evolutionConfigFromEnv();
    if (!config.webhookSecret) throw new UnauthorizedException("Webhook secret not configured.");
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("Webhook token ausente.");
    try {
      const decoded = await this.jwt.verifyAsync<{ app?: string; action?: string }>(token, {
        secret: config.webhookSecret,
      });
      if (decoded.app !== "evolution" || decoded.action !== "webhook") {
        throw new Error("Invalid claims.");
      }
    } catch {
      throw new UnauthorizedException("Webhook token invalido.");
    }
  }
}
