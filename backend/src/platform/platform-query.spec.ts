import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  optionalPlanStatus,
  optionalSubscriptionStatus,
  optionalTenantStatus,
  optionalUuidLike,
  platformPagination,
  trimmedSearch,
} from "./platform-query";

describe("platform query helpers", () => {
  it("parses numeric strings into Prisma-safe pagination numbers", () => {
    expect(platformPagination({ page: "2", pageSize: "20" })).toEqual({
      page: 2,
      pageSize: 20,
      skip: 20,
    });
  });

  it("falls back for absent, empty and non-finite pagination values", () => {
    expect(platformPagination({})).toMatchObject({ page: 1, pageSize: 20, skip: 0 });
    expect(platformPagination({ page: "", pageSize: " " })).toMatchObject({
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(platformPagination({ page: "Infinity", pageSize: "NaN" })).toMatchObject({
      page: 1,
      pageSize: 20,
      skip: 0,
    });
  });

  it("bounds page size", () => {
    expect(platformPagination({ page: "1", pageSize: "1000" })).toMatchObject({
      page: 1,
      pageSize: 100,
      skip: 0,
    });
  });

  it("normalizes search aliases", () => {
    expect(trimmedSearch({ q: "  acme  " })).toBe("acme");
    expect(trimmedSearch({ search: "  professional  " })).toBe("professional");
    expect(trimmedSearch({ q: " " })).toBeUndefined();
  });

  it("accepts supported enum filters and rejects unknown ones canonically", () => {
    expect(optionalTenantStatus("ACTIVE")).toBe("ACTIVE");
    expect(optionalPlanStatus("ARCHIVED")).toBe("ARCHIVED");
    expect(optionalSubscriptionStatus("TRIALING")).toBe("TRIALING");
    expect(() => optionalTenantStatus("BROKEN")).toThrow(BadRequestException);
  });

  it("accepts uuid filters and rejects malformed identifiers", () => {
    expect(optionalUuidLike("00000000-0000-4000-8000-000000000000", "tenantId")).toBe(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(optionalUuidLike("", "tenantId")).toBeUndefined();
    expect(() => optionalUuidLike("not-a-uuid", "tenantId")).toThrow(BadRequestException);
  });
});
