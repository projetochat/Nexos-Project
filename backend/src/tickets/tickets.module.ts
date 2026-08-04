import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PlatformModule } from "../platform/platform.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AttachmentSecurityScanner } from "./attachment-security-scanner";
import { StorageModule } from "./storage/storage.module";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule, StorageModule, PlatformModule],
  controllers: [TicketsController],
  providers: [TicketsService, AttachmentSecurityScanner],
  exports: [TicketsService],
})
export class TicketsModule {}
