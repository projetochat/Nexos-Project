import { SetMetadata } from "@nestjs/common";
import type { Features } from "./plan-entitlement.service";

export const TENANT_FEATURE_KEY = "tenant-feature";

export const RequireTenantFeature = (feature: keyof Features) =>
  SetMetadata(TENANT_FEATURE_KEY, feature);
