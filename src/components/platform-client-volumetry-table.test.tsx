// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PlatformClientVolumetryTable } from "./platform-client-volumetry-table";

const zeroes = {
  logins: 0,
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

async function mountTable(
  props: Partial<React.ComponentProps<typeof PlatformClientVolumetryTable>>,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (next = props) =>
    act(async () =>
      root.render(
        <PlatformClientVolumetryTable
          title="Métricas por cliente"
          rows={[]}
          totals={zeroes}
          {...next}
        />,
      ),
    );
  await render();
  return {
    host,
    render,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("shows the available unified total and accessible breakdown for all three environments", async () => {
  const environments = { local: 2, homologation: 3, production: 5 };
  const f = await mountTable({
    rows: [
      {
        ...zeroes,
        clientId: "synthetic-client",
        clientName: "Alfa",
        logins: 10,
        loginEnvironments: environments,
      },
    ],
    totals: { ...zeroes, logins: 10, loginEnvironments: environments },
    loginAggregation: { status: "available", updatedAt: "2026-10-28T12:00:00Z" },
  });
  try {
    expect(f.host.textContent).toContain("Logins unificados de Localhost, HML e Produção");
    expect(f.host.textContent).toContain("somente novos logins internos");
    expect(f.host.textContent).toContain("Atualizado em");
    const login = f.host.querySelector("tbody td:nth-child(2) span");
    expect(login?.textContent).toBe("10");
    expect(login?.getAttribute("title")).toBe("Localhost: 2 · HML: 3 · Produção: 5");
    expect(login?.getAttribute("aria-label")).toContain("Logins: 10.");
    expect(f.host.textContent).not.toContain("synthetic-client");
    expect(f.host.querySelector("tfoot td:nth-child(2)")?.textContent).toBe("10");
  } finally {
    await f.close();
  }
});

it.each(["unavailable", "ambiguous"] as const)(
  "does not disguise %s aggregation as zero or a partial total",
  async (status) => {
    const f = await mountTable({
      rows: [{ ...zeroes, clientId: "a", clientName: "Alfa", logins: 0, instances: 4 }],
      totals: { ...zeroes, logins: 0, instances: 4 },
      loginAggregation: { status },
    });
    try {
      expect(f.host.querySelector("tbody td:nth-child(2)")?.textContent).toBe("Indisponível");
      expect(f.host.querySelector("tfoot td:nth-child(2)")?.textContent).toBe("Indisponível");
      expect(f.host.querySelector("tbody td:nth-child(3)")?.textContent).toBe("4");
      expect(f.host.textContent).toContain(
        status === "ambiguous"
          ? "divergência na identificação"
          : "não foi possível consultar todos os ambientes",
      );
    } finally {
      await f.close();
    }
  },
);

it("keeps legacy and disabled responses scoped to the current environment", async () => {
  const props = {
    rows: [{ ...zeroes, clientId: "a", clientName: "Alfa", logins: 6 }],
    totals: { ...zeroes, logins: 6 },
  };
  const f = await mountTable(props);
  try {
    for (const status of [undefined, "disabled"] as const) {
      await f.render({ ...props, loginAggregation: status ? { status } : undefined });
      expect(f.host.textContent).toContain("somente neste ambiente");
      expect(f.host.textContent).not.toContain("unificados");
      expect(f.host.querySelector("tbody td:nth-child(2)")?.textContent).toBe("6");
    }
  } finally {
    await f.close();
  }
});

it("sorts available counts numerically while unavailable rows stay last in both directions", async () => {
  const f = await mountTable({
    rows: [
      { ...zeroes, clientId: "b", clientName: "Beta", logins: null },
      { ...zeroes, clientId: "a", clientName: "Alfa", logins: null },
      { ...zeroes, clientId: "c", clientName: "Gama", logins: 1 },
      { ...zeroes, clientId: "d", clientName: "Delta", logins: 0 },
    ],
    totals: { ...zeroes, logins: null },
    loginAggregation: { status: "available" },
  });
  try {
    const names = () =>
      [...f.host.querySelectorAll("tbody tr")].map((row) => row.querySelector("td")?.textContent);
    const sort = f.host.querySelector<HTMLButtonElement>('[aria-label="Ordenar por Logins"]')!;
    await act(async () => sort.click());
    expect(names()).toEqual(["Delta", "Gama", "Alfa", "Beta"]);
    await act(async () => sort.click());
    expect(names()).toEqual(["Gama", "Delta", "Alfa", "Beta"]);
    expect(f.host.querySelector("tfoot td:nth-child(2)")?.textContent).toBe("Indisponível");
  } finally {
    await f.close();
  }
});

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
            { ...zeroes, clientId: "b", clientName: "Beta", instances: 2, logins: 7 },
            { ...zeroes, clientId: "a", clientName: "Alfa", instances: 1, logins: 2 },
          ]}
          totals={{ ...zeroes, instances: 3, logins: 9 }}
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
    expect(headerIcons).toHaveLength(11);
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
    expect(new Set(lightColorClasses).size).toBe(11);
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
      "Logins",
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
    await act(async () =>
      (host.querySelector('[aria-label="Ordenar por Logins"]') as HTMLButtonElement).click(),
    );
    await act(async () =>
      (host.querySelector('[aria-label="Ordenar por Logins"]') as HTMLButtonElement).click(),
    );
    expect(
      [...host.querySelectorAll("tbody tr")].map((row) => row.querySelector("td")?.textContent),
    ).toEqual(["Beta", "Alfa"]);
    expect(host.querySelector("tfoot")?.textContent).toContain("Total93");
    expect(
      host.querySelector('[aria-label="Volumetria por cliente: dados por cliente"]'),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
