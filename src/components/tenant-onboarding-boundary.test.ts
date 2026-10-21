import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  ATTENDANT_DEFAULT_PERMISSIONS,
  DEFAULT_DEPARTMENTS,
  DEFAULT_QUICK_REPLIES,
  DEFAULT_TAGS,
  onboardingTagDescription,
  STEPS,
  SUPERVISOR_DEFAULT_PERMISSIONS,
} from "@/lib/tenant-onboarding-defaults";
import { createOnboardingConnectionWithQr } from "@/components/tenant-onboarding-connection";

import {
  ONBOARDING_INSTANCE_IDEMPOTENCY_KEY,
  buildOnboardingAttendantPayload,
  buildOnboardingRoleScopeMetadata,
  canAdvanceOnboardingStep,
  formatOnboardingConnectedAt,
  hasActiveDepartmentConnection,
  isOnboardingInstanceNotFound,
  isOnboardingConnectionConnected,
  onboardingAdministratorRole,
  onboardingFavoriteDepartmentId,
  onboardingStepAfterRefresh,
  onboardingRoleColorClass,
  onboardingScopeNeedsSync,
  shouldPollOnboardingConnection,
} from "@/lib/onboarding";
import {
  TrixusApiError,
  apiErrorMessageWithRequestId,
  type ApiTenantOnboardingStatus,
  type ApiMessagingConnection,
  type ApiDepartment,
  type ApiRole,
} from "@/lib/trixus-api";

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
  it("only accepts an active department linked to a connected Evolution instance", () => {
    const department = {
      id: "department-a",
      active: true,
      connectionIds: ["connection-a"],
    } as ApiDepartment;
    const connection = {
      id: "connection-a",
      status: "connected",
      providerType: "evolution",
    } as ApiMessagingConnection;

    expect(hasActiveDepartmentConnection([department], [connection])).toBe(true);
    expect(
      hasActiveDepartmentConnection([{ ...department, connectionIds: [] }], [connection]),
    ).toBe(false);
    expect(
      hasActiveDepartmentConnection([department], [{ ...connection, status: "disconnected" }]),
    ).toBe(false);
    expect(
      hasActiveDepartmentConnection([department], [{ ...connection, serviceEnabled: false }]),
    ).toBe(false);
    expect(hasActiveDepartmentConnection([{ ...department, active: false }], [connection])).toBe(
      false,
    );
  });

  it("uses the QR returned by the initial Evolution creation", async () => {
    const api = {
      createEvolution: vi.fn().mockResolvedValue({
        id: "connection-a",
        status: "connecting",
        qrCodeBase64: "initial-qr",
      }),
      qr: vi.fn(),
    };

    await expect(createOnboardingConnectionWithQr("Suporte", api as never)).resolves.toMatchObject({
      qrCodeBase64: "initial-qr",
    });
    expect(api.qr).not.toHaveBeenCalled();
  });

  it("requests a QR after persistence when the initial response has none", async () => {
    const api = {
      createEvolution: vi.fn().mockResolvedValue({
        id: "connection-a",
        status: "connecting",
        qrCodeBase64: null,
      }),
      qr: vi.fn().mockResolvedValue({ qrCodeBase64: "requested-qr" }),
    };

    await expect(createOnboardingConnectionWithQr("Suporte", api as never)).resolves.toMatchObject({
      qrCodeBase64: "requested-qr",
    });
    expect(api.qr).toHaveBeenCalledWith("connection-a");
  });

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

  it("keeps the documented default catalogs exact", () => {
    expect(DEFAULT_DEPARTMENTS.map((item) => item.name)).toEqual([
      "Atendimento",
      "Comercial",
      "Financeiro",
    ]);
    expect(DEFAULT_DEPARTMENTS.filter((item) => item.favorite).map((item) => item.name)).toEqual([
      "Atendimento",
    ]);
    expect(DEFAULT_DEPARTMENTS.map((item) => item.color)).toEqual([
      "#10B981",
      "#2563EB",
      "#EF4444",
    ]);
    expect(DEFAULT_QUICK_REPLIES.map((item) => item.shortcut)).toEqual([
      "oi",
      "horario",
      "obrigado",
      "tchau",
    ]);
    expect(DEFAULT_QUICK_REPLIES[2].content).toContain("*{{nome}}*");
    expect(DEFAULT_TAGS.map((item) => item.name)).toEqual([
      "Novo Cliente",
      "Em Atendimento",
      "Aguardando Retorno",
      "Problema Técnico",
      "Fechado",
    ]);
  });

  it("restores the exclusive department favorite from the persisted Administrator scope", () => {
    const roles = [
      {
        id: "role-admin",
        key: "tenant_admin",
        name: "Administrador",
        metadata: { onboardingFavoriteDepartmentId: "department-new" },
      },
      {
        id: "role-agent",
        key: "agent",
        name: "Atendente",
        metadata: {},
      },
    ] as ApiRole[];

    expect(onboardingAdministratorRole(roles)?.id).toBe("role-admin");
    expect(onboardingFavoriteDepartmentId(roles)).toBe("department-new");
  });

  it("builds official profile scopes with one favorite, including a newly created department", () => {
    const metadata = buildOnboardingRoleScopeMetadata(
      [
        {
          id: "connection-a",
          departments: [{ id: "department-old" }, { id: "department-new" }],
        },
        { id: "connection-b", departments: [{ id: "department-old" }] },
      ],
      "department-new",
    );

    expect(metadata.departmentIds).toEqual(["department-old", "department-new"]);
    expect(metadata.chatScopes).toEqual([
      {
        connectionId: "connection-a",
        departmentIds: ["department-old", "department-new"],
        favoriteDepartmentId: "department-new",
      },
      {
        connectionId: "connection-b",
        departmentIds: ["department-old"],
        favoriteDepartmentId: null,
      },
    ]);
    expect(onboardingScopeNeedsSync({ ...metadata }, metadata)).toBe(false);
    expect(
      onboardingScopeNeedsSync(
        {
          ...metadata,
          chatScopes: metadata.chatScopes.map((scope) => ({
            ...scope,
            favoriteDepartmentId: "department-old",
          })),
        },
        metadata,
      ),
    ).toBe(true);
  });

  it("shows Etiquetas before Mensagens Rápidas", () => {
    expect(STEPS.map((step) => step.label).slice(5, 7)).toEqual(["Etiquetas", "Mensagens Rápidas"]);
  });

  it("shows the trimmed tag description and no color fallback when it is absent", () => {
    expect(onboardingTagDescription("  Assuntos financeiros  ")).toBe("Assuntos financeiros");
    expect(onboardingTagDescription("   ")).toBeUndefined();
    expect(onboardingTagDescription(null)).toBeUndefined();
  });

  it("keeps the visible step during catalog refreshes", () => {
    expect(onboardingStepAfterRefresh(3, 7, false)).toBe(3);
    expect(onboardingStepAfterRefresh(3, 7, true)).toBe(7);
  });

  it("continues polling a connected instance until its number is identified", () => {
    const connection = { status: "connected" } as ApiMessagingConnection;
    expect(shouldPollOnboardingConnection(connection)).toBe(true);
    expect(shouldPollOnboardingConnection({ ...connection, ownerPhone: "+556281147652" })).toBe(
      false,
    );
  });

  it("recognizes the connected QR status independent of capitalization", () => {
    expect(isOnboardingConnectionConnected("connected")).toBe(true);
    expect(isOnboardingConnectionConnected("CONNECTED")).toBe(true);
    expect(isOnboardingConnectionConnected(" connecting ")).toBe(false);
  });

  it("shows the complete formatted WhatsApp number before the masked fallback", () => {
    const source = readFileSync(
      new URL("./tenant-onboarding-boundary.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "selected.ownerPhone\n                        ? formatPhoneForDisplay",
    );
    expect(source).toContain(': selected.ownerPhoneMasked || "Aguardando identificação"');
  });

  it("formats the connection date without a comma after the year", () => {
    expect(formatOnboardingConnectedAt("2026-10-08T15:53:00-03:00")).not.toContain(",");
  });

  it("uses the approved role colors in the access-profile step", () => {
    expect(onboardingRoleColorClass({ key: "tenant_admin", name: "Administrador" })).toBe(
      "text-slate-950",
    );
    expect(onboardingRoleColorClass({ key: "supervisor", name: "Supervisor" })).toBe(
      "text-blue-600",
    );
    expect(onboardingRoleColorClass({ key: "agent", name: "Atendente" })).toBe("text-emerald-600");
  });

  it("forwards the selected profile photo when creating an attendant", () => {
    expect(
      buildOnboardingAttendantPayload({
        name: "  Maria Silva  ",
        email: "  MARIA@EXAMPLE.COM  ",
        password: "secret1",
        roleId: "role-agent",
        avatarUrl: "data:image/png;base64,avatar",
      }),
    ).toMatchObject({
      name: "Maria Silva",
      email: "maria@example.com",
      avatarUrl: "data:image/png;base64,avatar",
    });
  });

  it("keeps view-all disabled for Atendente and enabled for Supervisor", () => {
    expect(ATTENDANT_DEFAULT_PERMISSIONS).not.toContain("chat.conversations.view_all_active");
    expect(SUPERVISOR_DEFAULT_PERMISSIONS).toContain("chat.conversations.view_all_active");
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

  it("shows a request id without exposing internal error details", () => {
    expect(
      apiErrorMessageWithRequestId(
        new TrixusApiError(
          "Não foi possível concluir a ação agora. Tente novamente em alguns instantes.",
          500,
          "INTERNAL_ERROR",
          undefined,
          "request-onboarding-qr",
        ),
      ),
    ).toContain("requestId: request-onboarding-qr");
  });

  it("recovers a missing external session without offering to remove the internal instance", () => {
    const source = readFileSync(
      new URL("./tenant-onboarding-boundary.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("connectionsApi.qrStatus");
    expect(source).toContain("recuperá-la sem perder o histórico");
    expect(source).not.toContain("Remover e recriar");
    expect(source).not.toContain("connectionsApi.remove(connection.id)");
  });

  it("uses the official snapshot-protected department deletion flow", () => {
    const source = readFileSync(
      new URL("./tenant-onboarding-boundary.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("<DeletionConfirmDialog");
    expect(source).toContain("organizationApi.departmentDeletionPreview(deleting.id, signal)");
    expect(source).toContain(
      "organizationApi.deleteDepartment(deleting.id, snapshotToken, signal)",
    );
    expect(source).toContain("organizationApi.roleDeletionPreview(deleting.id, signal)");
    expect(source).toContain("organizationApi.deleteRole(deleting.id, snapshotToken, signal)");
    expect(source).toContain("quickReplyApi.deletionPreview(deleting.id, signal)");
    expect(source).toContain("quickReplyApi.archive(deleting.id, snapshotToken, signal)");
    expect(source).toContain("crmApi.tagDeletionPreview(deleting.id, signal)");
    expect(source).toContain("crmApi.archiveTag(deleting.id, snapshotToken, signal)");
    expect(source).not.toContain("remove.mutate(item.id)");
    expect(source).not.toContain("mutationFn: organizationApi.deleteRole");
    expect(source).not.toContain("mutationFn: quickReplyApi.archive");
    expect(source).not.toContain("mutationFn: crmApi.archiveTag");
  });
});
