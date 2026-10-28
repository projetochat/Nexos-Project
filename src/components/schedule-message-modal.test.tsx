// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { ApiSchedule } from "@/lib/schedule-types";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  deletionImpact: vi.fn(),
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
    const displayedDate = new Date(scheduled.scheduledAt).toLocaleDateString("pt-BR");
    const displayedTime = new Date(scheduled.scheduledAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(`${displayedDate} ${displayedTime}`),
    );
    expect(document.body.textContent).not.toContain(`${displayedDate}, ${displayedTime}`);
    const chooseDate = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Escolher data e hora",
    )!;
    await React.act(async () => chooseDate.click());
    const scheduleInput = document.querySelector<HTMLInputElement>('input[type="date"]');
    expect(scheduleInput?.className).toContain("min-w-0");
    expect(scheduleInput?.className).toContain("max-w-full");
    expect(document.querySelector('[aria-label="Hora do agendamento"]')).not.toBeNull();
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
      scheduledAt: scheduled.scheduledAt,
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

it("revalidates the deletion impact and submits its snapshot token", async () => {
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
    content: "Mensagem que pode ser excluída",
    recipientIds: [],
    recipients: [],
    recurrenceDays: [],
    recurrenceLimit: "",
    recurrenceUntil: "",
    assignedMembershipId: "",
    attachmentName: null,
    attachment: null,
  };
  const impact = {
    snapshotToken: "schedule-revision-1",
    title: "Excluir mensagem agendada?",
    prompt: "Confira o impacto antes de excluir.",
    record: {
      name: "Mensagem que pode ser excluída",
      identifiers: [
        { label: "Identificador", value: "composer-1" },
        { label: "Data programada", value: "2099-10-01T15:00:00.000Z" },
        { label: "Estado", value: "PENDING" },
      ],
    },
    dependencies: [],
    consequences: [{ id: "delete", text: "O agendamento será excluído.", irreversible: true }],
    confirmation: { level: "standard" as const, confirmLabel: "Excluir" },
  };
  api.list.mockReset().mockResolvedValue([scheduled]);
  api.deletionImpact.mockReset().mockResolvedValue(impact);
  api.remove.mockReset().mockResolvedValue({ status: "deleted" });

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
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Excluir agendamento"]')).not.toBeNull(),
    );

    await React.act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="Excluir agendamento"]')!.click();
    });
    await vi.waitFor(() => expect(api.deletionImpact).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "Deseja realmente excluir esta mensagem agendada?",
      ),
    );
    const confirmationDialog = document.querySelector('[role="alertdialog"]');
    expect(confirmationDialog?.className).toContain("max-w-sm");
    expect(confirmationDialog?.className).not.toContain("max-w-xl");
    expect(document.body.textContent).not.toContain("Confira o impacto");
    expect(confirmationDialog?.textContent).not.toContain("Nome:");
    expect(confirmationDialog?.textContent).not.toContain("Identificador:");
    expect(confirmationDialog?.textContent).not.toContain("Data programada:");
    expect(confirmationDialog?.textContent).not.toContain("Estado:");

    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Excluir",
    )!;
    await React.act(async () => confirm.click());

    await vi.waitFor(() => expect(api.deletionImpact).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(api.remove).toHaveBeenCalledOnce());
    expect(api.remove).toHaveBeenCalledWith(
      scheduled.id,
      impact.snapshotToken,
      expect.any(AbortSignal),
    );
  } finally {
    await React.act(async () => root.unmount());
    queryClient.clear();
    host.remove();
  }
});

it("offers three future slots and saves the selected suggestion only after confirmation", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 28, 7, 0));
  api.list.mockResolvedValue([]);
  api.save.mockResolvedValue({});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await React.act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <ScheduleMessageModal
            open
            onClose={() => {}}
            conversationId="conversation-1"
            initialContent="Mensagem futura"
            identifier="composer-new"
          />
        </QueryClientProvider>,
      ),
    );
    const options = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Sugestões de horário"] button[aria-pressed]',
      ),
    ];
    expect(options).toHaveLength(3);
    expect(options.map((option) => option.textContent?.slice(-5))).toEqual([
      "08:00",
      "13:00",
      "08:00",
    ]);
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    await React.act(async () => options[0].click());
    expect(api.save).not.toHaveBeenCalled();
    expect(options[0].getAttribute("aria-pressed")).toBe("true");
    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Agendar",
    )!;
    await React.act(async () => confirm.click());
    expect(api.save).toHaveBeenCalledOnce();
    expect(api.save.mock.calls[0][0]).toMatchObject({
      conversationId: "conversation-1",
      origin: "CHAT",
      content: "Mensagem futura",
      scheduledAt: new Date(2026, 9, 28, 8, 0).toISOString(),
    });
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.useRealTimers();
  }
});

it("reveals independent custom date/time fields and rejects past or incomplete values", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 28, 14, 0));
  api.list.mockResolvedValue([]);
  api.save.mockResolvedValue({});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const change = async (input: HTMLInputElement, value: string) =>
    React.act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  try {
    await React.act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <ScheduleMessageModal
            open
            onClose={() => {}}
            conversationId="conversation-1"
            initialContent="Mensagem customizada"
            identifier="composer-custom"
          />
        </QueryClientProvider>,
      ),
    );
    const choose = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Escolher data e hora",
    )!;
    await React.act(async () => choose.click());
    const date = document.querySelector<HTMLInputElement>('[aria-label="Data do agendamento"]')!;
    const time = document.querySelector<HTMLInputElement>('[aria-label="Hora do agendamento"]')!;
    expect(date.type).toBe("date");
    expect(time.type).toBe("text");
    expect(time.inputMode).toBe("numeric");
    expect(time.placeholder).toBe("00:00");
    expect(date.value).toBe("2026-10-29");
    expect(time.value).toBe("08:00");
    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Agendar",
    )!;
    await change(date, "2026-10-28");
    expect(confirm.disabled).toBe(true);
    expect(document.body.textContent).toContain("Escolha um horário futuro.");
    await change(date, "2026-10-30");
    await change(time, "");
    expect(confirm.disabled).toBe(true);
    await React.act(async () => choose.click());
    expect(date.value).toBe("2026-10-30");
    expect(time.value).toBe("");
    await change(time, "25:61");
    expect(confirm.disabled).toBe(true);
    expect(document.body.textContent).toContain("Informe um horário válido entre 00:00 e 23:59.");
    await change(time, "1645");
    await React.act(async () => time.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(time.value).toBe("16:45");
    expect(confirm.disabled).toBe(false);
    await React.act(async () => confirm.click());
    expect(api.save).toHaveBeenCalledOnce();
    expect(api.save.mock.calls[0][0]).toMatchObject({
      scheduledAt: new Date(2026, 9, 30, 16, 45).toISOString(),
    });
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.useRealTimers();
  }
});
