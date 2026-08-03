import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { DevelopmentMessagingProvider } from "./development-messaging.provider";
import { EvolutionClient } from "./evolution/evolution.client";
import { EvolutionMessagingProvider } from "./evolution/evolution-messaging.provider";
import { EvolutionWebhookController } from "./evolution/evolution-webhook.controller";
import { EvolutionWebhookTranslator } from "./evolution/evolution-webhook.translator";
import { MessagingConnectionsController } from "./messaging-connections.controller";
import { MessagingConnectionsService } from "./messaging-connections.service";
import { MessagingInboundService } from "./messaging-inbound.service";
import { MessagingOutboundService } from "./messaging-outbound.service";
import { MessagingOutboundWorker } from "./messaging-outbound.worker";
import { MessagingProviderRegistry } from "./messaging-provider.registry";
import { MessagingStatusService } from "./messaging-status.service";

@Module({
  imports: [AuthModule, PrismaModule, QueueModule, JwtModule.register({})],
  controllers: [MessagingConnectionsController, EvolutionWebhookController],
  providers: [
    DevelopmentMessagingProvider,
    EvolutionClient,
    EvolutionMessagingProvider,
    EvolutionWebhookTranslator,
    MessagingConnectionsService,
    MessagingProviderRegistry,
    MessagingOutboundService,
    MessagingOutboundWorker,
    MessagingInboundService,
    MessagingStatusService,
  ],
  exports: [
    MessagingOutboundService,
    MessagingInboundService,
    MessagingStatusService,
    MessagingConnectionsService,
  ],
})
export class MessagingModule {}
