import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PlatformModule } from "../platform/platform.module";
import { AiController } from "./ai.controller";
import { AiCredentialEncryptionService } from "./ai-credential-encryption.service";
import { AiProviderService } from "./ai-provider.service";
import { AiService } from "./ai.service";

@Module({
  imports: [AuthModule, ConversationsModule, MessagingModule, PlatformModule],
  controllers: [AiController],
  providers: [AiCredentialEncryptionService, AiProviderService, AiService],
})
export class AiModule {}
