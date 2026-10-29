// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  DashboardColumnAxisTick,
  DashboardComponentRenderer,
} from "./dashboard-component-renderer";
import {
  dashboardColumnAxisLayout,
  dashboardColumnLabelMetrics,
  dashboardLabelWidth,
} from "@/lib/dashboard-chart-layout";

it("renders the first three whole words in two SVG lines while preserving the full accessible name", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  const root = createRoot(host);
  const label = "AGUARDANDO RETORNO DO CLIENTE";
  try {
    for (const width of [320, 1500]) {
      await act(async () =>
        root.render(
          <svg>
            <DashboardColumnAxisTick
              x={25}
              y={50}
              payload={{ value: label }}
              layout={dashboardColumnAxisLayout([label], width)}
            />
          </svg>,
        ),
      );
      expect([...host.querySelectorAll("tspan")].map((item) => item.textContent).join(" ")).toBe(
        "AGUARDANDO RETORNO DO",
      );
      expect(host.querySelectorAll("tspan")).toHaveLength(2);
      expect(host.querySelector("title")?.textContent).toBe(label);
      expect(host.querySelector("text")?.getAttribute("aria-label")).toBe(label);
      expect(host.querySelector("text")?.getAttribute("transform")).toBeNull();
    }
    const middleDominant = "DO AGUARDANDO FIM CLIENTE";
    await act(async () =>
      root.render(
        <svg>
          <DashboardColumnAxisTick
            payload={{ value: middleDominant }}
            layout={dashboardColumnAxisLayout([middleDominant], 350)}
          />
        </svg>,
      ),
    );
    expect([...host.querySelectorAll("tspan")].map((item) => item.textContent)).toEqual([
      "DO",
      "AGUARDANDO",
    ]);
    expect(host.querySelector("title")?.textContent).toBe(middleDominant);
    expect(host.querySelector("text")?.getAttribute("aria-label")).toBe(middleDominant);
  } finally {
    await act(async () => root.unmount());
  }
});

