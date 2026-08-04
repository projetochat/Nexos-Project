import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AutomationsController } from "./automations.controller";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AutomationsController],
})
export class AutomationsModule {}
