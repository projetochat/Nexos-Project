import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DevelopmentMessagingProvider } from "./development-messaging.provider";
import { MessagingInboundService } from "./messaging-inbound.service";
import { MessagingOutboundService } from "./messaging-outbound.service";
import { MessagingProviderRegistry } from "./messaging-provider.registry";
import { MessagingStatusService } from "./messaging-status.service";

@Module({
  imports: [PrismaModule],
  providers: [
    DevelopmentMessagingProvider,
    MessagingProviderRegistry,
    MessagingOutboundService,
    MessagingInboundService,
    MessagingStatusService,
  ],
  exports: [MessagingOutboundService, MessagingInboundService, MessagingStatusService],
})
export class MessagingModule {}
