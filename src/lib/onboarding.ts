import {
  TrixusApiError,
  type ApiMessagingConnection,
  type ApiRole,
  type ApiTenantOnboardingStatus,
} from "./trixus-api";

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

export function formatOnboardingConnectedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(new Date(value))
    .replace(/,\s*/, " ");
}

export function onboardingStepAfterRefresh(
  currentStep: number,
  serverStep: number,
  followServerStep: boolean,
) {
  return followServerStep ? serverStep : currentStep;
}

export function shouldPollOnboardingConnection(connection?: ApiMessagingConnection) {
  return (
    !!connection &&
    (connection.status !== "connected" || !(connection.ownerPhoneMasked || connection.ownerPhone))
  );
}

export function onboardingRoleColorClass(role: Pick<ApiRole, "key" | "name">) {
  if (
    role.key === "tenant_admin" ||
    role.name.trim().toLocaleLowerCase("pt-BR") === "administrador"
  )
    return "text-slate-950";
  if (role.key === "supervisor" || role.name.trim().toLocaleLowerCase("pt-BR") === "supervisor")
    return "text-blue-600";
  return "text-emerald-600";
}

export function buildOnboardingAttendantPayload(form: {
  name: string;
  email: string;
  password: string;
  roleId: string;
  avatarUrl?: string;
}) {
  return {
    name: form.name.trim(),
    email: form.email.trim().toLocaleLowerCase("en-US"),
    password: form.password,
    roleId: form.roleId,
    avatarUrl: form.avatarUrl ?? null,
  };
}
