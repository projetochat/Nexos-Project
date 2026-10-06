// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { ApiSchedule } from "@/lib/schedule-types";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));
const realtime = vi.hoisted(() => ({
  handler: null as null | ((event: { event: string }) => void),
}));

vi.mock("@/lib/trixus-api", () => ({
  schedulesApi: api,
}));
vi.mock("@/lib/realtime/client", () => ({
  onRealtimeEvent: vi.fn((handler: (event: { event: string }) => void) => {
    realtime.handler = handler;
    return () => {
      if (realtime.handler === handler) realtime.handler = null;
    };
  }),
}));

import { ScheduleMessageModal } from "./schedule-message-modal";

afterEach(() => {
  realtime.handler = null;
  vi.clearAllMocks();
});

it("reuses the rich editor, custom variables and a saved attachment while editing", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const scheduled: ApiSchedule = {
    id: "schedule-1",
    identifier: "message-1",
    type: "message",
    title: "Mensagem agendada",
    destination: "Conversa atual",
    conversationId: "conversation-1",
    scheduledAt: "2099-10-01T15:00:00.000Z",
    recurrence: "once",
    delivery: true,
    status: "pending",
    connectionId: "connection-1",
    departmentId: "",
    content: "Mensagem salva",
    recipientIds: [],
    recipients: [],
    recurrenceDays: [],
    recurrenceLimit: "",
    recurrenceUntil: "",
    assignedMembershipId: "",
    attachmentName: "documento.pdf",
    attachment: {
      fileName: "documento.pdf",
      mimeType: "application/pdf",
      size: 12,
      dataUrl: "data:application/pdf;base64,AA==",
    },
    dueAt: "2099-10-01T15:00:00.000Z",
    executionStatus: "PENDING",
    attempts: 0,
  };
  api.list.mockResolvedValue([scheduled]);

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await React.act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <ScheduleMessageModal
            open
            onClose={() => {}}
            conversationId="conversation-1"
            initialContent="Mensagem inicial"
            identifier="composer-1"
            customFields={[{ label: "Código do cliente", variableKey: "codigo_cliente" }]}
          />
        </QueryClientProvider>,
      ),
    );
    await React.act(async () => Promise.resolve());

    expect(document.querySelector('[aria-label="Inserir emoji"]')).not.toBeNull();
    const scheduleInput = document.querySelector<HTMLInputElement>('input[type="datetime-local"]');
    expect(scheduleInput?.className).toContain("min-w-0");
    expect(scheduleInput?.className).toContain("max-w-full");
    const variables = document.querySelector<HTMLButtonElement>('[aria-label="Inserir variável"]')!;
    await React.act(async () => variables.click());
    expect(document.body.textContent).toContain("{{codigo_cliente}}");
    expect(
      document.querySelector(
        '[aria-label*="Inserir variável {{codigo_cliente}}: Campo adicional: Código do cliente."]',
      ),
    ).not.toBeNull();

    const edit = document.querySelector<HTMLButtonElement>('[aria-label="Editar agendamento"]')!;
    await React.act(async () => edit.click());
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Mensagem salva");
    expect(document.body.textContent).toContain("documento.pdf");
    expect(document.querySelector('[aria-label="Remover arquivo"]')).not.toBeNull();

    api.save.mockResolvedValue(scheduled);
    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Salvar alterações",
    )!;
    await React.act(async () => save.click());
    await vi.waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(api.save.mock.calls[0]?.[0]).toMatchObject({
      id: scheduled.id,
      attachment: scheduled.attachment,
      attachmentName: scheduled.attachmentName,
    });
    expect(api.save.mock.calls[0]?.[0]).not.toHaveProperty("dueAt");
    expect(api.save.mock.calls[0]?.[0]).not.toHaveProperty("executionStatus");
    expect(api.save.mock.calls[0]?.[0]).not.toHaveProperty("attempts");
  } finally {
    await React.act(async () => root.unmount());
    queryClient.clear();
    host.remove();
  }
});

it("refetches on schedule.updated and removes a schedule completed by another process", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const scheduled: ApiSchedule = {
    id: "schedule-1",
    identifier: "message-1",
    type: "message",
    title: "Mensagem agendada",
    destination: "Conversa atual",
    conversationId: "conversation-1",
    scheduledAt: "2099-10-01T15:00:00.000Z",
    recurrence: "once",
    delivery: true,
    status: "pending",
    connectionId: "connection-1",
    departmentId: "",
    content: "Mensagem ainda pendente",
    recipientIds: [],
    recipients: [],
    recurrenceDays: [],
    recurrenceLimit: "",
    recurrenceUntil: "",
    assignedMembershipId: "",
    attachmentName: null,
    attachment: null,
  };
  api.list
    .mockResolvedValueOnce([scheduled])
    .mockResolvedValueOnce([{ ...scheduled, status: "completed" }]);

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await React.act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <ScheduleMessageModal
            open
            onClose={() => {}}
            conversationId="conversation-1"
            initialContent=""
            identifier="composer-1"
          />
        </QueryClientProvider>,
      ),
    );
    await React.act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("Mensagem ainda pendente"),
      );
    });
    expect(api.list).toHaveBeenCalledTimes(1);

    await React.act(async () => {
      realtime.handler?.({ event: "schedule.updated" });
      await vi.waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
      await vi.waitFor(() =>
        expect(document.body.textContent).not.toContain("Mensagem ainda pendente"),
      );
    });

    expect(document.body.textContent).toContain("Nenhuma mensagem agendada para esta conversa.");
  } finally {
    await React.act(async () => root.unmount());
    queryClient.clear();
    host.remove();
  }
});
