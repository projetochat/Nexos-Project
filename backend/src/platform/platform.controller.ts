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
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PlatformAuthGuard } from "./platform-auth.guard";
import { RequirePlatformPermissions } from "./platform-auth.decorator";
import { PlatformService } from "./platform.service";
import {
  CancelSubscriptionDto,
  CreateInvoiceDto,
  CreatePlanDto,
  CreateSubscriptionDto,
  CreateTenantDto,
  InvoiceStatusDto,
  PlatformListQueryDto,
  ReasonDto,
  StartImpersonationDto,
  TerminateTenantDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
  UpdateTenantDto,
} from "./platform.dto";

@Controller("platform")
@UseGuards(JwtAuthGuard, PlatformAuthGuard)
export class PlatformController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("dashboard")
  @RequirePlatformPermissions("platform.tenants.read")
  dashboard() {
    return this.platform.dashboard();
  }

  @Get("tenants")
  @RequirePlatformPermissions("platform.tenants.read")
  tenants(@Query() query: PlatformListQueryDto) {
    return this.platform.listTenants(query);
  }

  @Post("tenants")
  @RequirePlatformPermissions("platform.tenants.create")
  createTenant(@Body() dto: CreateTenantDto, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.createTenant(dto, current);
  }

  @Get("tenants/:id")
  @RequirePlatformPermissions("platform.tenants.read")
  tenant(@Param("id") id: string) {
    return this.platform.tenantDetail(id);
  }

  @Patch("tenants/:id")
  @RequirePlatformPermissions("platform.tenants.update")
  updateTenant(
    @Param("id") id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateTenant(id, dto, current);
  }

  @Post("tenants/:id/suspend")
  @RequirePlatformPermissions("platform.tenants.suspend")
  suspendTenant(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.suspendTenant(id, dto, current);
  }

  @Post("tenants/:id/reactivate")
  @RequirePlatformPermissions("platform.tenants.suspend")
  reactivateTenant(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.reactivateTenant(id, dto, current);
  }

  @Post("tenants/:id/terminate")
  @RequirePlatformPermissions("platform.tenants.terminate")
  terminateTenant(
    @Param("id") id: string,
    @Body() dto: TerminateTenantDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.terminateTenant(id, dto, current);
  }

  @Get("tenants/:id/usage")
  @RequirePlatformPermissions("platform.usage.read")
  usage(@Param("id") id: string) {
    return this.platform.usage(id);
  }

  @Get("plans")
  @RequirePlatformPermissions("platform.plans.read")
  plans(@Query() query: PlatformListQueryDto) {
    return this.platform.listPlans(query);
  }

  @Post("plans")
  @RequirePlatformPermissions("platform.plans.create")
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.createPlan(dto, current);
  }

  @Patch("plans/:id")
  @RequirePlatformPermissions("platform.plans.update")
  updatePlan(
    @Param("id") id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updatePlan(id, dto, current);
  }

  @Delete("plans/:id")
  @RequirePlatformPermissions("platform.plans.archive")
  archivePlan(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.archivePlan(id, current);
  }

  @Get("subscriptions")
  @RequirePlatformPermissions("platform.subscriptions.read")
  subscriptions(@Query() query: PlatformListQueryDto) {
    return this.platform.listSubscriptions(query);
  }

  @Post("tenants/:tenantId/subscriptions")
  @RequirePlatformPermissions("platform.subscriptions.create")
  createSubscription(
    @Param("tenantId") tenantId: string,
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.createSubscription(tenantId, dto, current);
  }

  @Patch("subscriptions/:id")
  @RequirePlatformPermissions("platform.subscriptions.update")
  updateSubscription(
    @Param("id") id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateSubscription(id, dto, current);
  }

  @Post("subscriptions/:id/cancel")
  @RequirePlatformPermissions("platform.subscriptions.cancel")
  cancelSubscription(
    @Param("id") id: string,
    @Body() dto: CancelSubscriptionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.cancelSubscription(id, dto, current);
  }

  @Get("subscriptions/:id/history")
  @RequirePlatformPermissions("platform.subscriptions.read")
  history(@Param("id") id: string) {
    return this.platform.history(id);
  }

  @Get("invoices")
  @RequirePlatformPermissions("platform.subscriptions.read")
  invoices(@Query() query: PlatformListQueryDto) {
    return this.platform.listInvoices(query);
  }

  @Post("invoices")
  @RequirePlatformPermissions("platform.subscriptions.update")
  createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.createInvoice(dto, current);
  }

  @Patch("invoices/:id/status")
  @RequirePlatformPermissions("platform.subscriptions.update")
  updateInvoice(
    @Param("id") id: string,
    @Body() dto: InvoiceStatusDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateInvoiceStatus(id, dto, current);
  }

  @Get("audit-logs")
  @RequirePlatformPermissions("platform.audit.read")
  audit(@Query() query: PlatformListQueryDto) {
    return this.platform.listAudit(query);
  }

  @Post("impersonation/start")
  @RequirePlatformPermissions("platform.impersonation.start")
  startImpersonation(
    @Body() dto: StartImpersonationDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.startImpersonation(dto, current);
  }

  @Post("impersonation/:id/stop")
  @RequirePlatformPermissions("platform.impersonation.stop")
  stopImpersonation(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.stopImpersonation(id, current);
  }

  @Get("impersonation/current")
  @RequirePlatformPermissions("platform.impersonation.start")
  currentImpersonation(@CurrentUser() current: AuthenticatedUser) {
    return this.platform.currentImpersonation(current);
  }
}
