import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsController } from "./notifications.controller";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
