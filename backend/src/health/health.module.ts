import { Module } from "@nestjs/common";
import { QueueModule } from "../queue/queue.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [QueueModule, RealtimeModule],
  controllers: [HealthController],
})
export class HealthModule {}
