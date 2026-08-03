import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ConversationsController } from "./conversations.controller";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  imports: [AuthModule, PrismaModule, MessagingModule, RealtimeModule],
  controllers: [ConversationsController, MessagesController],
  providers: [MessagesService],
})
export class ConversationsModule {}
