// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const resumeRealtime = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime/client", () => ({
  resumeRealtimeAfterOnboarding: resumeRealtime,
}));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  status: vi.fn(),
  qr: vi.fn(),
  qrStatus: vi.fn(),
  onboarding: vi.fn(),
}));
vi.mock("@/lib/trixus-api", async (original) => ({
  ...(await original<typeof import("@/lib/trixus-api")>()),
  connectionsApi: { list: api.list, status: api.status, qr: api.qr, qrStatus: api.qrStatus },
  onboardingApi: { status: api.onboarding },
}));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: "admin", empresaId: "synthetic-tenant", id: "synthetic-user" } }),
  signOut: vi.fn(),
}));
import { TenantOnboardingBoundary } from "./tenant-onboarding-boundary";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const image = "data:image/png;base64,c3ludGhldGlj";
const connection = {
  id: "isolated-connection",
  name: "Synthetic instance",
  status: "connecting",
  providerType: "evolution",
  updatedAt: "invalid-date",
  ownerPhone: null,
};
const onboarding = {
  required: true,
  status: "pending",
  canManage: true,
  version: 1,
  progress: { currentStep: 2, maxCompletedStep: 1, totalSteps: 8 },
  checklist: { instanceConnected: false },
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled in isolated test");
    }),
  );
  api.list.mockResolvedValue([connection]);
  api.status.mockResolvedValue(connection);
  api.onboarding.mockResolvedValue(onboarding);
  api.qr.mockResolvedValue({
    connectionId: connection.id,
    status: "connecting",
    qrCodeBase64: image,
  });
  api.qrStatus.mockResolvedValue({
    connectionId: connection.id,
    status: "connecting",
    qrCodeBase64: image,
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["trixus", "onboarding", "synthetic-tenant", "synthetic-user"], onboarding);
  client.setQueryData(["trixus", "messaging-connections"], [connection]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function renderAndOpenQr() {
  await React.act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <TenantOnboardingBoundary>
          <p>Application</p>
        </TenantOnboardingBoundary>
      </QueryClientProvider>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
  // The invalid date must not crash the full wizard render.
  expect(host.textContent).toContain("Dados da instância");
  expect(host.textContent).toContain("—");
  const next = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Avançar"),
  )!;
  expect(next.disabled).toBe(false);
  await React.act(async () => {
    next.click();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(document.querySelector('img[src="' + image + '"]')).not.toBeNull();
  return next;
}
it("keeps the wizard visible after QR expiry and allows generating another QR", async () => {
  const next = await renderAndOpenQr();
  api.qrStatus.mockResolvedValue({
    connectionId: connection.id,
    status: "connecting",
    qrCodeBase64: null,
  });
  await React.act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  expect(document.querySelector('img[src="' + image + '"]')).toBeNull();
  expect(host.textContent).toContain("O QR Code não está mais disponível");
  expect(host.textContent).toContain("Dados da instância");
  expect(next.disabled).toBe(false);
  await React.act(async () => {
    next.click();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(api.qr).toHaveBeenCalledTimes(2);
});
it("keeps owner mismatch refused and removes its obsolete QR", async () => {
  const next = await renderAndOpenQr();
  api.qrStatus.mockResolvedValue({
    connectionId: connection.id,
    status: "error",
    qrCodeBase64: null,
    errorCode: "OWNER_PHONE_MISMATCH",
  });
  await React.act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  expect(document.querySelector('img[src="' + image + '"]')).toBeNull();
  expect(host.textContent).toContain("Número diferente recusado");
  expect(host.textContent).not.toContain("Instância conectada com sucesso");
  expect(next.disabled).toBe(false);
});
it("continues waiting when asynchronous QR generation has not returned an image yet", async () => {
  api.qr.mockResolvedValue({
    connectionId: connection.id,
    status: "connecting",
    qrCodeBase64: null,
  });
  api.qrStatus.mockResolvedValue({
    connectionId: connection.id,
    status: "connecting",
    qrCodeBase64: null,
  });
  await React.act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <TenantOnboardingBoundary>
          <p>Application</p>
        </TenantOnboardingBoundary>
      </QueryClientProvider>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
  const next = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Avançar"),
  )!;
  await React.act(async () => {
    next.click();
    await vi.advanceTimersByTimeAsync(2_000);
  });
  expect(document.body.textContent).toContain("Gerando um novo QR Code");
  expect(host.textContent).not.toContain("O QR Code não está mais disponível");
});

it("resumes onboarding-blocked realtime only after server-confirmed completion", async () => {
  await renderAndOpenQr();
  expect(resumeRealtime).not.toHaveBeenCalled();
  const completed = { ...onboarding, required: false, status: "completed" };
  api.onboarding.mockResolvedValue(completed);
  await React.act(async () => {
    client.setQueryData(["trixus", "onboarding", "synthetic-tenant", "synthetic-user"], completed);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(host.textContent).toContain("Application");
  expect(resumeRealtime).toHaveBeenCalledTimes(1);
  await React.act(async () => {
    client.setQueryData(["trixus", "onboarding", "synthetic-tenant", "synthetic-user"], {
      ...completed,
    });
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(resumeRealtime).toHaveBeenCalledTimes(1);
});
