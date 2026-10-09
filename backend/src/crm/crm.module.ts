import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PlatformModule } from "../platform/platform.module";
import { CrmController } from "./crm.controller";
import { TagsController } from "./tags.controller";
import { ConversationsModule } from "../conversations/conversations.module";

@Module({
  imports: [AuthModule, RealtimeModule, PlatformModule, MessagingModule, ConversationsModule],
  controllers: [CrmController, TagsController],
})
export class CrmModule {}
