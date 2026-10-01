import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_COMPONENTS,
  dashboardColumnClass,
  dashboardGroupingOptions,
  duplicateDashboardComponent,
  parseDashboardPreferences,
  reorderDashboardComponents,
  restoreNativeDashboardComponents,
} from "./dashboard-components";

describe("dashboard component preferences", () => {
  it("uses the approved native dashboard order and defaults", () => {
    expect(
      DEFAULT_DASHBOARD_COMPONENTS.slice(1).map(({ id, visible, visualization, columns }) => ({
        id,
        visible,
        visualization,
        columns,
      })),
    ).toEqual([
      { id: "messages", visible: true, visualization: "line", columns: 2 },
      { id: "tag", visible: true, visualization: "columns", columns: 2 },
      { id: "distribution", visible: true, visualization: "donut", columns: 1 },
      { id: "agent", visible: true, visualization: "columns", columns: 1 },
      { id: "customer", visible: true, visualization: "bars", columns: 1 },
      { id: "recent", visible: true, visualization: "table", columns: 1 },
      { id: "connection", visible: false, visualization: "columns", columns: 1 },
      { id: "department", visible: false, visualization: "bars", columns: 1 },
    ]);
  });

  it("migrates the legacy preferences without losing labels, order or visibility", () => {
    const migrated = parseDashboardPreferences({
      visible: ["messages", "counters"],
      order: ["messages", "counters"],
      labels: { messages: "Mensagens por hora" },
      columns: { messages: 3 },
    });

    expect(migrated[0]).toMatchObject({
      id: "messages",
      title: "Mensagens por hora",
      visible: true,
      columns: 3,
      visualization: "line",
    });
    expect(migrated.find((item) => item.id === "distribution")?.visible).toBe(false);
    expect(migrated).toHaveLength(DEFAULT_DASHBOARD_COMPONENTS.length);
  });

  it("preserves an intentionally empty version 2 dashboard", () => {
    expect(parseDashboardPreferences({ version: 2, components: [] })).toEqual([]);
  });

  it("duplicates all settings with an independent id and title", () => {
    const original = DEFAULT_DASHBOARD_COMPONENTS[1];
    const duplicate = duplicateDashboardComponent(original, "copy-id");

    expect(duplicate).toEqual({ ...original, id: "copy-id", title: `${original.title} (cópia)` });
    expect(duplicate).not.toBe(original);
  });

  it("reorders component instances without mutating the source", () => {
    const source = DEFAULT_DASHBOARD_COMPONENTS.slice(0, 4);
    const reordered = reorderDashboardComponents(source, "distribution", "counters");

    expect(reordered.map((item) => item.id)).toEqual([
      "distribution",
      "counters",
      "messages",
      "tag",
    ]);
    expect(source.map((item) => item.id)).toEqual(["counters", "messages", "tag", "distribution"]);
  });

  it("restores native settings and order without deleting custom components", () => {
    const custom = {
      ...DEFAULT_DASHBOARD_COMPONENTS[0],
      id: "custom-component",
      title: "Meu componente",
    };
    const changedNative = {
      ...DEFAULT_DASHBOARD_COMPONENTS[1],
      title: "Título alterado",
      columns: 4 as const,
    };

    const restored = restoreNativeDashboardComponents([custom, changedNative]);

    expect(restored.slice(0, DEFAULT_DASHBOARD_COMPONENTS.length)).toEqual(
      DEFAULT_DASHBOARD_COMPONENTS,
    );
    expect(restored.at(-1)).toEqual(custom);
    expect(restored.at(-1)).not.toBe(custom);
  });

  it("separates native and personalized contact fields", () => {
    const options = dashboardGroupingOptions("contacts", [
      { id: "field-1", label: "Origem do atendimento" },
    ]);

    expect(options.find((item) => item.value === "customer")?.section).toBe("native");
    expect(options.at(-1)).toEqual({
      value: "custom:field-1",
      label: "Origem do atendimento",
      section: "custom",
    });
  });

  it("maps the four width choices to the dashboard grid", () => {
    expect([1, 2, 3, 4].map((value) => dashboardColumnClass(value as 1 | 2 | 3 | 4))).toEqual([
      "md:col-span-1",
      "md:col-span-2",
      "md:col-span-3",
      "md:col-span-4",
    ]);
  });
});
