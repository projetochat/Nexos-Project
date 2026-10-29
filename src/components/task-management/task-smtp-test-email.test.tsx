// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  verifySmtp: vi.fn(),
  updateSmtp: vi.fn(),
  createSmtp: vi.fn(),
  updateSettings: vi.fn(),
  removeSmtp: vi.fn(),
}));
vi.mock("@/lib/task-management", async (original) => ({
  ...(await original<typeof import("@/lib/task-management")>()),
  taskManagementApi: api,
}));
import { TaskSettingsPanel } from "./task-settings-panel";
import type { TaskSmtp, TaskSettings, TaskCapabilities } from "@/lib/task-management";
const reference = "00000000-0000-4000-8000-000000000001";
const accepted = {
  verified: true,
  accepted: true,
  reference,
  messageId: `<${reference}@trixus.invalid>`,
  message: "E-mail de teste aceito pelo servidor SMTP.",
  auditRecorded: true,
};
const smtp: TaskSmtp = {
  id: "smtp-synthetic",
  name: "SMTP sintético",
  host: "smtp.example.invalid",
  port: 587,
  secure: false,
  username: "synthetic",
  fromAddress: "sender@example.invalid",
  fromName: "Sintético",
  active: true,
  hasPassword: true,
  lastVerifiedAt: "2026-10-28T12:00:00Z",
  lastValidatedAt: "2026-10-28T12:00:00Z",
  validationStatus: "validated",
  lastTestAcceptedAt: "2026-10-28T12:30:00Z",
  lastTestReference: reference,
  lastTestMessageId: accepted.messageId,
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-28T12:00:00Z",
};
const settings: TaskSettings = {
  popupEnabled: true,
  bellEnabled: true,
  whatsappEnabled: false,
  emailEnabled: false,
  defaultSmtpAccountId: null,
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
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
let cleanup: () => Promise<void>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  for (const method of Object.values(api)) method.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("NETWORK_BLOCKED");
    }),
  );
});
afterEach(async () => {
  await cleanup?.();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function mount(overrides: Partial<React.ComponentProps<typeof TaskSettingsPanel>> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: 3, retryDelay: 0 },
    },
  });
  const changed = vi.fn();
  let props = {
    settings,
    smtp: [smtp],
    capabilities,
    canUpdate: true,
    canSend: true,
    onChanged: changed,
    ...overrides,
  };
  const render = async (patch: Partial<React.ComponentProps<typeof TaskSettingsPanel>> = {}) => {
    props = { ...props, ...patch };
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <TaskSettingsPanel {...props} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await wait();
    });
  };
  await render();
  cleanup = async () => {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  };
  return { host, changed, render };
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
function button(root: ParentNode, text: string) {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(found, `button ${text}`).toBeDefined();
  return found!;
}
async function click(root: ParentNode, text: string) {
  await act(async () => {
    button(root, text).click();
    await wait();
  });
}
async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

