import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ConversationsController } from "./conversations.controller";
import { GroupsController } from "./groups.controller";
import { GroupsSyncService } from "./groups-sync.service";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  imports: [AuthModule, PrismaModule, MessagingModule, RealtimeModule],
  controllers: [ConversationsController, MessagesController, GroupsController],
  providers: [MessagesService, GroupsSyncService],
})
export class ConversationsModule {}
