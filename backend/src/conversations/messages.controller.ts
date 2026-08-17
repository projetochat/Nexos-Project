import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
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

  @Post("media")
  @RequirePermissions("messages.send")
  sendMedia(
    @Param("conversationId") conversationId: string,
    @Req() req: Request,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.messages.sendMedia(conversationId, req, current);
  }

  @Post(":messageId/reactions")
  @RequirePermissions("messages.send")
  react(
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Body() dto: { emoji?: string | null },
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.messages.react(conversationId, messageId, dto.emoji ?? null, current);
  }

  @Get(":messageId/media/download")
  @RequirePermissions("conversations.read")
  async downloadMedia(
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @CurrentUser() current: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const media = await this.messages.downloadMedia(conversationId, messageId, current);
    this.sendMediaResponse(res, media, "attachment");
  }

  @Get(":messageId/media/inline")
  @RequirePermissions("conversations.read")
  async inlineMedia(
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @CurrentUser() current: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const media = await this.messages.downloadMedia(conversationId, messageId, current);
    this.sendMediaResponse(res, media, "inline");
  }

  @Patch("read")
  @RequirePermissions("conversations.read")
  markRead(
    @Param("conversationId") conversationId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.messages.markRead(conversationId, current);
  }

  private sendMediaResponse(
    res: Response,
    media: { body: Buffer; mimeType: string; fileName: string },
    disposition: "attachment" | "inline",
  ) {
    const safeName = media.fileName.replace(/[\r\n"]/g, "");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", media.mimeType);
    res.setHeader("Content-Length", String(media.body.byteLength));
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
    res.end(media.body);
  }
}
