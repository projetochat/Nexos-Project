// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  popups: vi.fn(),
  dismiss: vi.fn(),
  complete: vi.fn(),
  enabled: true,
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/lib/session", () => ({
  useSession: (select: (s: unknown) => unknown) =>
    select({
      user: {
        id: "user",
        empresaId: "tenant",
        permissions: ["schedules.read", "schedules.update"],
      },
    }),
}));
vi.mock("@/lib/task-management", () => ({
  taskManagementApi: {
    capabilities: async () => ({ enabled: mocks.enabled }),
    popups: mocks.popups,
    dismissPopup: mocks.dismiss,
    complete: mocks.complete,
  },
}));
import { TaskAlerts } from "./task-alerts";
it.each([true, false])("does not navigate or send automatically (enabled %s)", async (enabled) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.enabled = enabled;
  mocks.popups.mockResolvedValue({
    items: [
      {
        deliveryId: "delivery",
        occurrenceId: "occurrence",
        taskId: "task",
        title: "Tarefa de teste",
        description: "Aviso interno",
        priority: "high",
        dueAt: "2026-10-30T12:00:00Z",
      },
    ],
  });
  mocks.dismiss.mockResolvedValue({ dismissed: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await React.act(async () =>
      root.render(
        <QueryClientProvider client={qc}>
          <TaskAlerts />
        </QueryClientProvider>,
      ),
    );
    await React.act(async () => {
      await new Promise((r) => setTimeout(r, 35));
    });
    if (enabled) {
      await React.act(async () => {
        await new Promise((r) => setTimeout(r, 35));
      });
      expect(host.textContent).toContain("Tarefa de teste");
      expect(host.querySelector("aside")?.className).toContain("border-l-red-500");
      expect(mocks.navigate).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
      await React.act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Dispensar lembrete"]')!.click(),
      );
      expect(mocks.dismiss).toHaveBeenCalledWith("delivery", expect.anything());
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
    } else {
      expect(host.textContent).toBe("");
      expect(mocks.popups).not.toHaveBeenCalled();
    }
  } finally {
    await React.act(async () => root.unmount());
    qc.clear();
    host.remove();
  }
});
