import {
  isPermissionKey,
  TENANT_ADMIN_PERMISSIONS,
  type PermissionKey,
} from "./permissions.constants";
import { coerceFeatures, mergeFeatureOverrides } from "../platform/plan-entitlement.service";

type RoleWithPermissions = {
  key: string;
  permissions: Array<{ permissionId: string }>;
};

export function effectivePermissions(role: RoleWithPermissions): PermissionKey[] {
  if (role.key === "tenant_admin") return [...TENANT_ADMIN_PERMISSIONS];
  return [
    ...new Set(
      role.permissions.map((permission) => permission.permissionId).filter(isPermissionKey),
    ),
  ];
}

type TenantSubscriptionReader = {
  tenantSubscription: {
    findFirst(args: unknown): Promise<{ featuresSnapshot: unknown } | null>;
  };
};

export async function moduleAwarePermissions(
  prisma: TenantSubscriptionReader,
  tenantId: string,
  featureOverrides: unknown,
  role: RoleWithPermissions,
): Promise<PermissionKey[]> {
  const permissions = effectivePermissions(role);
  if (role.key !== "tenant_admin") return permissions;
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED"] } },
    orderBy: { createdAt: "desc" },
    select: { featuresSnapshot: true },
  });
  const features = mergeFeatureOverrides(
    coerceFeatures(subscription?.featuresSnapshot),
    featureOverrides,
  );
  return permissions.filter(
    (permission) =>
      (features.campaigns || !permission.startsWith("campaigns.")) &&
      (features.tickets || !permission.startsWith("tickets.")),
  );
}
