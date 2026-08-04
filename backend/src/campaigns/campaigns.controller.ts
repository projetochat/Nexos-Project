import {
  Body,
  Controller,
  Delete,
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
import { CampaignsService } from "./campaigns.service";
import {
  AudiencePreviewDto,
  CreateCampaignDto,
  ListCampaignRecipientsQueryDto,
  ListCampaignsQueryDto,
  ScheduleCampaignDto,
  StartCampaignDto,
  UpdateCampaignDto,
  UpdateMarketingPreferenceDto,
} from "./dto/campaign.dto";

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CampaignsController {
  constructor(@Inject(CampaignsService) private readonly campaigns: CampaignsService) {}

  @Get("campaigns")
  @RequirePermissions("campaigns.read")
  list(@Query() query: ListCampaignsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.list(query, current);
  }

  @Post("campaigns")
  @RequirePermissions("campaigns.create")
  create(@Body() dto: CreateCampaignDto, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.create(dto, current);
  }

  @Post("campaigns/audience-preview")
  @RequirePermissions("campaigns.create")
  preview(@Body() dto: AudiencePreviewDto, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.preview(dto, current);
  }

  @Get("campaigns/:id")
  @RequirePermissions("campaigns.read")
  detail(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.detail(id, current);
  }

  @Patch("campaigns/:id")
  @RequirePermissions("campaigns.update")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.campaigns.update(id, dto, current);
  }

  @Delete("campaigns/:id")
  @RequirePermissions("campaigns.manage")
  archive(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.archive(id, current);
  }

  @Post("campaigns/:id/start")
  @RequirePermissions("campaigns.start")
  start(
    @Param("id") id: string,
    @Body() dto: StartCampaignDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.campaigns.start(id, dto, current);
  }

  @Post("campaigns/:id/schedule")
  @RequirePermissions("campaigns.schedule")
  schedule(
    @Param("id") id: string,
    @Body() dto: ScheduleCampaignDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.campaigns.schedule(id, dto, current);
  }

  @Post("campaigns/:id/pause")
  @RequirePermissions("campaigns.pause")
  pause(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.pause(id, current);
  }

  @Post("campaigns/:id/resume")
  @RequirePermissions("campaigns.pause")
  resume(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.resume(id, current);
  }

  @Post("campaigns/:id/cancel")
  @RequirePermissions("campaigns.cancel")
  cancel(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.cancel(id, current);
  }

  @Post("campaigns/:id/duplicate")
  @RequirePermissions("campaigns.duplicate")
  duplicate(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.duplicate(id, current);
  }

  @Get("campaigns/:id/recipients")
  @RequirePermissions("campaigns.recipients.read")
  recipients(
    @Param("id") id: string,
    @Query() query: ListCampaignRecipientsQueryDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.campaigns.recipients(id, query, current);
  }

  @Get("campaigns/:id/stats")
  @RequirePermissions("campaigns.read")
  stats(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.campaigns.stats(id, current);
  }

  @Patch("contacts/:id/marketing-preference")
  @RequirePermissions("crm.manage")
  updateMarketingPreference(
    @Param("id") id: string,
    @Body() dto: UpdateMarketingPreferenceDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.campaigns.updateContactPreference(id, dto, current);
  }
}
