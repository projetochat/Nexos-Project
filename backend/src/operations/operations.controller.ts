import { Controller, Get, Inject, Param, Query, Res, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { Response } from "express";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { OperationsService } from "./operations.service";

class OperationalQueryDto {
  @IsOptional()
  @IsIn(["today", "yesterday", "7d", "30d", "custom"])
  period?: "today" | "yesterday" | "7d" | "30d" | "custom";

  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  end?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  assignedMembershipId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class ExportQueryDto extends OperationalQueryDto {
  @IsOptional()
  @IsIn(["csv", "xlsx", "pdf"])
  format?: "csv" | "xlsx" | "pdf";
}

@Controller("operations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationsController {
  constructor(@Inject(OperationsService) private readonly operations: OperationsService) {}

  @Get("dashboard")
  @RequirePermissions("conversations.read")
  dashboard(@Query() query: OperationalQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.operations.dashboard(current, query);
  }

  @Get("history/conversations")
  @RequirePermissions("conversations.read")
  history(@Query() query: OperationalQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.operations.history(current, query);
  }

  @Get("history/conversations/:id/timeline")
  @RequirePermissions("conversations.read")
  timeline(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.operations.timeline(current, id);
  }

  @Get("reports/attendance")
  @RequirePermissions("conversations.read")
  report(@Query() query: OperationalQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.operations.report(current, query);
  }

  @Get("reports/attendance/export")
  @RequirePermissions("conversations.read")
  async export(
    @Query() query: ExportQueryDto,
    @CurrentUser() current: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.operations.exportReport(current, query);
    response.setHeader("Content-Type", exported.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
    return exported.body;
  }

  @Get("queues")
  @RequirePermissions("chat.leads.read")
  queues(@Query() query: OperationalQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.operations.queues(current, query);
  }
}
