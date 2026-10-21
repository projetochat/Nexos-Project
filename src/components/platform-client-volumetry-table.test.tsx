// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PlatformClientVolumetryTable } from "./platform-client-volumetry-table";

const zeroes = {
  instances: 0,
  contacts: 0,
  attendants: 0,
  accessProfiles: 0,
  departments: 0,
  tags: 0,
  quickReplies: 0,
  customFields: 0,
  schedules: 0,
  campaigns: 0,
};

it("renders every metric, keeps totals fixed and sorts client rows", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <PlatformClientVolumetryTable
          title="Volumetria por cliente"
          rows={[
            { ...zeroes, clientId: "b", clientName: "Beta", instances: 2 },
            { ...zeroes, clientId: "a", clientName: "Alfa", instances: 1 },
          ]}
          totals={{ ...zeroes, instances: 3 }}
        />,
      ),
    );
    expect(host.textContent).not.toContain(
      "Visão consolidada dos cadastros e utilização da plataforma",
    );
    const title = [...host.querySelectorAll("p")].find(
      (element) => element.textContent === "Volumetria por cliente",
    );
    expect(title?.classList.contains("uppercase")).toBe(true);
    expect(title?.classList.contains("tracking-widest")).toBe(true);
    expect(title?.classList.contains("mb-4")).toBe(true);
    const quickRepliesHeader = host.querySelector('[aria-label="Ordenar por Mensagens Rápidas"]');
    expect(quickRepliesHeader?.firstElementChild?.hasAttribute("data-header-icon-row")).toBe(true);
    expect(quickRepliesHeader?.querySelectorAll("svg")).toHaveLength(1);
    const headerIcons = host.querySelectorAll("[data-header-icon-row] svg");
    expect(headerIcons).toHaveLength(10);
    expect(
      [...headerIcons].every(
        (icon) => icon.classList.contains("h-[17px]") && icon.classList.contains("w-[17px]"),
      ),
    ).toBe(true);
    expect(
      [...headerIcons].every((icon) =>
        [...icon.classList].some((className) => /^text-[a-z]+-(500|600)$/.test(className)),
      ),
    ).toBe(true);
    const lightColorClasses = [...headerIcons].map(
      (icon) => [...icon.classList].find((className) => /^text-[a-z]+-(500|600)$/.test(className))!,
    );
    expect(new Set(lightColorClasses).size).toBe(10);
    expect(
      host
        .querySelector('[aria-label="Ordenar por Instâncias"] svg')
        ?.classList.contains("text-emerald-600"),
    ).toBe(true);
    expect(
      host
        .querySelector('[aria-label="Ordenar por Contatos"] svg')
        ?.classList.contains("text-blue-600"),
    ).toBe(true);
    expect(
      host.querySelector('[aria-label="Ordenar por Cliente"]')?.querySelector("svg"),
    ).toBeNull();
    expect(host.querySelector("thead th:first-child")?.classList.contains("text-left")).toBe(true);
    expect(
      [...host.querySelectorAll("thead th:not(:first-child)")].every((cell) =>
        cell.classList.contains("text-center"),
      ),
    ).toBe(true);
    expect(host.querySelector("tbody td:first-child")?.classList.contains("text-center")).toBe(
      false,
    );
    expect(
      [...host.querySelectorAll("tbody td:not(:first-child), tfoot td:not(:first-child)")].every(
        (cell) => cell.classList.contains("text-center"),
      ),
    ).toBe(true);
    expect(quickRepliesHeader?.children[1]?.hasAttribute("data-header-label")).toBe(true);
    expect(quickRepliesHeader?.querySelector("span.flex-col")?.children).toHaveLength(2);
    expect(quickRepliesHeader?.querySelector("span.flex-col")?.children[0]?.textContent).toBe(
      "Mensagens",
    );
    expect(quickRepliesHeader?.querySelector("span.flex-col")?.children[1]?.textContent).toBe(
      "Rápidas",
    );
    expect([...host.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual([
      "Cliente",
      "Instâncias",
      "Contatos",
      "Atendentes",
      "Perfil de Acesso",
      "Departamentos",
      "Etiquetas",
      "Mensagens Rápidas",
      "Campos Adicionais",
      "Agendamentos",
      "Campanhas",
    ]);
    expect(
      [...host.querySelectorAll("tbody tr")].map((row) => row.querySelector("td")?.textContent),
    ).toEqual(["Alfa", "Beta"]);
    await act(async () =>
      (host.querySelector('[aria-label="Ordenar por Instâncias"]') as HTMLButtonElement).click(),
    );
    await act(async () =>
      (host.querySelector('[aria-label="Ordenar por Instâncias"]') as HTMLButtonElement).click(),
    );
    expect(
      [...host.querySelectorAll("tbody tr")].map((row) => row.querySelector("td")?.textContent),
    ).toEqual(["Beta", "Alfa"]);
    expect(host.querySelector("tfoot")?.textContent).toContain("Total3");
    expect(
      host.querySelector('[aria-label="Volumetria por cliente: dados por cliente"]'),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
