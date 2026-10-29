// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: {
    id: "user",
    empresaId: "tenant",
    permissions: [
      "schedules.read",
      "schedules.create",
      "schedules.update",
      "schedules.delete",
      "messages.send",
    ],
  },
  capabilities: vi.fn(),
  options: vi.fn(),
  filterFields: vi.fn(),
  list: vi.fn(),
  summary: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  duplicate: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  remove: vi.fn(),
  complete: vi.fn(),
  recurrencePreview: vi.fn(),
  audiencePreview: vi.fn(),
  settings: vi.fn(),
  updateSettings: vi.fn(),
  smtp: vi.fn(),
  createSmtp: vi.fn(),
  updateSmtp: vi.fn(),
  removeSmtp: vi.fn(),
  verifySmtp: vi.fn(),
  occurrences: vi.fn(),
  history: vi.fn(),
  materialize: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({ user: mocks.user }),
}));
vi.mock("@/lib/task-management", async (original) => ({
  ...(await original<typeof import("@/lib/task-management")>()),
  taskManagementApi: mocks,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { GreetingMessageEditor } from "@/components/greeting-message-editor";
import { TaskManagementPage } from "./task-management-page";
import { TaskWizard } from "./task-wizard";
import { TaskSettingsPanel } from "./task-settings-panel";
import type {
  ManagedTask,
  TaskOptions,
  TaskSettings,
  TaskCapabilities,
  TaskSmtp,
} from "@/lib/task-management";
const options: TaskOptions = {
  memberships: [{ id: "member", name: "Responsável sintético" }],
  contacts: [{ id: "contact", name: "Contato sintético" }],
  groups: [{ id: "group", name: "Grupo sintético", connectionId: "connection" }],
  connections: [{ id: "connection", name: "Instância sintética", status: "connected" }],
  customers: [],
  tags: [],
  timezone: "America/Sao_Paulo",
};
const settings: TaskSettings = {
  whatsappEnabled: false,
  emailEnabled: false,
  defaultSmtpAccountId: null,
  popupEnabled: true,
  bellEnabled: true,
  defaultLeadMinutes: 0,
  timezone: "America/Sao_Paulo",
};
const capabilities: TaskCapabilities = {
  enabled: true,
  workerEnabled: false,
  smtpConfigured: true,
  channels: ["popup", "bell", "whatsapp", "email"],
  attachmentsEnabled: false,
};
const smtp: TaskSmtp = {
  id: "smtp",
  name: "Conta sintética",
  host: "smtp.invalid",
  port: 587,
  secure: false,
  username: "synthetic",
  fromAddress: "synthetic@example.invalid",
  fromName: "Sintético",
  active: true,
  hasPassword: true,
  lastVerifiedAt: null,
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-01T12:00:00Z",
};
const task: ManagedTask = {
  id: "task",
  tenantId: "tenant",
  version: 1,
  title: "Tarefa sintética",
  description: "Descrição",
  type: "task",
  assignedMembershipId: "member",
  assignedName: "Responsável sintético",
  priority: "medium",
  status: "active",
  recurrence: {
    frequency: "weekly",
    interval: 1,
    weekdays: [1, 3],
    monthDays: [],
    startAt: "2026-10-01T12:00:23.456Z",
    timezone: "America/Sao_Paulo",
  },
  audience: { mode: "contacts", selection: "fixed", contactIds: [], groupIds: [], conditions: [] },
  channels: {
    popup: false,
    bell: false,
    whatsapp: { enabled: false, connectionId: "", message: "", leadMinutes: 0 },
    email: { enabled: false, smtpAccountId: "", subject: "", body: "", leadMinutes: 0 },
  },
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-01T12:00:00Z",
  nextDueAt: "2026-10-30T12:00:00Z",
  nextOccurrenceId: "occurrence",
};
let host: HTMLDivElement, root: Root, client: QueryClient;
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
async function render(element: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{element}</QueryClientProvider>),
  );
  for (let index = 0; index < 4; index++)
    await act(async () => {
      await wait();
    });
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button, `button ${text}`).toBeDefined();
  await act(async () => {
    button!.click();
    await wait();
  });
}
async function change(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("NETWORK_BLOCKED");
    }),
  );
  for (const value of Object.values(mocks)) if (typeof value === "function") value.mockReset();
  mocks.user = {
    id: "user",
    empresaId: "tenant",
    permissions: [
      "schedules.read",
      "schedules.create",
      "schedules.update",
      "schedules.delete",
      "messages.send",
    ],
  };
  mocks.capabilities.mockResolvedValue(capabilities);
  mocks.options.mockResolvedValue(options);
  mocks.filterFields.mockResolvedValue({
    native: [
      { key: "name", label: "Nome", type: "text" },
      { key: "age", label: "Número", type: "number" },
    ],
    custom: [],
  });
  mocks.settings.mockResolvedValue(settings);
  mocks.smtp.mockResolvedValue([smtp]);
  mocks.list.mockResolvedValue({ items: [task], total: 1, page: 1, pageSize: 25, totalPages: 1 });
  mocks.summary.mockResolvedValue({
    active: 1,
    today: 0,
    paused: 0,
    total: 1,
    pending: 1,
    inProgress: 0,
    overdue: 0,
    completed: 0,
    recurring: 1,
    byStatus: [],
    byPriority: [],
    upcoming: [],
    overdueTasks: [],
  });
  mocks.get.mockResolvedValue(task);
  mocks.create.mockResolvedValue({ ...task, title: "Nova tarefa" });
  mocks.update.mockResolvedValue(task);
  mocks.updateSmtp.mockResolvedValue(smtp);
  mocks.occurrences.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 100,
    totalPages: 1,
  });
  mocks.history.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 });
  mocks.recurrencePreview.mockResolvedValue({ dates: ["2026-10-30T12:00:00Z"] });
  mocks.audiencePreview.mockResolvedValue({
    contactCount: 1,
    groupCount: 0,
    total: 1,
    sample: [{ id: "contact", name: "Contato sintético", kind: "contact" }],
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("fails closed with the capability off and does not request task data or expose write actions", async () => {
  mocks.capabilities.mockResolvedValue({ ...capabilities, enabled: false });
  await render(<TaskManagementPage />);
  expect(host.textContent).toContain("aguardando ativação");
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.options).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Novo agendamento");
});
it("does not call even capabilities without the schedules.read permission", async () => {
  mocks.user.permissions = [];
  await render(<TaskManagementPage />);
  expect(host.textContent).toContain("Acesso não permitido");
  expect(mocks.capabilities).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
it("keeps readers able to inspect records, calendar and settings without mutation controls or implicit materialization", async () => {
  mocks.user.permissions = ["schedules.read"];
  await render(<TaskManagementPage />);
  expect(host.textContent).toContain(task.title);
  for (const text of ["Novo agendamento", "Editar", "Duplicar", "Excluir", "Concluir ocorrência"])
    expect([...host.querySelectorAll("button")].some((button) => button.textContent === text)).toBe(
      false,
    );
  await click("Calendário");
  expect(mocks.occurrences).toHaveBeenCalled();
  expect(mocks.materialize).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Preparar ocorrências deste período");
  await click("Configurações");
  expect(
    [...host.querySelectorAll("input,select")].every((input) => input.matches(":disabled")),
  ).toBe(true);
  expect(mocks.verifySmtp).not.toHaveBeenCalled();
});
it("creates from the four-step wizard with explicit audience, recurrence and channel opt-in only on final save", async () => {
  const saved = vi.fn();
  await render(
    <TaskWizard
      options={options}
      fields={{ native: [{ key: "name", label: "Nome", type: "text" }], custom: [] }}
      smtp={[smtp]}
      settings={settings}
      capabilities={capabilities}
      canSend
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  await change(
    host.querySelector<HTMLInputElement>('input[aria-label="Título do agendamento"]')!,
    "Nova tarefa",
  );
  await change(
    host.querySelector<HTMLSelectElement>('select[aria-label="Responsável"]')!,
    "member",
  );
  await click("Avançar");
  expect(mocks.create).not.toHaveBeenCalled();
  await click("Seleção por filtros");
  await click("Adicionar condição");
  const valueLabel = [...host.querySelectorAll("label")].find(
    (label) => label.firstElementChild?.textContent === "Valor",
  )!;
  await change(valueLabel.querySelector("input")!, "Cliente");
  await click("Atualizar prévia");
  expect(mocks.audiencePreview).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "filters",
      conditions: [{ field: "name", operator: "contains", value: "Cliente" }],
    }),
    undefined,
  );
  await click("Avançar");
  await click("Semanal");
  await click("Atualizar prévia das datas");
  expect(mocks.recurrencePreview).toHaveBeenCalledWith(
    expect.objectContaining({ frequency: "weekly", timezone: "America/Sao_Paulo" }),
  );
  await click("Avançar");
  const checkbox = [...host.querySelectorAll("label")]
    .find((label) => label.textContent?.includes("Enviar WhatsApp"))!
    .querySelector("input")!;
  await act(async () => checkbox.click());
  const connectionLabel = [...host.querySelectorAll("label")].find(
    (label) => label.firstElementChild?.textContent === "Instância de envio",
  )!;
  await change(connectionLabel.querySelector("select")!, "connection");
  expect(connectionLabel.textContent).toContain("Conectada");
  expect(connectionLabel.textContent).not.toContain("connected");
  await change(
    host.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="Escreva o aviso de WhatsApp..."]',
    )!,
    "Aviso sintético",
  );
  expect(mocks.create).not.toHaveBeenCalled();
  expect(host.querySelector('input[type="file"]')).toBeNull();
  await click("Salvar agendamento");
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      title: "Nova tarefa",
      assignedMembershipId: "member",
      audience: expect.objectContaining({ mode: "filters" }),
      channels: expect.objectContaining({
        popup: false,
        bell: false,
        whatsapp: expect.objectContaining({
          enabled: true,
          message: "Aviso sintético",
          connectionId: "connection",
        }),
        email: expect.objectContaining({ enabled: false }),
      }),
    }),
  );
  expect(saved).toHaveBeenCalled();
});
it("preserves the exact past recurrence when editing only the description, including seconds", async () => {
  await render(
    <TaskWizard
      initial={task}
      options={options}
      fields={{ native: [], custom: [] }}
      smtp={[smtp]}
      settings={settings}
      capabilities={capabilities}
      canSend
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await change(host.querySelector("textarea")!, "Descrição alterada");
  for (let index = 0; index < 3; index++) await click("Avançar");
  await click("Salvar agendamento");
  expect(mocks.update).toHaveBeenCalledWith(
    "task",
    expect.objectContaining({
      description: "Descrição alterada",
      version: 1,
      recurrence: task.recurrence,
    }),
  );
});
it("omits the stored SMTP credential on edit and does not verify or send on save", async () => {
  await render(
    <TaskSettingsPanel
      settings={settings}
      smtp={[smtp]}
      capabilities={capabilities}
      canUpdate
      canSend
      onChanged={vi.fn()}
    />,
  );
  await click("Editar");
  const password = host.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(password.value).toBe("");
  await click("Salvar e validar conexão");
  expect(mocks.updateSmtp).toHaveBeenCalledWith(
    "smtp",
    expect.not.objectContaining({ password: expect.anything() }),
  );
  expect(mocks.verifySmtp).not.toHaveBeenCalled();
});

it("blocks an invalid or past first execution before leaving general data", async () => {
  await render(
    <TaskWizard
      options={options}
      fields={{ native: [], custom: [] }}
      smtp={[smtp]}
      settings={settings}
      capabilities={capabilities}
      canSend
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await change(
    host.querySelector<HTMLInputElement>('input[aria-label="Título do agendamento"]')!,
    "Nova tarefa",
  );
  await change(
    host.querySelector<HTMLSelectElement>('select[aria-label="Responsável"]')!,
    "member",
  );
  await change(
    host.querySelector<HTMLInputElement>('input[aria-label="Data inicial"]')!,
    "2026-10-27",
  );
  await click("Avançar");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("futuro");
  expect(host.querySelector('input[aria-label="Título do agendamento"]')).not.toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("does not infer WhatsApp from the responsible and leaves every external channel off by default", async () => {
  await render(
    <TaskWizard
      options={options}
      fields={{ native: [], custom: [] }}
      smtp={[smtp]}
      settings={settings}
      capabilities={capabilities}
      canSend={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await change(
    host.querySelector<HTMLInputElement>('input[aria-label="Título do agendamento"]')!,
    "Nova tarefa",
  );
  await change(
    host.querySelector<HTMLSelectElement>('select[aria-label="Responsável"]')!,
    "member",
  );
  for (let index = 0; index < 3; index++) await click("Avançar");
  for (const label of ["Enviar WhatsApp", "Enviar e-mail"]) {
    const checkbox = [...host.querySelectorAll("label")]
      .find((item) => item.textContent === label)!
      .querySelector<HTMLInputElement>("input")!;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(true);
  }
  expect(mocks.create).not.toHaveBeenCalled();
});

it("sends History search, responsible, channel and tenant-zone date bounds to the backend", async () => {
  await render(<TaskManagementPage />);
  await click("Histórico");
  await change(
    host.querySelector<HTMLInputElement>('input[aria-label="Buscar execuções"]')!,
    "Contato",
  );
  for (const [label, value] of [
    ["Responsável", "member"],
    ["Canal", "email"],
  ]) {
    const field = [...host.querySelectorAll("label")].find(
      (item) => item.firstElementChild?.textContent === label,
    )!;
    await change(field.querySelector("select")!, value);
  }
  for (const [label, value] of [
    ["Dt. Inicial", "2026-10-01"],
    ["Dt. Final", "2026-10-30"],
  ]) {
    const field = [...host.querySelectorAll("label")].find(
      (item) => item.firstElementChild?.textContent === label,
    )!;
    await change(field.querySelector("input")!, value);
  }
  await act(async () => {
    await wait();
  });
  expect(mocks.history).toHaveBeenLastCalledWith(
    expect.objectContaining({
      search: "Contato",
      assignedMembershipId: "member",
      channel: "email",
      start: "2026-10-01T03:00:00.000Z",
      end: "2026-10-31T02:59:59.999Z",
    }),
  );
  expect(mocks.materialize).not.toHaveBeenCalled();
});
it("persists independent global channel preferences and the default SMTP account without invoking verification", async () => {
  await render(
    <TaskSettingsPanel
      settings={settings}
      smtp={[smtp]}
      capabilities={capabilities}
      canUpdate
      canSend
      onChanged={vi.fn()}
    />,
  );
  const whatsapp = [...host.querySelectorAll("label")]
    .find((item) => item.textContent === "Permitir envios por WhatsApp")!
    .querySelector("input")!;
  await act(async () => whatsapp.click());
  const account = [...host.querySelectorAll("label")]
    .find((item) => item.firstElementChild?.textContent === "Conta SMTP padrão")!
    .querySelector("select")!;
  await change(account, "smtp");
  mocks.updateSettings.mockResolvedValue({
    ...settings,
    whatsappEnabled: true,
    defaultSmtpAccountId: "smtp",
  });
  await click("Salvar preferências");
  expect(mocks.updateSettings).toHaveBeenCalledExactlyOnceWith({
    ...settings,
    whatsappEnabled: true,
    emailEnabled: false,
    defaultSmtpAccountId: "smtp",
  });
  expect(mocks.verifySmtp).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("completes only the selected next occurrence instead of submitting a completed task series", async () => {
  mocks.complete.mockResolvedValue({ id: "occurrence", status: "completed" });
  await render(<TaskManagementPage />);
  await click("Concluir ocorrência");
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith("occurrence");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("keeps the existing variable action by default and allows task editors to hide it explicitly", async () => {
  const props = {
    value: "Texto",
    attachment: null,
    variables: [{ token: "{{name}}", description: "Nome" }],
    disabled: false,
    invalid: false,
    placeholder: "Mensagem",
    showAttachment: false,
    onChange: vi.fn(),
  };
  await render(<GreetingMessageEditor {...props} />);
  expect(host.querySelector('button[aria-label="Inserir variável"]')).not.toBeNull();
  await render(<GreetingMessageEditor {...props} showVariables={false} />);
  expect(host.querySelector('button[aria-label="Inserir variável"]')).toBeNull();
  expect(host.querySelector("textarea")?.value).toBe("Texto");
});

it("does not display a stale audience preview after conditions change while the request is in flight", async () => {
  const { TaskAudienceEditor } = await import("./task-audience-editor");
  let resolvePreview: (value: unknown) => void = () => undefined;
  mocks.audiencePreview.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
  );
  function AudienceFixture() {
    const [value, setValue] = React.useState({
      mode: "filters" as const,
      selection: "dynamic" as const,
      contactIds: [] as string[],
      groupIds: [] as string[],
      conditions: [{ field: "name", operator: "contains" as const, value: "Antes" }],
    });
    return (
      <TaskAudienceEditor
        value={value}
        onChange={(next) => setValue(next as typeof value)}
        options={options}
        fields={{ native: [{ key: "name", label: "Nome", type: "text" }], custom: [] }}
      />
    );
  }
  await render(<AudienceFixture />);
  await click("Atualizar prévia");
  const label = [...host.querySelectorAll("label")].find(
    (item) => item.firstElementChild?.textContent === "Valor",
  )!;
  await change(label.querySelector("input")!, "Depois");
  await act(async () =>
    resolvePreview({
      contactCount: 1,
      groupCount: 0,
      total: 1,
      sample: [{ id: "old", name: "Amostra antiga", kind: "contact" }],
    }),
  );
  expect(host.textContent).not.toContain("Amostra antiga");
});

it("consumes an authorized task deep-link only after opening details and permits opening the same task again", async () => {
  const consumed = vi.fn();
  function Located() {
    const [id, setId] = React.useState<string | undefined>("task");
    return (
      <>
        <button onClick={() => setId("task")}>Abrir novamente</button>
        <TaskManagementPage
          initialTaskId={id}
          onTaskLocated={() => {
            consumed();
            setId(undefined);
          }}
        />
      </>
    );
  }
  await render(<Located />);
  await act(async () => {
    await wait();
    await wait();
  });
  expect(host.textContent).toContain("Detalhes da tarefa");
  expect(consumed).toHaveBeenCalledTimes(1);
  await click("Cancelar");
  await click("Abrir novamente");
  await act(async () => {
    await wait();
    await wait();
  });
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(consumed).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Detalhes da tarefa");
});
it("consumes a denied task deep-link without opening details or retrying endlessly", async () => {
  mocks.get.mockRejectedValue(new Error("Tarefa indisponível para o seu perfil."));
  const consumed = vi.fn();
  await render(<TaskManagementPage initialTaskId="unavailable" onTaskLocated={consumed} />);
  await act(async () => {
    await wait();
    await wait();
  });
  expect(consumed).toHaveBeenCalledTimes(1);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain("Detalhes da tarefa");
  expect(host.textContent).toContain("Tarefa indisponível para o seu perfil.");
});

it("blocks external resume, SMTP verification and global activation without messages.send while allowing safe deactivation", async () => {
  mocks.user.permissions = ["schedules.read", "schedules.update"];
  mocks.list.mockResolvedValue({
    items: [
      {
        ...task,
        status: "paused",
        channels: {
          ...task.channels,
          whatsapp: {
            ...task.channels.whatsapp,
            enabled: true,
            connectionId: "connection",
            message: "Aviso",
          },
        },
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  });
  await render(<TaskManagementPage />);
  expect(
    [...host.querySelectorAll("button")].some((button) => button.textContent === "Retomar"),
  ).toBe(false);
  await click("Configurações");
  const whatsapp = [...host.querySelectorAll("label")]
    .find((item) => item.textContent === "Permitir envios por WhatsApp")!
    .querySelector<HTMLInputElement>("input")!;
  expect(whatsapp.matches(":disabled")).toBe(true);
  const verify = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Enviar e-mail de teste",
  )!;
  expect(verify.disabled).toBe(true);
  expect(mocks.verifySmtp).not.toHaveBeenCalled();
});

it("shows delivery failures in Portuguese without raw provider codes or arbitrary error text", async () => {
  mocks.history.mockResolvedValue({
    items: [
      {
        id: "failed-occurrence",
        taskId: "task",
        taskTitle: "Tarefa com falha",
        dueAt: "2026-10-28T12:00:00Z",
        status: "failed",
        completedAt: null,
        createdAt: "2026-10-28T12:00:00Z",
        executionError: "TASK_PREPARATION_FAILED",
        deliveries: [
          {
            id: "delivery",
            channel: "whatsapp",
            destination: "Contato autorizado",
            status: "failed",
            lastError: "TASK_AUTHORIZATION_OR_SCOPE_REVOKED",
            createdAt: "2026-10-28T12:00:00Z",
            sentAt: null,
          },
          {
            id: "delivery-other",
            channel: "email",
            destination: "Contato autorizado",
            status: "failed",
            lastError: "INTERNAL_PROVIDER_SECRET_OR_BODY",
            createdAt: "2026-10-28T12:00:00Z",
            sentAt: null,
          },
        ],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  });
  await render(<TaskManagementPage />);
  await click("Histórico");
  await act(async () => {
    await wait();
    await wait();
  });
  await click("Detalhes");
  expect(host.textContent).toContain("A permissão ou o acesso necessário ao envio foi revogado.");
  expect(host.textContent).toContain("Não foi possível concluir o envio.");
  expect(host.textContent).toContain("Não foi possível preparar esta execução.");
  expect(host.textContent).not.toContain("TASK_");
  expect(host.textContent).not.toContain("INTERNAL_PROVIDER_SECRET_OR_BODY");
});
