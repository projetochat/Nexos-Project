// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

const bulkClose = vi.hoisted(() => vi.fn());
const bulkOptions = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trixus-api", () => ({
  conversationApi: { bulkClose, bulkOptions },
}));
import { BulkCloseConversationsModal } from "./bulk-close-conversations-modal";

it("restores Todos, inline counters and submits all selected queues together", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  bulkClose.mockResolvedValue({ closed: 10, succeeded: Array(10).fill("id"), failed: [] });
  bulkOptions.mockResolvedValue({
    counts: { ativas: 4, standby: 5, fila: 10, leads: 5 },
    departments: [],
    agents: [],
  });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <BulkCloseConversationsModal onClose={onClose} onSuccess={onSuccess} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await vi.waitFor(() => expect(document.body.textContent).toContain("Todos (24)"));
    });
    expect(document.body.textContent).toContain("Ativas (4)");
    expect(document.body.textContent).toContain("Stand By (5)");
    expect(document.body.textContent).toContain("Fila (10)");
    expect(document.body.textContent).toContain("Leads (5)");
    const switches = () => [...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    expect(switches()).toHaveLength(5);

    await act(async () => switches()[0].click());
    expect(switches().every((item) => item.getAttribute("aria-checked") === "true")).toBe(true);
    await act(async () => {
      await vi.waitFor(() => expect(switches().every((item) => !item.disabled)).toBe(true));
    });
    await act(async () => switches()[0].click());
    expect(switches().every((item) => item.getAttribute("aria-checked") === "false")).toBe(true);
    await act(async () => {
      await vi.waitFor(() => expect(switches().every((item) => !item.disabled)).toBe(true));
    });
    await act(async () => {
      switches()[2].click();
      switches()[4].click();
    });

    let confirm: HTMLButtonElement | undefined;
    await act(async () => {
      await vi.waitFor(() => {
        confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
          (button) => button.textContent === "Confirmar",
        );
        expect(confirm?.disabled).toBe(false);
      });
    });
    await act(async () => confirm!.click());
    expect(bulkClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("10 conversa(s)");
    expect(document.body.textContent).toContain("das abas Stand By, Leads");

    const closeConversations = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Encerrar",
    )!;
    await act(async () => closeConversations.click());
    expect(bulkClose).toHaveBeenCalledExactlyOnceWith({
      action: "close",
      source: "todos",
      tabs: ["standby", "leads"],
    });
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
