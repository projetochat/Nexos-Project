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
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PlatformAuthGuard } from "./platform-auth.guard";
import { RequirePlatformPermissions } from "./platform-auth.decorator";
import { PlatformService } from "./platform.service";
import { PlanEntitlementService } from "./plan-entitlement.service";
import { PlatformExceptionFilter } from "./platform-exception.filter";
import {
  CancelSubscriptionDto,
  CreatePlatformClientDto,
  CreateInvoiceDto,
  CreatePlanDto,
  CreateSubscriptionDto,
  InvoiceStatusDto,
  UpdateInvoiceDto,
  PlatformListQueryDto,
  PlatformDashboardQueryDto,
  ReasonDto,
  StartImpersonationHandoffDto,
  StartImpersonationDto,
  UpdatePlanDto,
  UpdatePlatformClientDto,
  UpdatePlatformSettingsDto,
  UpdateSubscriptionDto,
  UpdateTenantAdministratorCredentialsDto,
  UpdateTenantConfigurationDto,
  UpdatePlatformDashboardConfigurationDto,
} from "./platform.dto";

@Controller("platform")
@UseGuards(JwtAuthGuard, PlatformAuthGuard)
@UseFilters(PlatformExceptionFilter)
export class PlatformController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("dashboard")
  @RequirePlatformPermissions("platform.tenants.read")
  dashboard(@Query() query: PlatformDashboardQueryDto) {
    return this.platform.dashboard(query);
  }

  @Get("dashboard/configuration")
  @RequirePlatformPermissions("platform.tenants.read")
  dashboardConfiguration(@CurrentUser() current: AuthenticatedUser) {
    return this.platform.dashboardConfiguration(current);
  }

  @Put("dashboard/configuration")
  @RequirePlatformPermissions("platform.settings.update")
  updateDashboardConfiguration(
    @Body() dto: UpdatePlatformDashboardConfigurationDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateDashboardConfiguration(dto, current);
  }

  @Get("health")
  @RequirePlatformPermissions("platform.system.health.read")
  health() {
    return this.platform.health();
  }

  @Get("settings")
  @RequirePlatformPermissions("platform.settings.read")
  settings() {
    return this.platform.settings();
  }

  @Patch("settings")
  @RequirePlatformPermissions("platform.settings.update")
  updateSettings(
    @Body() dto: UpdatePlatformSettingsDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateSettings(dto, current);
  }

  @Get("clients")
  @RequirePlatformPermissions("platform.tenants.read")
  clients(@Query() query: PlatformListQueryDto) {
    return this.platform.listClients(query);
  }

  @Post("clients")
  @RequirePlatformPermissions("platform.tenants.create")
  createClient(@Body() dto: CreatePlatformClientDto, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.createClient(dto, current);
  }

  @Patch("clients/:id")
  @RequirePlatformPermissions("platform.tenants.update")
  updateClient(
    @Param("id") id: string,
    @Body() dto: UpdatePlatformClientDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateClient(id, dto, current);
  }

  @Delete("clients/:id")
  @RequirePlatformPermissions("platform.tenants.terminate")
  deleteClient(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.deleteClient(id, current);
  }

  @Post("clients/:id/cancel")
  @RequirePlatformPermissions("platform.tenants.terminate")
  cancelClient(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.cancelClient(id, current);
  }

  @Get("tenants")
  @RequirePlatformPermissions("platform.tenants.read")
  tenants(@Query() query: PlatformListQueryDto) {
    return this.platform.listTenants(query);
  }

  @Get("tenants/:id")
  @RequirePlatformPermissions("platform.tenants.read")
  tenant(@Param("id") id: string) {
    return this.platform.tenantDetail(id);
  }

  @Patch("tenants/:id/administrator-credentials")
  @RequirePlatformPermissions("platform.tenants.update")
  updateTenantAdministratorCredentials(
    @Param("id") id: string,
    @Body() dto: UpdateTenantAdministratorCredentialsDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateTenantAdministratorCredentials(id, dto, current);
  }

  @Get("tenants/:id/usage")
  @RequirePlatformPermissions("platform.usage.read")
  usage(@Param("id") id: string) {
    return this.platform.usage(id);
  }

  @Get("tenants/:id/configuration")
  @RequirePlatformPermissions("platform.tenants.read")
  tenantConfiguration(@Param("id") id: string) {
    return this.platform.tenantConfiguration(id);
  }

  @Patch("tenants/:id/configuration")
  @RequirePlatformPermissions("platform.tenants.update")
  updateTenantConfiguration(
    @Param("id") id: string,
    @Body() dto: UpdateTenantConfigurationDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateTenantConfiguration(id, dto, current);
  }

  @Get("plans")
  @RequirePlatformPermissions("platform.plans.read")
  plans(@Query() query: PlatformListQueryDto) {
    return this.platform.listPlans(query);
  }

  @Get("plans/:id")
  @RequirePlatformPermissions("platform.plans.read")
  plan(@Param("id") id: string) {
    return this.platform.planDetail(id);
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

  @Post("plans/:id/archive")
  @RequirePlatformPermissions("platform.plans.archive")
  archivePlan(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.archivePlan(id, current);
  }

  @Post("plans/:id/unarchive")
  @RequirePlatformPermissions("platform.plans.archive")
  unarchivePlan(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.unarchivePlan(id, current);
  }

  @Post("plans/:id/deactivate")
  @RequirePlatformPermissions("platform.plans.update")
  deactivatePlan(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.deactivatePlan(id, current);
  }

  @Post("plans/:id/activate")
  @RequirePlatformPermissions("platform.plans.update")
  activatePlan(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.activatePlan(id, current);
  }

  @Delete("plans/:id")
  @RequirePlatformPermissions("platform.plans.archive")
  deletePlan(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.deletePlan(id, current);
  }

  @Get("subscriptions")
  @RequirePlatformPermissions("platform.subscriptions.read")
  subscriptions(@Query() query: PlatformListQueryDto) {
    return this.platform.listSubscriptions(query);
  }

  @Get("subscriptions/:id")
  @RequirePlatformPermissions("platform.subscriptions.read")
  subscription(@Param("id") id: string) {
    return this.platform.subscriptionDetail(id);
  }

  @Post("clients/:clientId/subscriptions")
  @RequirePlatformPermissions("platform.subscriptions.create")
  createClientSubscription(
    @Param("clientId") clientId: string,
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.createClientSubscription(clientId, dto, current);
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

  @Post("subscriptions/:id/generate-finance")
  @RequirePlatformPermissions("platform.subscriptions.update")
  generateSubscriptionFinance(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.generateSubscriptionFinance(id, current);
  }

  @Post("subscriptions/:id/activate")
  @RequirePlatformPermissions("platform.subscriptions.update")
  activateSubscription(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.activateSubscription(id, current);
  }

  @Post("subscriptions/:id/suspend")
  @RequirePlatformPermissions("platform.subscriptions.update")
  suspendSubscription(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.suspendSubscription(id, dto, current);
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

  @Get("invoices/:id")
  @RequirePlatformPermissions("platform.subscriptions.read")
  invoice(@Param("id") id: string) {
    return this.platform.invoiceDetail(id);
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

  @Patch("invoices/:id")
  @RequirePlatformPermissions("platform.subscriptions.update")
  editInvoice(
    @Param("id") id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.updateInvoice(id, dto, current);
  }

  @Delete("invoices/:id")
  @RequirePlatformPermissions("platform.subscriptions.update")
  deleteInvoice(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.platform.deleteInvoice(id, current);
  }

  @Get("audit-logs")
  @RequirePlatformPermissions("platform.audit.read")
  audit(@Query() query: PlatformListQueryDto) {
    return this.platform.listAudit(query);
  }

  @Get("audit-logs/:id")
  @RequirePlatformPermissions("platform.audit.read")
  auditLog(@Param("id") id: string) {
    return this.platform.auditDetail(id);
  }

  @Post("impersonation/start")
  @RequirePlatformPermissions("platform.impersonation.start")
  startImpersonation(
    @Body() dto: StartImpersonationDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.startImpersonation(dto, current);
  }

  @Post("impersonation/handoff")
  @RequirePlatformPermissions("platform.impersonation.start")
  startImpersonationHandoff(
    @Body() dto: StartImpersonationHandoffDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.platform.startImpersonationHandoff(dto, current);
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

@Controller("tenant")
@UseGuards(JwtAuthGuard)
export class TenantEntitlementsController {
  constructor(
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
  ) {}

  @Get("entitlements")
  async current(@CurrentUser() current: AuthenticatedUser) {
    const effective = await this.entitlements.getEntitlements(current.tenantId);
    return {
      tenantId: current.tenantId,
      features: effective.features,
      limits: effective.limits,
    };
  }
}
