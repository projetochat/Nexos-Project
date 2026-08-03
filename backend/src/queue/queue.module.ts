import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { MessagingOutboundQueue, RedisConnectionFactory } from "./messaging-outbound.queue";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { OutboxPollerService } from "./outbox-poller.service";

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    RedisConnectionFactory,
    MessagingOutboundQueue,
    OutboxDispatcherService,
    OutboxPollerService,
  ],
  exports: [RedisConnectionFactory, MessagingOutboundQueue, OutboxDispatcherService],
})
export class QueueModule {}
