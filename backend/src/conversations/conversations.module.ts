import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ConversationsController } from "./conversations.controller";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
