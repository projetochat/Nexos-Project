import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessagesService } from "./messages.service";

@Controller("conversations/:conversationId/messages")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MessagesController {
  constructor(@Inject(MessagesService) private readonly messages: MessagesService) {}

  @Get()
  @RequirePermissions("conversations.read")
  list(
    @Param("conversationId") conversationId: string,
    @Query() query: ListMessagesQueryDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.messages.list(conversationId, query, current);
  }

  @Post()
  @RequirePermissions("messages.send")
  sendText(
    @Param("conversationId") conversationId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.messages.sendText(conversationId, dto, current);
  }

  @Patch("read")
  @RequirePermissions("conversations.read")
  markRead(
    @Param("conversationId") conversationId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.messages.markRead(conversationId, current);
  }
}
