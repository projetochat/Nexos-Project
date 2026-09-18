// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const bulkClose = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trixus-api", () => ({ conversationApi: { bulkClose, list } }));
import { BulkCloseConversationsModal } from "./bulk-close-conversations-modal";

it("selects/deselects all queues and submits only the chosen queues once", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  const onClose = vi.fn();
  bulkClose.mockResolvedValue({ closed: 12 });
  list.mockResolvedValue({
    items: [],
    total: 24,
    page: 1,
    pageSize: 1,
    totalPages: 24,
    counts: { ativas: 4, standby: 5, fila: 10, leads: 5 },
  });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <BulkCloseConversationsModal onClose={onClose} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await vi.waitFor(() => expect(document.body.textContent).toContain("Todos (24)"));
    });
    expect(document.body.textContent).toContain("Ativas (4)");
    expect(document.body.textContent).toContain("Stand By (5)");
    expect(document.body.textContent).toContain("Fila (10)");
    expect(document.body.textContent).toContain("Lead (5)");
    const switches = () => [...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Confirmar",
    )!;
    expect(confirm.disabled).toBe(true);
    await act(async () => switches()[0].click());
    expect(switches().every((s) => s.getAttribute("aria-checked") === "true")).toBe(true);
    await act(async () => switches()[0].click());
    expect(switches().every((s) => s.getAttribute("aria-checked") === "false")).toBe(true);
    await act(async () => {
      switches()[2].click();
      switches()[4].click();
    });
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(bulkClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Encerrar conversas?");
    expect(document.body.textContent).toContain("10 conversa(s)");
    const closeConversations = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Encerrar",
    )!;
    await act(async () => closeConversations.click());
    expect(bulkClose).toHaveBeenCalledExactlyOnceWith(["standby", "leads"]);
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
