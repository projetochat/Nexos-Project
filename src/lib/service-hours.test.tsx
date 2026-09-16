// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
import { ServiceHoursTable, serviceHoursError } from "../routes/instancias";

describe("service hours editor", () => {
  it("shows and clears an inline error while typing, without blur or saving", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Editor() {
      const [rows, setRows] = React.useState([
        { day: "Terça", active: true, start: "08:00", end: "18:00" },
      ]);
      return <ServiceHoursTable rows={rows} onChange={setRows} enabled focusStartSignal={0} />;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Editor />));
      const start = host.querySelector<HTMLInputElement>('[aria-label="Início de Terça"]')!;
      const end = host.querySelector<HTMLInputElement>('[aria-label="Fim de Terça"]')!;
      const type = async (input: HTMLInputElement, value: string) => {
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            input,
            value,
          );
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      };
      for (const value of ["18:00", "19:00", "1900"]) {
        await type(start, value);
        const alert = host.querySelector('[role="alert"]');
        expect(alert?.textContent).toContain("maior que a inicial");
        expect(alert?.closest("td")?.textContent).toContain("Terça");
        expect(start.getAttribute("aria-invalid")).toBe("true");
        expect(end.getAttribute("aria-invalid")).toBe("true");
      }
      await type(end, "20:00");
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(start.getAttribute("aria-invalid")).toBe("false");
      await type(end, "07:00");
      expect(host.querySelector('[role="alert"]')).not.toBeNull();
      await act(async () =>
        host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
      );
      expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
  it("rejects equal or earlier ends", () => {
    expect(
      serviceHoursError([{ day: "Segunda", active: true, start: "08:00", end: "18:00" }]),
    ).toBe("");
    for (const end of ["08:00", "07:00"])
      expect(serviceHoursError([{ day: "Segunda", active: true, start: "08:00", end }])).toContain(
        "maior que a inicial",
      );
  });
  it("focuses and selects the start of the first available day upon activation", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const rows = [
      { day: "Segunda", active: false, start: "08:00", end: "18:00" },
      { day: "Terça", active: true, start: "09:00", end: "17:00" },
    ];
    try {
      await act(async () =>
        root.render(
          <ServiceHoursTable
            rows={rows}
            onChange={() => {}}
            enabled={false}
            focusStartSignal={0}
          />,
        ),
      );
      await act(async () =>
        root.render(
          <ServiceHoursTable rows={rows} onChange={() => {}} enabled focusStartSignal={1} />,
        ),
      );
      const input = document.activeElement as HTMLInputElement;
      expect(input.getAttribute("aria-label")).toBe("Início de Terça");
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(5);
      expect(scroll).toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });
});
