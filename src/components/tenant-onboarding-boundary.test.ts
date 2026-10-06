import { describe, expect, it } from "vitest";

import {
  ONBOARDING_INSTANCE_IDEMPOTENCY_KEY,
  canAdvanceOnboardingStep,
  isOnboardingInstanceNotFound,
} from "@/lib/onboarding";
import { TrixusApiError, type ApiTenantOnboardingStatus } from "@/lib/trixus-api";

function status(
  checklist: Partial<ApiTenantOnboardingStatus["checklist"]> = {},
): ApiTenantOnboardingStatus {
  return {
    required: true,
    status: "pending",
    progress: { currentStep: 1, maxCompletedStep: 0, totalSteps: 8 },
    version: 1,
    canManage: true,
    message: null,
    checklist: {
      instanceConnected: false,
      activeDepartment: false,
      administratorProfile: false,
      activeAdministrator: false,
      quickRepliesReviewed: false,
      tagsReviewed: false,
      ...checklist,
    },
  };
}

describe("onboarding step requirements", () => {
  it("requires server-confirmed records in mandatory steps", () => {
    expect(canAdvanceOnboardingStep(2, status())).toBe(false);
    expect(canAdvanceOnboardingStep(2, status({ instanceConnected: true }))).toBe(true);
    expect(canAdvanceOnboardingStep(3, status({ activeDepartment: true }))).toBe(true);
    expect(canAdvanceOnboardingStep(4, status({ administratorProfile: true }))).toBe(true);
    expect(canAdvanceOnboardingStep(5, status({ activeAdministrator: true }))).toBe(true);
  });

  it("allows review steps with zero quick replies or tags", () => {
    expect(canAdvanceOnboardingStep(6, status())).toBe(true);
    expect(canAdvanceOnboardingStep(7, status())).toBe(true);
  });

  it("recognizes an orphaned provider instance and keeps a stable retry key", () => {
    expect(
      isOnboardingInstanceNotFound(
        new TrixusApiError("Instância ausente", 400, "INSTANCE_NOT_FOUND"),
      ),
    ).toBe(true);
    expect(isOnboardingInstanceNotFound(new Error("INSTANCE_NOT_FOUND: ausente"))).toBe(true);
    expect(isOnboardingInstanceNotFound(new Error("timeout"))).toBe(false);
    expect(ONBOARDING_INSTANCE_IDEMPOTENCY_KEY).toBe("onboarding-instance");
  });
});
