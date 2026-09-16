import { RealtimeModule } from "../realtime/realtime.module";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RolesController } from "./roles.controller";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [RolesController],
})
export class RolesModule {}
