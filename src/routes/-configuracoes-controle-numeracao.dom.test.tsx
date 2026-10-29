// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiProtocolSettings } from "@/lib/trixus-api";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock("@/lib/trixus-api", () => ({
  organizationApi: { protocolSettings: api.load, updateProtocolSettings: api.save },
}));
vi.mock("@/components/modal", () => ({ ConfirmDialog: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { Route } from "./configuracoes.controle-numeracao";

let host: HTMLDivElement;
let root: Root;
const initial = (
  module: ApiProtocolSettings["module"],
  preview = "2026.000030",
): ApiProtocolSettings => ({
  module,
  format: "YEAR_SEQUENCE",
  digits: 3,
  reset: "YEARLY",
  customPattern: null,
  preview,
});
const field = (section: Element, text: string) => {
  const label = [...section.querySelectorAll("label")].find(
    (el) => el.firstElementChild?.textContent === text,
  );
  if (!label) throw new Error(`Missing field ${text}`);
  return label;
};
async function change(element: HTMLSelectElement | HTMLInputElement, value: string) {
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function mount(items = [initial("CHAT"), initial("TICKET", "2026.001000")]) {
  api.load.mockResolvedValue(items);
  api.save.mockImplementation(async (payload) => ({ ...payload, preview: "2026.030" }));
  const Component = (
    Route as unknown as {
      component: React.ComponentType & { preload?: () => Promise<unknown> };
    }
  ).component;
  await Component.preload?.();
  await act(async () => root.render(<Component />));
  return [...host.querySelectorAll("section")];
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NETWORK_BLOCKED");
    }),
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Controle de numeração · interação isolada", () => {
  it("mantém Personalizado por último nos dois módulos e preserva sequenciais 30 e 1000 com três dígitos mínimos", async () => {
    const sections = await mount();
    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(
        [...section.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(
          (input) => input.value,
        ),
      ).toEqual(["SEQUENCE", "YEAR_SEQUENCE", "YEAR_MONTH_SEQUENCE", "DATE_SEQUENCE", "CUSTOM"]);
    }
    expect(
      field(sections[0], "Visualização do próximo protocolo").querySelector("input")!.value,
    ).toBe("2026.030");
    expect(
      field(sections[1], "Visualização do próximo protocolo").querySelector("input")!.value,
    ).toBe("2026.1000");
  });

  it("seleciona reset diário bloqueado para Data, normaliza Personalizado e salva o estado exibido", async () => {
    const [chat] = await mount();
    await act(async () =>
      chat.querySelector<HTMLInputElement>('input[value="DATE_SEQUENCE"]')!.click(),
    );
    let reset = field(chat, "Resetar número sequencial").querySelector("select")!;
    expect(reset.value).toBe("DAILY");
    expect(reset.disabled).toBe(true);
    expect(field(chat, "Visualização do próximo protocolo").querySelector("input")!.value).toBe(
      "20261028.030",
    );
    await act(async () => chat.querySelector<HTMLInputElement>('input[value="CUSTOM"]')!.click());
    reset = field(chat, "Resetar número sequencial").querySelector("select")!;
    expect(reset.value).toBe("NEVER");
    expect(reset.disabled).toBe(false);
    const custom = field(chat, "Padrão personalizado");
    expect(
      field(chat, "Resetar número sequencial").compareDocumentPosition(custom) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      custom.compareDocumentPosition(field(chat, "Visualização do próximo protocolo")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await change(reset, "MONTHLY");
    const displayedPreview = field(chat, "Visualização do próximo protocolo").querySelector(
      "input",
    )!.value;
    expect(displayedPreview).toBe("CHAT.2026.030");
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Salvar configurações"))!
        .click(),
    );
    expect(api.save).toHaveBeenCalledExactlyOnceWith({
      module: "CHAT",
      format: "CUSTOM",
      digits: 3,
      reset: "MONTHLY",
      customPattern: null,
      confirmChange: false,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
