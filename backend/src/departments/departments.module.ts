import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ConfigModule } from "@nestjs/config";
import { QueueModule } from "../queue/queue.module";
import { DepartmentsController } from "./departments.controller";
import { DepartmentInactivityClosureService } from "./department-inactivity-closure.service";

@Module({
  imports: [
    AuthModule,
    PlatformModule,
    ConversationsModule,
    RealtimeModule,
    ConfigModule,
    QueueModule,
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentInactivityClosureService],
})
export class DepartmentsModule {}
