import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PlatformAuthGuard } from "./platform-auth.guard";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformController } from "./platform.controller";
import { PlanEntitlementService } from "./plan-entitlement.service";
import { PlatformService } from "./platform.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PlatformController],
  providers: [PlatformAuthGuard, PlatformAuditService, PlanEntitlementService, PlatformService],
  exports: [PlanEntitlementService, PlatformAuditService],
})
export class PlatformModule {}
