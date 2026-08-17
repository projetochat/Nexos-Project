import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PlatformModule } from "../platform/platform.module";
import { QueueModule } from "../queue/queue.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { DevelopmentMessagingProvider } from "./development-messaging.provider";
import { EvolutionClient } from "./evolution/evolution.client";
import { EvolutionMessagingProvider } from "./evolution/evolution-messaging.provider";
import { EvolutionStartupService } from "./evolution/evolution-startup.service";
import { EvolutionWebhookController } from "./evolution/evolution-webhook.controller";
import { EvolutionWebhookTranslator } from "./evolution/evolution-webhook.translator";
import { MessagingMediaStorageService } from "./media/messaging-media-storage.service";
import { MessagingConnectionsController } from "./messaging-connections.controller";
import { MessagingConnectionsService } from "./messaging-connections.service";
import { MessagingInboundService } from "./messaging-inbound.service";
import { MessagingOutboundService } from "./messaging-outbound.service";
import { MessagingOutboundWorker } from "./messaging-outbound.worker";
import { MessagingProviderRegistry } from "./messaging-provider.registry";
import { MessagingReactionService } from "./messaging-reaction.service";
import { MessagingStatusService } from "./messaging-status.service";

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    QueueModule,
    RealtimeModule,
    PlatformModule,
    JwtModule.register({}),
  ],
  controllers: [MessagingConnectionsController, EvolutionWebhookController],
  providers: [
    DevelopmentMessagingProvider,
    EvolutionClient,
    EvolutionStartupService,
    EvolutionMessagingProvider,
    EvolutionWebhookTranslator,
    MessagingConnectionsService,
    MessagingProviderRegistry,
    MessagingMediaStorageService,
    MessagingOutboundService,
    MessagingOutboundWorker,
    MessagingInboundService,
    MessagingReactionService,
    MessagingStatusService,
  ],
  exports: [
    MessagingOutboundService,
    MessagingInboundService,
    MessagingReactionService,
    MessagingStatusService,
    MessagingConnectionsService,
    MessagingMediaStorageService,
  ],
})
export class MessagingModule {}
