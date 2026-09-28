// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkScheduleEditor } from "../routes/perfis";
import { WEEK_DAYS, type WorkPeriod, type WorkSchedule } from "./work-schedule";

function createSchedule({
  noSchedule = false,
  mondayPeriods = [{ id: "segunda-1", start: "08:00", end: "12:00" }],
}: {
  noSchedule?: boolean;
  mondayPeriods?: WorkPeriod[];
} = {}): WorkSchedule {
  const days = {} as WorkSchedule["days"];
  for (const day of WEEK_DAYS) {
    days[day] = {
      active: day === "Segunda" || day === "Terca",
      periods:
        day === "Segunda" ? mondayPeriods : [{ id: `${day}-1`, start: "09:00", end: "17:00" }],
    };
  }
  return { noSchedule, days };
}

function StatefulEditor({ initial }: { initial: WorkSchedule }) {
  const [value, setValue] = React.useState(initial);
  return <WorkScheduleEditor value={value} onChange={setValue} />;
}

let root: Root;
let host: HTMLDivElement;

describe("work schedule editor", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("presents noSchedule as the positive Habilitar Jornada toggle", async () => {
    await act(async () =>
      root.render(<StatefulEditor initial={createSchedule({ noSchedule: true })} />),
    );
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Habilitar Jornada"]')!;
    const mondayStart = host.querySelector<HTMLInputElement>(
      '[aria-label="Início do período 1 de Segunda"]',
    )!;
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(mondayStart.disabled).toBe(true);

    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(mondayStart.disabled).toBe(false);

    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(mondayStart.value).toBe("08:00");
  });

  it("adds periods below, aligns actions, and copies only to active days", async () => {
    await act(async () => root.render(<StatefulEditor initial={createSchedule()} />));
    await act(async () => Promise.resolve());

    const add = host.querySelector<HTMLButtonElement>('[aria-label="Incluir horário em Segunda"]')!;
    await act(async () => add.click());
    const secondStart = host.querySelector<HTMLInputElement>(
      '[aria-label="Início do período 2 de Segunda"]',
    )!;
    const secondEnd = host.querySelector<HTMLInputElement>(
      '[aria-label="Fim do período 2 de Segunda"]',
    )!;
    expect(secondStart.value).toBe("12:00");
    expect(secondEnd.value).toBe("");

    const secondDelete = host.querySelector<HTMLButtonElement>(
      '[aria-label="Excluir período 2 de Segunda"]',
    )!;
    expect(secondDelete.parentElement?.className).toContain("grid-cols-3");

    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Copiar horários de Segunda para todos os dias ativos"]',
        )!
        .click(),
    );
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="Início do período 1 de Terca"]')?.value,
    ).toBe("08:00");
    const saturdayStart = host.querySelector<HTMLInputElement>(
      '[aria-label="Início do período 1 de Sabado"]',
    )!;
    expect(saturdayStart.value).toBe("09:00");
    expect(saturdayStart.disabled).toBe(true);
  });

  it("keeps errors below the fields and tabs through each period before the next active day", async () => {
    const initial = createSchedule({
      mondayPeriods: [
        { id: "segunda-1", start: "08:00", end: "12:00" },
        { id: "segunda-2", start: "13:00", end: "13:00" },
      ],
    });
    await act(async () => root.render(<StatefulEditor initial={initial} />));
    const alert = host.querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert.textContent).toContain("maior que a inicial");
    expect(alert.closest("td")?.colSpan).toBe(3);

    const labels = [
      "Início do período 1 de Segunda",
      "Fim do período 1 de Segunda",
      "Início do período 2 de Segunda",
      "Fim do período 2 de Segunda",
      "Início do período 1 de Terca",
    ];
    for (let index = 0; index < labels.length - 1; index++) {
      const current = host.querySelector<HTMLInputElement>(`[aria-label="${labels[index]}"]`)!;
      await act(async () => current.focus());
      await act(async () =>
        current.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })),
      );
      expect(document.activeElement?.getAttribute("aria-label")).toBe(labels[index + 1]);
    }
  });
});
