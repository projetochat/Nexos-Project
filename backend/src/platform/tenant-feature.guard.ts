import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PlanEntitlementService, type Features } from "./plan-entitlement.service";
import { TENANT_FEATURE_KEY } from "./tenant-feature.decorator";

@Injectable()
export class TenantFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const feature = this.reflector.getAllAndOverride<keyof Features>(TENANT_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!request.user?.tenantId) return false;
    await this.entitlements.assertFeature(request.user.tenantId, feature);
    return true;
  }
}
