import { TrixusApiError, type ApiTenantOnboardingStatus } from "./trixus-api";

export const ONBOARDING_INSTANCE_IDEMPOTENCY_KEY = "onboarding-instance";

export function isOnboardingInstanceNotFound(error: unknown) {
  return (
    (error instanceof TrixusApiError && error.code === "INSTANCE_NOT_FOUND") ||
    (error instanceof Error && error.message.includes("INSTANCE_NOT_FOUND"))
  );
}

export function canAdvanceOnboardingStep(step: number, state: ApiTenantOnboardingStatus) {
  if (step === 2) return state.checklist.instanceConnected;
  if (step === 3) return state.checklist.activeDepartment;
  if (step === 4) return state.checklist.administratorProfile;
  if (step === 5) return state.checklist.activeAdministrator;
  return true;
}
