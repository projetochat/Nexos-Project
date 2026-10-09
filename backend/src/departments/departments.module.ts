import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { DepartmentsController } from "./departments.controller";

@Module({
  imports: [AuthModule, PlatformModule, ConversationsModule, RealtimeModule],
  controllers: [DepartmentsController],
})
export class DepartmentsModule {}
