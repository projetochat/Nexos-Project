import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { OperationsController } from "./operations.controller";
import { OperationsMetricsService } from "./operations-metrics.service";
import { OperationsService } from "./operations.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OperationsController],
  providers: [OperationsMetricsService, OperationsService],
})
export class OperationsModule {}