it("sends only after explicit recipient confirmation and prevents duplicate clicks while pending", async () => {
  const f = await mount();
  expect(api.verifySmtp).not.toHaveBeenCalled();
  await click(f.host, "Enviar e-mail de teste");
  expect(api.verifySmtp).not.toHaveBeenCalled();
  const input = dialog().querySelector<HTMLInputElement>('input[type="email"]')!;
  expect(input.value).toBe(smtp.fromAddress);
  await change(input, "not-an-email");
  await click(dialog(), "Enviar e-mail de teste");
  expect(api.verifySmtp).not.toHaveBeenCalled();
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("e-mail válido");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  await change(input, "recipient@example.invalid");
  let finish: (value: unknown) => void = () => undefined;
  api.verifySmtp.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const send = button(dialog(), "Enviar e-mail de teste");
  await act(async () => {
    send.click();
    send.click();
  });
  expect(api.verifySmtp).toHaveBeenCalledExactlyOnceWith(smtp.id, "recipient@example.invalid");
  expect(button(dialog(), "Enviando e-mail de teste...").disabled).toBe(true);
  expect(button(dialog(), "Cancelar").disabled).toBe(true);
  expect(input.disabled).toBe(true);
  await act(async () => finish(accepted));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(f.host.querySelector('[role="status"]')?.textContent).toContain(
    "aceito pelo servidor SMTP",
  );
  expect(f.host.querySelector('[role="status"]')?.textContent).toContain(reference);
  expect(f.host.querySelector('[role="status"]')?.textContent).toContain(accepted.messageId);
  expect(f.host.querySelector('[role="status"]')?.textContent).not.toContain("entregue");
  expect(f.changed).toHaveBeenCalledTimes(1);
});
it("does not retry an ambiguous delivery automatically, preserves the recipient and allows a new manual confirmation", async () => {
  const f = await mount();
  api.verifySmtp.mockRejectedValue(
    Object.assign(new Error("Synthetic provider body must stay hidden"), {
      code: "TASK_SMTP_TEST_OUTCOME_UNKNOWN",
      details: { reference, retryable: false },
    }),
  );
  await click(f.host, "Enviar e-mail de teste");
  await click(dialog(), "Enviar e-mail de teste");
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await wait();
    });
  expect(api.verifySmtp).toHaveBeenCalledTimes(1);
  expect(dialog().textContent).toContain("Confira a caixa de entrada antes de enviar outro teste");
  expect(dialog().textContent).toContain(reference);
  expect(dialog().textContent).not.toContain("Synthetic provider body");
  expect(dialog().querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe(
    smtp.fromAddress,
  );
  api.verifySmtp.mockResolvedValue(accepted);
  await click(dialog(), "Enviar novo e-mail de teste");
  expect(api.verifySmtp).toHaveBeenCalledTimes(2);
});
it("treats a network failure or an old authentication-only response as unconfirmed rather than claiming delivery", async () => {
  const f = await mount();
  api.verifySmtp.mockRejectedValue(Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" }));
  await click(f.host, "Enviar e-mail de teste");
  await click(dialog(), "Enviar e-mail de teste");
  expect(dialog().textContent).toContain("Não foi possível confirmar");
  expect(api.verifySmtp).toHaveBeenCalledTimes(1);
  api.verifySmtp.mockResolvedValue({ verified: true });
  await click(dialog(), "Enviar novo e-mail de teste");
  expect(dialog().textContent).toContain("Não foi possível confirmar");
  expect(f.host.querySelector('[role="status"]')).toBeNull();
});
it("validates an active account on save without sending mail and keeps failed edits and the footer error", async () => {
  const f = await mount();
  await click(f.host, "Editar");
  const card = [...f.host.querySelectorAll("h3")].find(
    (item) => item.textContent === "Editar conta SMTP",
  )!.parentElement!;
  const hostField = [...card.querySelectorAll("label")]
    .find((label) => label.firstElementChild?.textContent === "Host SMTP *")!
    .querySelector("input")!;
  await change(hostField, "changed.example.invalid");
  expect(card.textContent).toContain("Alterações ainda não validadas");
  expect(card.textContent).not.toContain("E-mail de teste aceito pelo servidor");
  expect(button(f.host, "Enviar e-mail de teste").disabled).toBe(true);
  let fail: (reason: unknown) => void = () => undefined;
  api.updateSmtp.mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  const save = button(card, "Salvar e validar conexão");
  await act(async () => {
    save.click();
    save.click();
  });
  expect(api.updateSmtp).toHaveBeenCalledTimes(1);
  await act(async () => {
    await wait();
  });
  expect(button(card, "Validando conexão...").disabled).toBe(true);
  expect(api.verifySmtp).not.toHaveBeenCalled();
  await act(async () => fail(new Error("Não foi possível autenticar com o servidor SMTP.")));
  await act(async () => {
    await wait();
  });
  expect((hostField as HTMLInputElement).value).toBe("changed.example.invalid");
  const error = card.querySelector('[role="alert"]')!;
  expect(error.textContent).toContain("Não foi possível autenticar");
  expect(
    error.compareDocumentPosition(button(card, "Salvar e validar conexão")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(api.verifySmtp).not.toHaveBeenCalled();
});
it("shows separate validated and accepted-mail indicators and invalidates the old mail indication after changed configuration is saved", async () => {
  const f = await mount();
  expect(f.host.textContent).toContain("Conexão validada");
  expect(f.host.textContent).toContain("E-mail de teste aceito pelo servidor");
  const updated = {
    ...smtp,
    host: "changed.example.invalid",
    lastTestAcceptedAt: null,
    lastTestReference: null,
    lastTestMessageId: null,
    lastValidatedAt: "2026-10-28T13:00:00Z",
  };
  api.updateSmtp.mockResolvedValue(updated);
  await click(f.host, "Editar");
  await click(f.host, "Salvar e validar conexão");
  expect(api.verifySmtp).not.toHaveBeenCalled();
  await f.render({ smtp: [updated] });
  expect(f.host.textContent).toContain("Conexão validada");
  expect(f.host.textContent).not.toContain("E-mail de teste aceito pelo servidor");
});
it("saves inactive drafts without test mail and respects permissions and account activity", async () => {
  const f = await mount({
    smtp: [{ ...smtp, active: false, validationStatus: "unvalidated", lastValidatedAt: null }],
    canSend: false,
  });
  expect(button(f.host, "Enviar e-mail de teste").disabled).toBe(true);
  await click(f.host, "Editar");
  api.updateSmtp.mockResolvedValue({
    ...smtp,
    active: false,
    validationStatus: "unvalidated",
    lastValidatedAt: null,
  });
  await click(f.host, "Salvar rascunho");
  expect(api.updateSmtp).toHaveBeenCalledWith(smtp.id, expect.objectContaining({ active: false }));
  expect(api.verifySmtp).not.toHaveBeenCalled();
  expect(f.host.textContent).toContain("Rascunho inativo");
  await f.render({ canUpdate: false });
  expect(
    [...f.host.querySelectorAll("button")].some(
      (item) => item.textContent?.trim() === "Enviar e-mail de teste",
    ),
  ).toBe(false);
});

it("reports acceptance without validating the new configuration when it changed during the test", async () => {
  const f = await mount();
  api.verifySmtp.mockResolvedValue({ ...accepted, configurationUnchanged: false });
  await click(f.host, "Enviar e-mail de teste");
  await click(dialog(), "Enviar e-mail de teste");
  const result = f.host.querySelector('[role="status"]')?.textContent;
  expect(result).toContain("aceito pelo servidor SMTP");
  expect(result).toContain(
    "A configuração mudou durante o teste; valide os dados atuais novamente.",
  );
  expect(result).not.toContain("Conexão validada");
});
