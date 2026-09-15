import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { RealtimeAuthService } from "./realtime-auth.service";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimePublisher } from "./realtime.publisher";
import { RealtimeService } from "./realtime.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  providers: [RealtimeAuthService, RealtimeGateway, RealtimePublisher, RealtimeService],
  exports: [RealtimePublisher, RealtimeService],
})
export class RealtimeModule {}
