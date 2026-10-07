import { describe, expect, it, vi } from "vitest";

import { createOnboardingConnectionWithQr } from "@/components/tenant-onboarding-boundary";

import {
  ONBOARDING_INSTANCE_IDEMPOTENCY_KEY,
  canAdvanceOnboardingStep,
  isOnboardingInstanceNotFound,
} from "@/lib/onboarding";
import {
  TrixusApiError,
  apiErrorMessageWithRequestId,
  type ApiTenantOnboardingStatus,
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
});
