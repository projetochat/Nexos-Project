import { SetMetadata } from "@nestjs/common";

export const PLATFORM_PERMISSIONS_KEY = "platform_permissions";

export const PLATFORM_PERMISSIONS = [
  "platform.tenants.read",
  "platform.tenants.create",
  "platform.tenants.update",
  "platform.tenants.suspend",
  "platform.tenants.terminate",
  "platform.plans.read",
  "platform.plans.create",
  "platform.plans.update",
  "platform.plans.archive",
  "platform.subscriptions.read",
  "platform.subscriptions.create",
  "platform.subscriptions.update",
  "platform.subscriptions.cancel",
  "platform.usage.read",
  "platform.audit.read",
  "platform.impersonation.start",
  "platform.impersonation.stop",
  "platform.system.health.read",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const RequirePlatformPermissions = (...permissions: PlatformPermission[]) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);
