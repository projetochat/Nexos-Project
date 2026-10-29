// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CampaignSchedulePicker } from "./campaign-schedule-picker";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(2026, 9, 28, 7, 0));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("NETWORK_BLOCKED");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(value = "", disabled = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn(),
    validity = vi.fn();
  function Fixture() {
    const [current, setCurrent] = React.useState(value);
    return (
      <>
        <CampaignSchedulePicker
          value={current}
          disabled={disabled}
          onChange={(next) => {
            changed(next);
            setCurrent(next);
          }}
          onValidityChange={validity}
        />
        <output>{current}</output>
      </>
    );
  }
  await act(async () => root.render(<Fixture />));
  return {
    host,
    changed,
    validity,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
async function input(host: HTMLElement, label: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return element;
}

it("offers three future local slots in a two-column group plus custom and clears back to draft", async () => {
  const f = await mount();
  try {
    const group = f.host.querySelector('[role="group"]')!;
    expect(group.classList.contains("grid-cols-2")).toBe(true);
    const buttons = group.querySelectorAll("button");
    expect(buttons).toHaveLength(4);
    expect([...buttons].slice(0, 3).map((button) => button.textContent?.slice(-5))).toEqual([
      "08:00",
      "13:00",
      "08:00",
    ]);
    expect(buttons[3].textContent).toContain("Escolher data e hora");
    await act(async () => buttons[0].click());
    expect(f.changed).toHaveBeenLastCalledWith("2026-10-28T08:00");
    expect(f.validity).toHaveBeenLastCalledWith(true);
    await act(async () =>
      [...f.host.querySelectorAll("button")]
        .find((button) => button.textContent === "Limpar")!
        .click(),
    );
    expect(f.changed).toHaveBeenLastCalledWith("");
    expect(f.host.textContent).toContain("Sem data: rascunho.");
    expect(f.validity).toHaveBeenLastCalledWith(true);
    await act(async () => buttons[3].click());
    expect(f.changed).toHaveBeenLastCalledWith("2026-10-28T08:00");
    expect(
      f.host.querySelector<HTMLInputElement>('input[aria-label="Data do agendamento"]')?.value,
    ).toBe("2026-10-28");
    expect(
      f.host.querySelector<HTMLInputElement>('input[aria-label="Hora do agendamento"]')?.value,
    ).toBe("08:00");
  } finally {
    await f.close();
  }
});

it("keeps date and text time on one row and emits invalid edits instead of retaining an earlier valid time", async () => {
  const f = await mount("2026-10-28T08:00");
  try {
    const date = f.host.querySelector('input[type="date"]')!;
    const time = f.host.querySelector<HTMLInputElement>('input[aria-label="Hora do agendamento"]')!;
    expect(time.type).toBe("text");
    expect(time.inputMode).toBe("numeric");
    expect(date.closest(".grid-cols-2")).toBe(time.closest(".grid-cols-2"));
    expect(date.closest(".grid-cols-2")).not.toBeNull();
    await input(f.host, "Hora do agendamento", "xx25a:99");
    expect(time.value).toBe("25:99");
    expect(f.changed).toHaveBeenLastCalledWith("2026-10-28T25:99");
    expect(f.validity).toHaveBeenLastCalledWith(false);
    expect(time.getAttribute("aria-invalid")).toBe("true");
    await input(f.host, "Hora do agendamento", "930");
    expect(f.changed).toHaveBeenLastCalledWith("2026-10-28T930");
    expect(f.validity).toHaveBeenLastCalledWith(false);
    await act(async () => time.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(time.value).toBe("09:30");
    expect(f.changed).toHaveBeenLastCalledWith("2026-10-28T09:30");
    expect(f.validity).toHaveBeenLastCalledWith(true);
    await input(f.host, "Data do agendamento", "");
    expect(f.changed).toHaveBeenLastCalledWith("T09:30");
    expect(f.validity).toHaveBeenLastCalledWith(false);
  } finally {
    await f.close();
  }
});

it("revalidates time every 30 seconds, rejects stale suggestions and removes the timer on unmount", async () => {
  vi.setSystemTime(new Date(2026, 9, 28, 7, 59, 50));
  const f = await mount();
  expect(vi.getTimerCount()).toBe(1);
  const stale = f.host.querySelector<HTMLButtonElement>('[role="group"] button')!;
  vi.setSystemTime(new Date(2026, 9, 28, 8, 0, 1));
  await act(async () => stale.click());
  expect(f.changed).not.toHaveBeenCalled();
  expect(f.host.querySelector('[role="alert"]')?.textContent).toContain("horário futuro");
  await f.close();
  expect(vi.getTimerCount()).toBe(0);
  vi.setSystemTime(new Date(2026, 9, 28, 7, 59, 50));
  const selected = await mount("2026-10-28T08:00");
  try {
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(selected.validity).toHaveBeenLastCalledWith(false);
    expect(selected.host.querySelector('[role="group"] button')?.textContent).toContain("13:00");
  } finally {
    await selected.close();
  }
  expect(vi.getTimerCount()).toBe(0);
});

it("disables every action and custom input while busy and rejects past or malformed values", async () => {
  const f = await mount("2026-10-27T08:00", true);
  try {
    expect(
      [...f.host.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button,input")].every(
        (element) => element.disabled,
      ),
    ).toBe(true);
    expect(f.validity).toHaveBeenLastCalledWith(false);
  } finally {
    await f.close();
  }
});
