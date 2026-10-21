import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { UsersController } from "./users.controller";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [AuthModule, PlatformModule, RealtimeModule],
  controllers: [UsersController],
})
export class UsersModule {}
