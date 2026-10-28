import {
  TrixusApiError,
  type ApiDepartment,
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

export function formatOnboardingConnectedAt(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(date)
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
    (!isOnboardingConnectionConnected(connection.status) ||
      !(connection.ownerPhoneMasked || connection.ownerPhone))
  );
}

export function isOnboardingConnectionConnected(status: string | null | undefined) {
  return status?.trim().toLocaleLowerCase("en-US") === "connected";
}

export function hasActiveDepartmentConnection(
  departments: ApiDepartment[],
  connections: Array<
    Pick<ApiMessagingConnection, "id" | "status"> &
      Partial<Pick<ApiMessagingConnection, "providerType" | "serviceEnabled">>
  >,
) {
  const connectedIds = new Set(
    connections
      .filter(
        (connection) =>
          connection.status === "connected" &&
          (connection.providerType === undefined || connection.providerType === "evolution") &&
          connection.serviceEnabled !== false,
      )
      .map((connection) => connection.id),
  );
  return departments.some(
    (department) =>
      department.active !== false &&
      department.connectionIds.some((connectionId) => connectedIds.has(connectionId)),
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

export function onboardingAdministratorRole(roles: ApiRole[]) {
  return roles.find(
    (role) =>
      role.key === "tenant_admin" ||
      role.name.trim().toLocaleLowerCase("pt-BR") === "administrador",
  );
}

export function onboardingFavoriteDepartmentId(roles: ApiRole[]) {
  const metadata = onboardingAdministratorRole(roles)?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const favorite = (metadata as { onboardingFavoriteDepartmentId?: unknown })
    .onboardingFavoriteDepartmentId;
  return typeof favorite === "string" && favorite ? favorite : null;
}

export function buildOnboardingRoleScopeMetadata(
  connections: Array<{
    id: string;
    departments: Array<{ id: string }>;
  }>,
  favoriteDepartmentId: string | null,
) {
  const chatScopes = connections.flatMap((connection) => {
    const departmentIds = [...new Set(connection.departments.map((department) => department.id))];
    if (departmentIds.length === 0) return [];
    return [
      {
        connectionId: connection.id,
        departmentIds,
        favoriteDepartmentId:
          favoriteDepartmentId && departmentIds.includes(favoriteDepartmentId)
            ? favoriteDepartmentId
            : null,
      },
    ];
  });
  return {
    onboardingDefaultsVersion: 1,
    connectionIds: chatScopes.map((scope) => scope.connectionId),
    departmentIds: [...new Set(chatScopes.flatMap((scope) => scope.departmentIds))],
    chatScopes,
  };
}

export function onboardingScopeNeedsSync(
  metadata: unknown,
  expected: ReturnType<typeof buildOnboardingRoleScopeMetadata>,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return true;
  const current = metadata as Record<string, unknown>;
  return (
    JSON.stringify(current.connectionIds) !== JSON.stringify(expected.connectionIds) ||
    JSON.stringify(current.departmentIds) !== JSON.stringify(expected.departmentIds) ||
    JSON.stringify(current.chatScopes) !== JSON.stringify(expected.chatScopes)
  );
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