it("fits real Recharts columns to 350/1200px with 2, 4, 7 and 12 categories", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let width = 350;
  const callbacks: ResizeObserverCallback[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("NETWORK_BLOCKED");
    }),
  );
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    width,
    height: 270,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 270,
    toJSON: () => ({}),
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    for (const count of [2, 4, 7, 12])
      for (const nextWidth of [350, 1200]) {
        width = nextWidth;
        await act(async () =>
          root.render(
            <DashboardComponentRenderer
              compact
              preserveAllItems
              visualization="columns"
              columns={4}
              valueMode="count"
              data={Array.from({ length: count }, (_, i) => ({
                nome: `A${i}`,
                total: i + 1,
                cor: "#123456",
              }))}
            />,
          ),
        );
        await act(async () => {
          for (const callback of callbacks)
            callback(
              [{ contentRect: { width, height: 270 } }] as ResizeObserverEntry[],
              {} as ResizeObserver,
            );
        });
        expect(
          Number(host.querySelector(".recharts-surface")?.getAttribute("width")),
        ).toBeLessThanOrEqual(width);
        expect(Number(host.querySelector(".recharts-surface")?.getAttribute("height"))).toBe(200);
        expect(host.querySelectorAll(".recharts-xAxis text[aria-label]")).toHaveLength(count);
        for (const text of host.querySelectorAll<SVGTextElement>(
          ".recharts-xAxis text[aria-label]",
        )) {
          const label = text.getAttribute("aria-label")!;
          const tickX = Number(
            text
              .closest(".recharts-cartesian-axis-tick")!
              .querySelector("line")!
              .getAttribute("x1"),
          );
          const x = Number(
            text.parentElement!.getAttribute("transform")!.match(/translate\(([^,]+)/)![1],
          );
          const half =
            Math.max(
              ...[...text.querySelectorAll("tspan")].map((line) =>
                dashboardLabelWidth(line.textContent),
              ),
            ) / 2;
          expect(x).toBeCloseTo(tickX);
          expect(text.getAttribute("text-anchor")).toBe("middle");
          expect(Number(text.getAttribute("font-size"))).toBeGreaterThanOrEqual(9);
          expect(x - half).toBeGreaterThanOrEqual(4);
          expect(x + half).toBeLessThanOrEqual(width - 4);
        }
      }
    // Dense two-line labels retain the midpoint of their right endpoints at the tick.
    width = 350;
    await act(async () =>
      root.render(
        <DashboardComponentRenderer
          compact
          preserveAllItems
          visualization="columns"
          columns={4}
          valueMode="count"
          data={Array.from({ length: 7 }, (_, i) => ({
            nome: `AGUARDANDO RETORNO ${i}`,
            total: i + 1,
            cor: "#123456",
          }))}
        />,
      ),
    );
    await act(async () => {
      for (const callback of callbacks)
        callback(
          [{ contentRect: { width, height: 270 } }] as ResizeObserverEntry[],
          {} as ResizeObserver,
        );
    });
    for (const text of host.querySelectorAll<SVGTextElement>(".recharts-xAxis text[aria-label]")) {
      expect(text.getAttribute("transform")).toBe("rotate(-45)");
      const lines = text.querySelectorAll("tspan");
      const x = Number(
        text.parentElement!.getAttribute("transform")!.match(/translate\(([^,]+)/)![1],
      );
      const lineHeight = Number(lines[1].getAttribute("dy"));
      const tickX = Number(
        text.closest(".recharts-cartesian-axis-tick")!.querySelector("line")!.getAttribute("x1"),
      );
      expect(x + ((lines.length - 1) * lineHeight * Math.SQRT1_2) / 2).toBeCloseTo(tickX);
      expect(text.querySelector("title")!.textContent).toContain("AGUARDANDO RETORNO");
      const displayed = [...lines].map((line) => line.textContent).join(" ");
      expect(displayed).not.toBe(text.getAttribute("aria-label"));
      const visualWidth =
        (Math.max(...[...lines].map((line) => dashboardLabelWidth(line.textContent))) *
          Number(text.getAttribute("font-size"))) /
        10;
      expect(x - visualWidth * Math.SQRT1_2).toBeGreaterThanOrEqual(4);
      expect(x + (lines.length - 1) * lineHeight * Math.SQRT1_2).toBeLessThanOrEqual(width - 4);
    }
    for (const count of [2, 4, 7, 12])
      for (const nextWidth of [350, 1200]) {
        width = nextWidth;
        await act(async () =>
          root.render(
            <DashboardComponentRenderer
              compact
              preserveAllItems
              visualization="bars"
              columns={4}
              valueMode="count"
              data={Array.from({ length: count }, (_, i) => ({
                nome: `NOME EXTREMAMENTE LONGO DO DEPARTAMENTO ${i}`,
                total: i + 1,
                cor: "#123456",
              }))}
            />,
          ),
        );
        await act(async () => {
          for (const callback of callbacks)
            callback(
              [{ contentRect: { width, height: 270 } }] as ResizeObserverEntry[],
              {} as ResizeObserver,
            );
        });
        expect(
          Number(host.querySelector(".recharts-surface")?.getAttribute("width")),
        ).toBeLessThanOrEqual(width);
        for (const text of host.querySelectorAll<SVGTextElement>(
          ".recharts-yAxis text[aria-label]",
        )) {
          expect(text.querySelector("title")!.textContent).toContain("NOME EXTREMAMENTE LONGO");
          const display = [...text.querySelectorAll("tspan")]
            .map((line) => line.textContent)
            .join(" ");
          expect(display).toContain("...");
          for (const line of text.querySelectorAll("tspan"))
            expect(
              Number(text.getAttribute("x")) - dashboardLabelWidth(line.textContent),
            ).toBeGreaterThanOrEqual(0);
        }
        expect(host.querySelectorAll(".recharts-yAxis text[aria-label]")).toHaveLength(count);
      }
    for (const count of [3, 15]) {
      await act(async () =>
        root.render(
          <DashboardComponentRenderer
            compact
            preserveAllItems
            visualization="bars"
            columns={4}
            valueMode="count"
            data={Array.from({ length: count }, (_, i) => ({
              nome: "Em Atendimento",
              total: i + 1,
              cor: "#123456",
            }))}
          />,
        ),
      );
      const ticks = host.querySelectorAll<SVGTextElement>(".recharts-yAxis text[aria-label]");
      expect(ticks).toHaveLength(count);
      for (const text of ticks) {
        const lines = [...text.querySelectorAll("tspan")];
        expect(text.querySelector("title")!.textContent).toBe("Em Atendimento");
        if (count === 3) {
          expect(lines.map((line) => line.textContent)).toEqual(["Em", "Atendimento"]);
          expect(Number(lines[0].getAttribute("dy"))).toBe(
            -Number(lines[1].getAttribute("dy")) / 2,
          );
        } else {
          expect(lines).toHaveLength(1);
          expect(lines[0].textContent).toContain("...");
        }
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    rect.mockRestore();
    vi.unstubAllGlobals();
  }
});
