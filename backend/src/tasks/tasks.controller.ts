import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsObject,
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsEmail,
  MaxLength,
} from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { RequireTenantFeature } from "../platform/tenant-feature.decorator";
import { TenantFeatureGuard } from "../platform/tenant-feature.guard";
import { TasksService } from "./tasks.service";
import type { TaskInput, TaskQuery } from "./task-contract";
class SaveTaskDto {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() type!: string;
  @IsString() assignedMembershipId!: string;
  @IsString() priority!: string;
  @IsString() status!: string;
  @IsObject() recurrence!: TaskInput["recurrence"];
  @IsObject() audience!: TaskInput["audience"];
  @IsObject() channels!: TaskInput["channels"];
  @IsOptional() @IsString() legacyOrigin?: string;
  @IsOptional() @IsInt() version?: number;
}
class RecurrenceDto {
  @IsObject() recurrence!: TaskInput["recurrence"];
}
class AudienceDto {
  @IsObject() audience!: TaskInput["audience"];
  @IsOptional() @IsString() connectionId?: string;
}
class RangeDto {
  @IsOptional() @IsString() start?: string;
  @IsOptional() @IsString() end?: string;
  @IsOptional() @IsString() taskId?: string;
}
class SettingsDto {
  @IsBoolean() whatsappEnabled!: boolean;
  @IsBoolean() emailEnabled!: boolean;
  @IsOptional() @IsString() defaultSmtpAccountId?: string | null;
  @IsBoolean() popupEnabled!: boolean;
  @IsBoolean() bellEnabled!: boolean;
  @IsInt() defaultLeadMinutes!: number;
  @IsString() timezone!: string;
}
class SmtpDto {
  @IsString() name!: string;
  @IsString() host!: string;
  @IsInt() port!: number;
  @IsBoolean() secure!: boolean;
  @IsString() username!: string;
  @IsOptional() @IsString() password?: string;
  @IsString() fromAddress!: string;
  @IsString() fromName!: string;
  @IsBoolean() active!: boolean;
}
class ConfirmDto {
  @IsBoolean() confirm!: boolean;
  @IsEmail() @MaxLength(254) recipient!: string;
}
@Controller("tasks")
@RequireTenantFeature("chat")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantFeatureGuard)
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
  @Get("capabilities") @RequirePermissions("schedules.read") capabilities() {
    return this.tasks.capabilities();
  }
  @Get() @RequirePermissions("schedules.read") list(
    @Query() q: TaskQuery,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.list(q, c);
  }
  @Get("summary") @RequirePermissions("schedules.read") summary(
    @Query() q: TaskQuery,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.summary(q, c);
  }
  @Get("options") @RequirePermissions("schedules.read") options(
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.options(c);
  }
  @Get("filter-fields") @RequirePermissions("schedules.read") fields(
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.filterFields(c);
  }
  @Post("recurrence-preview") @RequirePermissions("schedules.read") recurrence(
    @Body() v: RecurrenceDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.previewRecurrence(v, c);
  }
  @Post("audience-preview") @RequirePermissions("schedules.read") audience(
    @Body() v: AudienceDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.previewAudience(v, c);
  }
  @Get("occurrences") @RequirePermissions("schedules.read") occurrences(
    @Query() q: TaskQuery,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.occurrences(q, c);
  }
  @Post("occurrences/materialize") @RequirePermissions("schedules.update") materialize(
    @Body() v: RangeDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.materialize(v, c);
  }
  @Post("occurrences/:id/complete") @RequirePermissions("schedules.update") complete(
    @Param("id") id: string,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.completeOccurrence(id, c);
  }
  @Get("history") @RequirePermissions("schedules.read") history(
    @Query() q: TaskQuery,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.occurrences(q, c, true);
  }
  @Get("settings") @RequirePermissions("schedules.read") settings(
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.settings(c);
  }
  @Put("settings") @RequirePermissions("schedules.update") saveSettings(
    @Body() v: SettingsDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.saveSettings(v, c);
  }
  @Get("smtp") @RequirePermissions("schedules.read") smtp(@CurrentUser() c: AuthenticatedUser) {
    return this.tasks.smtpList(c);
  }
  @Post("smtp") @RequirePermissions("schedules.update") smtpCreate(
    @Body() v: SmtpDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.smtpSave(undefined, v, c);
  }
  @Patch("smtp/:id") @RequirePermissions("schedules.update") smtpUpdate(
    @Param("id") id: string,
    @Body() v: SmtpDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.smtpSave(id, v, c);
  }
  @Delete("smtp/:id") @RequirePermissions("schedules.update") smtpRemove(
    @Param("id") id: string,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.smtpRemove(id, c);
  }
  @Post("smtp/:id/verify") @RequirePermissions("schedules.update") smtpVerify(
    @Param("id") id: string,
    @Body() v: ConfirmDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.smtpVerify(id, v, c);
  }
  @Get("popups") @RequirePermissions("schedules.read") popups(@CurrentUser() c: AuthenticatedUser) {
    return this.tasks.popups(c);
  }
  @Post("popups/:id/dismiss") @RequirePermissions("schedules.read") dismiss(
    @Param("id") id: string,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.dismissPopup(id, c);
  }
  @Post() @RequirePermissions("schedules.create") create(
    @Body() v: SaveTaskDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.create(v, c);
  }
  @Get(":id") @RequirePermissions("schedules.read") get(
    @Param("id") id: string,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.get(id, c);
  }
  @Patch(":id") @RequirePermissions("schedules.update") update(
    @Param("id") id: string,
    @Body() v: SaveTaskDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.update(id, v, c);
  }
  @Post(":id/duplicate") @RequirePermissions("schedules.create") duplicate(
    @Param("id") id: string,
    @Body() v: RecurrenceDto,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.duplicate(id, v, c);
  }
  @Post(":id/pause") @RequirePermissions("schedules.update") pause(
    @Param("id") id: string,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.setStatus(id, "paused", c);
  }
  @Post(":id/resume") @RequirePermissions("schedules.update") resume(
    @Param("id") id: string,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.setStatus(id, "active", c);
  }
  @Delete(":id") @RequirePermissions("schedules.delete") remove(
    @Param("id") id: string,
    @CurrentUser() c: AuthenticatedUser,
  ) {
    return this.tasks.remove(id, c);
  }
}
