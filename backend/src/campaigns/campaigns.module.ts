import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PlatformModule } from "../platform/platform.module";
import { QueueModule } from "../queue/queue.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CampaignDispatchQueue } from "./campaign-dispatch.queue";
import { CampaignDispatchWorker } from "./campaign-dispatch.worker";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";

@Module({
  imports: [AuthModule, ConfigModule, PrismaModule, QueueModule, RealtimeModule, PlatformModule],
  controllers: [CampaignsController],
  providers: [CampaignDispatchQueue, CampaignDispatchWorker, CampaignsService],
  exports: [CampaignDispatchQueue, CampaignsService],
})
export class CampaignsModule {}
