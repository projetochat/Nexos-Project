import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CampaignDispatchQueue } from "../campaigns/campaign-dispatch.queue";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../tickets/storage/storage.module";
import { PlatformAuthGuard } from "./platform-auth.guard";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformController } from "./platform.controller";
import { PlanEntitlementService } from "./plan-entitlement.service";
import { PlatformService } from "./platform.service";

@Module({
  imports: [AuthModule, PrismaModule, QueueModule, RealtimeModule, StorageModule],
  controllers: [PlatformController],
  providers: [
    CampaignDispatchQueue,
    PlatformAuthGuard,
    PlatformAuditService,
    PlanEntitlementService,
    PlatformService,
  ],
  exports: [PlanEntitlementService, PlatformAuditService],
})
export class PlatformModule {}
