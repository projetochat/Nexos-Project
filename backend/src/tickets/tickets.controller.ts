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
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { ConfirmDeletionDto } from "../common/deletion-impact";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateTicketCommentDto } from "./dto/create-ticket-comment.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { UpdateTicketAssigneeDto } from "./dto/update-ticket-assignee.dto";
import { UpdateTicketDepartmentDto } from "./dto/update-ticket-department.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { UpdateTicketCommentDto } from "./dto/update-ticket-comment.dto";
import {
  DecideTicketApprovalDto,
  RequestTicketApprovalDto,
  TicketResponseDto,
  TransferTicketDto,
  ValidateTicketSolutionDto,
} from "./dto/ticket-workflow.dto";
import { TicketsService } from "./tickets.service";
import { RequireTenantFeature } from "../platform/tenant-feature.decorator";
import { TenantFeatureGuard } from "../platform/tenant-feature.guard";
import { InviteCustomerContactDto } from "./dto/invite-customer-contact.dto";
import {
  LinkCustomerPortalUserDto,
  UpdateCustomerPortalLoginDto,
} from "./dto/manage-customer-portal-user.dto";

@Controller("tickets")
@RequireTenantFeature("tickets")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantFeatureGuard)
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly ticketsService: TicketsService) {}

  @Get()
  @RequirePermissions("tickets.read")
  list(@Query() query: ListTicketsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.list(query, current);
  }

  @Get("summary")
  @RequirePermissions("tickets.read")
  summary(@Query() query: ListTicketsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.summary(query, current);
  }

  @Get("portal/dashboard")
  @RequirePermissions("tickets.read")
  portalDashboard(@Query() query: ListTicketsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.portalDashboard(query, current);
  }

  @Post()
  @RequirePermissions("tickets.create")
  create(@Body() dto: CreateTicketDto, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.create(dto, current);
  }

  @Get("portal/create-context")
  @RequirePermissions("tickets.create")
  portalCreateContext(@CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.portalTicketCreateContext(current);
  }

  @Post("portal/contacts/:contactId/invitations")
  @RequirePermissions("contacts.update")
  inviteCustomerContact(
    @Param("contactId") contactId: string,
    @Body() dto: InviteCustomerContactDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.inviteCustomerContact(contactId, current, dto.customerId);
  }

  @Get("portal/customers/:customerId/users")
  @RequirePermissions("contacts.read")
  listCustomerPortalUsers(
    @Param("customerId") customerId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.listCustomerPortalUsers(customerId, current);
  }

  @Post("portal/customers/:customerId/users")
  @RequirePermissions("contacts.update")
  linkCustomerPortalUser(
    @Param("customerId") customerId: string,
    @Body() dto: LinkCustomerPortalUserDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.linkCustomerPortalUser(customerId, dto, current);
  }

  @Patch("portal/customers/:customerId/users/:contactId")
  @RequirePermissions("contacts.update")
  updateCustomerPortalUser(
    @Param("customerId") customerId: string,
    @Param("contactId") contactId: string,
    @Body() dto: UpdateCustomerPortalLoginDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.updateCustomerPortalUser(customerId, contactId, dto, current);
  }

  @Delete("portal/customers/:customerId/users/:contactId")
  @RequirePermissions("contacts.update")
  revokeCustomerPortalUser(
    @Param("customerId") customerId: string,
    @Param("contactId") contactId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.revokeCustomerPortalUser(customerId, contactId, current);
  }

  @Get(":id")
  @RequirePermissions("tickets.read")
  detail(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.detail(id, current);
  }

  @Patch(":id")
  @RequirePermissions("tickets.update")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.update(id, dto, current);
  }

  @Patch(":id/status")
  @RequirePermissions("tickets.update")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.updateStatus(id, dto.status, current);
  }

  @Patch(":id/assignee")
  @RequirePermissions("tickets.update")
  updateAssignee(
    @Param("id") id: string,
    @Body() dto: UpdateTicketAssigneeDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.updateAssignee(id, dto.assignedMembershipId, current);
  }

  @Patch(":id/department")
  @RequirePermissions("tickets.update")
  updateDepartment(
    @Param("id") id: string,
    @Body() dto: UpdateTicketDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.updateDepartment(id, dto.departmentId, current);
  }

  @Get(":id/deletion-preview")
  @RequirePermissions("tickets.delete")
  deletionPreview(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.deletionPreview(id, current);
  }

  @Delete(":id")
  @RequirePermissions("tickets.delete")
  remove(
    @Param("id") id: string,
    @Body() dto: ConfirmDeletionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.remove(id, dto.snapshotToken, current);
  }

  @Get(":id/comments")
  @RequirePermissions("tickets.read")
  comments(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.comments(id, current);
  }

  @Post(":id/comments")
  @RequirePermissions("tickets.update")
  createComment(
    @Param("id") id: string,
    @Body() dto: CreateTicketCommentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.createComment(id, dto, current);
  }

  @Patch(":id/comments/:commentId")
  @RequirePermissions("tickets.update")
  updateComment(
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Body() dto: UpdateTicketCommentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.updateComment(id, commentId, dto, current);
  }

  @Post(":id/actions/respond")
  @RequirePermissions("tickets.update")
  respond(
    @Param("id") id: string,
    @Body() dto: TicketResponseDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.respond(id, dto, current);
  }

  @Post(":id/actions/transfer")
  @RequirePermissions("tickets.update")
  transfer(
    @Param("id") id: string,
    @Body() dto: TransferTicketDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.transfer(id, dto, current);
  }

  @Post(":id/actions/request-approval")
  @RequirePermissions("tickets.update")
  requestApproval(
    @Param("id") id: string,
    @Body() dto: RequestTicketApprovalDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.requestApproval(id, dto, current);
  }

  @Get(":id/approvals")
  @RequirePermissions("tickets.read")
  approvals(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.ticketsService.approvals(id, current);
  }

  @Post(":id/approvals/:approvalId/decision")
  @RequirePermissions("tickets.update")
  decideApproval(
    @Param("id") id: string,
    @Param("approvalId") approvalId: string,
    @Body() dto: DecideTicketApprovalDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.decideApproval(id, approvalId, dto, current);
  }

  @Post(":id/actions/solve")
  @RequirePermissions("tickets.update")
  solve(
    @Param("id") id: string,
    @Body() dto: TicketResponseDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.solve(id, dto, current);
  }

  @Post(":id/actions/cancel")
  @RequirePermissions("tickets.update")
  cancel(
    @Param("id") id: string,
    @Body() dto: TicketResponseDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.cancel(id, dto, current);
  }

  @Post(":id/actions/validate-solution")
  @RequirePermissions("tickets.update")
  validateSolution(
    @Param("id") id: string,
    @Body() dto: ValidateTicketSolutionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.ticketsService.validateSolution(id, dto, current);
  }

  @Post(":id/attachments")
  @HttpCode(201)
  @RequirePermissions("tickets.update")
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
  @RequirePermissions("tickets.update")
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
