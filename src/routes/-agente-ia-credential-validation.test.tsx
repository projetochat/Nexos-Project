// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  updateConnection: vi.fn(),
  updateAgent: vi.fn(),
  saved: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (config: unknown) => config,
}));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null, PageContainer: () => null }));
vi.mock("@/lib/session", () => ({ useSession: () => ({}) }));
vi.mock("@/lib/trixus-api", () => ({
  aiApi: {
    updateConnection: api.updateConnection,
    updateAgent: api.updateAgent,
    providerModels: vi.fn().mockResolvedValue([]),
  },
}));
import { ConnectionEditor, AgentEditor } from "./agente-ia";
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const connection = {
  id: "synthetic-connection",
  active: true,
  provider: "OPENAI",
  name: "Conexão sintética",
  organization: null,
  apiKeyMasked: "••••test",
} as never;
const agent = {
  id: "synthetic-agent",
  active: true,
  name: "Agente sintético",
  module: "TICKETS",
  connectionId: "synthetic-connection",
  model: "synthetic-model",
  description: "",
  instructions: "Instrução sintética",
  behavior: "ATTENDANT",
} as never;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network blocked in isolated credential test");
    }),
  );
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  client.clear();
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function render(kind: "connection" | "agent") {
  await React.act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        {kind === "connection" ? (
          <ConnectionEditor
            mode="edit"
            connection={connection}
            onClose={api.close}
            onSaved={api.saved}
          />
        ) : (
          <AgentEditor
            mode="edit"
            agent={agent}
            connections={[connection]}
            onClose={api.close}
            onSaved={api.saved}
          />
        )}
      </QueryClientProvider>,
    ),
  );
}
function saveButton() {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    ["Salvar conexão", "Salvar"].includes(b.textContent?.trim() ?? ""),
  )!;
}
it("shows validation progress, retains the edited connection and marks only invalid credentials", async () => {
  let reject!: (error: unknown) => void;
  api.updateConnection.mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await render("connection");
  await React.act(async () => saveButton().click());
  expect(document.body.textContent).toContain("Validando conexão...");
  await React.act(async () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  const backdrop = document.querySelector<HTMLElement>("[data-modal-backdrop]");
  await React.act(async () => backdrop?.click());
  expect(api.close).not.toHaveBeenCalled();
  expect(api.updateConnection.mock.calls[0][1]).not.toHaveProperty("apiKey");
  await React.act(async () =>
    reject(Object.assign(new Error("Rejected"), { code: "AI_PROVIDER_CREDENTIAL_INVALID" })),
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Chave inválida ou revogada",
  );
  expect(document.querySelector('input[type="password"]')?.getAttribute("aria-invalid")).toBe(
    "true",
  );
  const alert = document.querySelector<HTMLElement>('[role="alert"]')!;
  const keyInput = document.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(alert.closest(".border-t")?.contains(saveButton())).toBe(true);
  expect(alert.parentElement).toBe(saveButton().parentElement?.parentElement);
  expect(
    alert.compareDocumentPosition(saveButton()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(keyInput.getAttribute("aria-describedby")).toBe(alert.id);

  expect(
    document.querySelector<HTMLInputElement>('input[placeholder="Ex.: OpenAI principal"]')?.value,
  ).toBe("Conexão sintética");
  expect(api.saved).not.toHaveBeenCalled();
  expect(api.close).not.toHaveBeenCalled();
});
it.each(["NETWORK_ERROR", "FORBIDDEN", "RATE_LIMITED"])(
  "keeps %s separate from invalid credentials",
  async (code) => {
    api.updateConnection.mockRejectedValue(
      Object.assign(new Error("Falha transitória sintética"), { code }),
    );
    await render("connection");
    await React.act(async () => saveButton().click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Falha transitória sintética",
    );
    expect(document.querySelector('input[type="password"]')?.getAttribute("aria-invalid")).toBe(
      "false",
    );
    expect(api.saved).not.toHaveBeenCalled();
  },
);
it("shows an agent credential error beside its connection without closing or changing its fields", async () => {
  api.updateAgent.mockRejectedValue(
    Object.assign(new Error("Rejected"), { code: "AI_PROVIDER_CREDENTIAL_INVALID" }),
  );
  await render("agent");
  await React.act(async () => saveButton().click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Confira a API Key em Conexões",
  );
  expect(document.querySelector('[aria-label="Conexão de IA"]')?.getAttribute("aria-invalid")).toBe(
    "true",
  );
  expect(api.updateAgent.mock.calls[0][1]).toMatchObject({
    name: "Agente sintético",
    connectionId: "synthetic-connection",
    model: "synthetic-model",
  });
  expect(api.saved).not.toHaveBeenCalled();
  expect(api.close).not.toHaveBeenCalled();
});

it("clears invalid credential feedback only after changing the input and saves a corrected value", async () => {
  api.updateConnection
    .mockRejectedValueOnce(
      Object.assign(new Error("Rejected"), { code: "AI_PROVIDER_CREDENTIAL_INVALID" }),
    )
    .mockResolvedValueOnce(connection);
  await render("connection");
  await React.act(async () => saveButton().click());
  const input = document.querySelector<HTMLInputElement>('input[type="password"]')!;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "synthetic-corrected-test-value",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await React.act(async () => saveButton().click());
  expect(api.saved).toHaveBeenCalledOnce();
  expect(api.updateConnection.mock.calls[1][1].apiKey).toBe("synthetic-corrected-test-value");
});
it("keeps the agent pending during validation and reports transient errors without invalidating its connection", async () => {
  let reject!: (error: unknown) => void;
  api.updateAgent.mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await render("agent");
  await React.act(async () => saveButton().click());
  expect(document.body.textContent).toContain("Validando conexão...");
  await React.act(async () =>
    reject(Object.assign(new Error("Limite temporário sintético"), { status: 429 })),
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Limite temporário sintético",
  );
  expect(document.querySelector('[aria-label="Conexão de IA"]')?.getAttribute("aria-invalid")).toBe(
    "false",
  );
});
