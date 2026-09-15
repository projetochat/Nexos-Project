import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { LeadsController } from "./leads.controller";

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule],
  controllers: [LeadsController],
})
export class LeadsModule {}
