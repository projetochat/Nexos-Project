import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CampaignDispatchQueue } from "../campaigns/campaign-dispatch.queue";
import { EmailModule } from "../email/email.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../tickets/storage/storage.module";
import { PlatformAuthGuard } from "./platform-auth.guard";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformController, TenantEntitlementsController } from "./platform.controller";
import { ImpersonationHandoffController } from "./impersonation-handoff.controller";
import { PlanEntitlementService } from "./plan-entitlement.service";
import { PlatformService } from "./platform.service";
import { TenantFeatureGuard } from "./tenant-feature.guard";

@Module({
  imports: [AuthModule, EmailModule, PrismaModule, QueueModule, RealtimeModule, StorageModule],
  controllers: [PlatformController, TenantEntitlementsController, ImpersonationHandoffController],
  providers: [
    CampaignDispatchQueue,
    PlatformAuthGuard,
    PlatformAuditService,
    PlanEntitlementService,
    PlatformService,
    TenantFeatureGuard,
  ],
  exports: [PlanEntitlementService, PlatformAuditService, TenantFeatureGuard],
})
export class PlatformModule {}
