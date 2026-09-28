import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
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
import { RequireAnyPermission, RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateTicketCommentDto } from "./dto/create-ticket-comment.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { UpdateTicketAssigneeDto } from "./dto/update-ticket-assignee.dto";
import { UpdateTicketDepartmentDto } from "./dto/update-ticket-department.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { TicketsService } from "./tickets.service";

@Controller("tickets")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly ticketsService: TicketsService) {}

  @Get()
  @RequirePermissions("tickets.read")
  list(@Query() query: ListTicketsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.list(query, current);
  }

  @Post()
  @RequireAnyPermission("tickets.manage", "tickets.create")
  create(@Body() dto: CreateTicketDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.create(dto, current);
  }

  @Get(":id")
  @RequirePermissions("tickets.read")
  detail(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.detail(id, current);
  }

  @Patch(":id")
  @RequireAnyPermission("tickets.update", "tickets.manage")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.update(id, dto, current);
  }

  @Patch(":id/status")
  @RequireAnyPermission("tickets.status.update", "tickets.manage")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.updateStatus(id, dto.status, current);
  }

  @Patch(":id/assignee")
  @RequireAnyPermission("tickets.assign", "tickets.manage")
  updateAssignee(
    @Param("id") id: string,
    @Body() dto: UpdateTicketAssigneeDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.updateAssignee(id, dto.assignedMembershipId, current);
  }

  @Patch(":id/department")
  @RequireAnyPermission("tickets.assign", "tickets.manage")
  updateDepartment(
    @Param("id") id: string,
    @Body() dto: UpdateTicketDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.updateDepartment(id, dto.departmentId, current);
  }

  @Delete(":id")
  @RequireAnyPermission("tickets.delete", "tickets.manage")
  archive(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.archive(id, current);
  }

  @Get(":id/comments")
  @RequirePermissions("tickets.read")
  comments(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.comments(id, current);
  }

  @Post(":id/comments")
  @RequireAnyPermission("tickets.comment", "tickets.manage")
  createComment(
    @Param("id") id: string,
    @Body() dto: CreateTicketCommentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.createComment(id, dto, current);
  }

  @Post(":id/attachments")
  @HttpCode(201)
  @RequireAnyPermission("tickets.attachments.upload", "tickets.manage")
  uploadAttachment(
    @Param("id") id: string,
    @CurrentUser() current: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.ticketsService.uploadAttachment(id, req, current);
  }

  @Get(":id/attachments")
  @RequirePermissions("tickets.read")
  attachments(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.attachments(id, current);
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
    const { attachment, body } = await this.ticketsService.downloadAttachment(
      id,
      attachmentId,
      current,
    );
    this.sendAttachment(
      res,
      attachment.mimeType,
      attachment.originalNameSanitized,
      body,
      "attachment",
    );
  }

  @Get(":id/attachments/:attachmentId/inline")
  @RequirePermissions("tickets.read")
  @Header("Cache-Control", "private, no-store")
  async inline(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() current: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { attachment, body } = await this.ticketsService.downloadAttachment(
      id,
      attachmentId,
      current,
    );
    this.sendAttachment(res, attachment.mimeType, attachment.originalNameSanitized, body, "inline");
  }

  @Delete(":id/attachments/:attachmentId")
  @RequireAnyPermission("tickets.attachments.delete", "tickets.manage")
  deleteAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.deleteAttachment(id, attachmentId, current);
  }

  private sendAttachment(
    res: Response,
    mimeType: string,
    fileName: string,
    body: Buffer,
    disposition: "attachment" | "inline",
  ) {
    const safeName = fileName.replace(/[\r\n"]/g, "");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", String(body.byteLength));
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
    res.end(body);
  }
}
