import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PlatformModule } from "../platform/platform.module";
import { QueueModule } from "../queue/queue.module";
import { TasksService } from "./tasks.service";
import { TasksController } from "./tasks.controller";
import { TasksWorker } from "./tasks.worker";
import { RealtimeModule } from "../realtime/realtime.module";
import { TaskSmtpService } from "./task-smtp";
@Module({
  imports: [AuthModule, ConfigModule, PrismaModule, PlatformModule, QueueModule, RealtimeModule],
  controllers: [TasksController],
  providers: [TasksService, TaskSmtpService, TasksWorker],
  exports: [TasksService],
})
export class TasksModule {}
