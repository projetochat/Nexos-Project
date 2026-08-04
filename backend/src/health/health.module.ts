import { Module } from "@nestjs/common";
import { CampaignsModule } from "../campaigns/campaigns.module";
import { QueueModule } from "../queue/queue.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../tickets/storage/storage.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [CampaignsModule, QueueModule, RealtimeModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
