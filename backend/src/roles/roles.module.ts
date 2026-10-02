import { RealtimeModule } from "../realtime/realtime.module";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { RolesController } from "./roles.controller";

@Module({
  imports: [AuthModule, RealtimeModule, PlatformModule],
  controllers: [RolesController],
})
export class RolesModule {}
