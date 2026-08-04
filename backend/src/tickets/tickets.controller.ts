import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { CompleteTicketAttachmentDto } from "./dto/complete-ticket-attachment.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateTicketCommentDto } from "./dto/create-ticket-comment.dto";
import { InitTicketAttachmentDto } from "./dto/init-ticket-attachment.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { UpdateTicketAssigneeDto } from "./dto/update-ticket-assignee.dto";
import { UpdateTicketDepartmentDto } from "./dto/update-ticket-department.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { TicketsService } from "./tickets.service";

@Controller("tickets")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @RequirePermissions("tickets.read")
  list(@Query() query: ListTicketsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.tickets.list(query, current);
  }

  @Post()
  @RequirePermissions("tickets.create")
  create(@Body() dto: CreateTicketDto, @CurrentUser() current: AuthenticatedUser) {
    return this.tickets.create(dto, current);
  }

  @Get(":id")
  @RequirePermissions("tickets.read")
  detail(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.tickets.detail(id, current);
  }

  @Patch(":id")
  @RequirePermissions("tickets.update")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.tickets.update(id, dto, current);
  }

  @Patch(":id/status")
  @RequirePermissions("tickets.status.update")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.tickets.updateStatus(id, dto.status, current);
  }

  @Patch(":id/assignee")
  @RequirePermissions("tickets.assign")
  updateAssignee(
    @Param("id") id: string,
    @Body() dto: UpdateTicketAssigneeDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.tickets.updateAssignee(id, dto.assignedMembershipId, current);
  }

  @Patch(":id/department")
  @RequirePermissions("tickets.assign")
  updateDepartment(
    @Param("id") id: string,
    @Body() dto: UpdateTicketDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.tickets.updateDepartment(id, dto.departmentId, current);
  }

  @Delete(":id")
  @RequirePermissions("tickets.manage")
  archive(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.tickets.archive(id, current);
  }

  @Get(":id/comments")
  @RequirePermissions("tickets.read")
  comments(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.tickets.comments(id, current);
  }

  @Post(":id/comments")
  @RequirePermissions("tickets.comment")
  createComment(
    @Param("id") id: string,
    @Body() dto: CreateTicketCommentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.tickets.createComment(id, dto, current);
  }

  @Post(":id/attachments/init")
  @RequirePermissions("tickets.attachments.upload")
  initAttachment(
    @Param("id") id: string,
    @Body() dto: InitTicketAttachmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.tickets.initAttachment(id, dto, current);
  }

  @Post(":id/attachments/:attachmentId/complete")
  @RequirePermissions("tickets.attachments.upload")
  completeAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Body() dto: CompleteTicketAttachmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.tickets.completeAttachment(id, attachmentId, dto.contentBase64, current);
  }

  @Get(":id/attachments")
  @RequirePermissions("tickets.read")
  attachments(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.tickets.attachments(id, current);
  }

  @Get(":id/attachments/:attachmentId/download")
  @RequirePermissions("tickets.read")
  @Header("Cache-Control", "private, no-store")
  async download(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() current: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { attachment, body } = await this.tickets.downloadAttachment(id, attachmentId, current);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Length", String(body.byteLength));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.originalNameSanitized.replace(/"/g, "")}"`,
    );
    res.end(body);
  }

  @Delete(":id/attachments/:attachmentId")
  @RequirePermissions("tickets.attachments.delete")
  deleteAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.tickets.deleteAttachment(id, attachmentId, current);
  }
}
