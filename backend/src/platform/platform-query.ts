import { BadRequestException } from "@nestjs/common";
import { PlanStatus, SubscriptionStatus, TenantStatus } from "../generated/prisma";
import type { PlatformListQueryDto } from "./platform.dto";

export type PlatformPagination = {
  page: number;
  pageSize: number;
  skip: number;
};

export function platformPagination(query: PlatformListQueryDto): PlatformPagination {
  const page = readPositiveInteger(query.page, 1);
  const pageSize = readBoundedPositiveInteger(query.pageSize, 20, 1, 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function trimmedSearch(query: PlatformListQueryDto) {
  const value = typeof query.search === "string" ? query.search : query.q;
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

export function optionalTenantStatus(value: unknown) {
  return optionalEnum(value, Object.values(TenantStatus), "Tenant.status");
}

export function optionalPlanStatus(value: unknown) {
  return optionalEnum(value, Object.values(PlanStatus), "Plan.status");
}

export function optionalSubscriptionStatus(value: unknown) {
  return optionalEnum(value, Object.values(SubscriptionStatus), "TenantSubscription.status");
}

export function optionalUuidLike(value: unknown, label: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw invalidQuery(`${label} invalido.`);
  }
  return trimmed;
}

function readPositiveInteger(value: unknown, fallback: number) {
  const parsed = parseInteger(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoundedPositiveInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = parseInteger(value);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return Math.min(parsed, maximum);
}

function parseInteger(value: unknown) {
  if (typeof value === "number") return Number.isInteger(value) ? value : Number.NaN;
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return Number.NaN;
  return Number.parseInt(raw, 10);
}

function optionalEnum<T extends string>(value: unknown, allowed: T[], label: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  if (allowed.includes(trimmed as T)) return trimmed as T;
  throw invalidQuery(`${label} invalido.`);
}

function invalidQuery(message: string) {
  return new BadRequestException({
    code: "PLATFORM_QUERY_INVALID",
    message,
  });
}
