import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_COMPONENTS,
  DASHBOARD_NATIVE_REVISION,
  dashboardColumnClass,
  dashboardGroupingOptions,
  createDashboardComponent,
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
      { id: "ticketRequesterRanking", visible: true, visualization: "table", columns: 1 },
      { id: "tag", visible: true, visualization: "columns", columns: 1 },
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

  it("adds the new native ranking to a saved version 2 dashboard without replacing preferences", () => {
    const saved = {
      ...DEFAULT_DASHBOARD_COMPONENTS.find((item) => item.id === "messages")!,
      title: "Meu tráfego",
      visible: false,
      columns: 4 as const,
    };

    const migrated = parseDashboardPreferences({ version: 2, components: [saved] });

    expect(migrated).toEqual([
      saved,
      DEFAULT_DASHBOARD_COMPONENTS.find((item) => item.id === "ticketRequesterRanking"),
    ]);
    expect(parseDashboardPreferences({ version: 2, components: migrated })).toEqual(migrated);
  });

  it("migrates the saved native ranking to a list in one column only once", () => {
    const savedRanking = {
      ...DEFAULT_DASHBOARD_COMPONENTS.find((item) => item.id === "ticketRequesterRanking")!,
      title: "Ranking personalizado",
      dataSource: "records" as const,
      groupBy: "ticketRequesterContact",
      visualization: "bars" as const,
      columns: 2 as const,
    };
    const migratedRanking = {
      ...savedRanking,
      dataSource: "conversations",
      groupBy: "conversationContact",
    };

    expect(parseDashboardPreferences({ version: 2, components: [savedRanking] })).toEqual([
      { ...migratedRanking, visualization: "table", columns: 1 },
    ]);
    expect(
      parseDashboardPreferences({
        version: 2,
        nativeRevision: 3,
        components: [savedRanking],
      }),
    ).toEqual([migratedRanking]);
  });

  it("migrates conversations by tag to one column", () => {
    const savedTag = {
      ...DEFAULT_DASHBOARD_COMPONENTS.find((item) => item.id === "tag")!,
      columns: 2 as const,
    };

    const migrated = parseDashboardPreferences({
      version: 2,
      nativeRevision: 3,
      components: [savedTag],
    });

    expect(migrated.find((item) => item.id === "tag")).toEqual({
      ...savedTag,
      columns: 1,
    });
  });

  it("starts a new component with an empty mandatory title", () => {
    expect(createDashboardComponent("new-id")).toMatchObject({ id: "new-id", title: "" });
  });

  it("duplicates all settings with an independent id and title", () => {
    const original = DEFAULT_DASHBOARD_COMPONENTS[1];
    const duplicate = duplicateDashboardComponent(original, "copy-id");

    expect(duplicate).toEqual({ ...original, id: "copy-id", title: `${original.title} (cópia)` });
    expect(duplicate).not.toBe(original);
  });

  it("reorders component instances without mutating the source", () => {
    const source = DEFAULT_DASHBOARD_COMPONENTS.slice(0, 5);
    const reordered = reorderDashboardComponents(source, "distribution", "counters");

    expect(reordered.map((item) => item.id)).toEqual([
      "distribution",
      "counters",
      "messages",
      "ticketRequesterRanking",
      "tag",
    ]);
    expect(source.map((item) => item.id)).toEqual([
      "counters",
      "messages",
      "ticketRequesterRanking",
      "tag",
      "distribution",
    ]);
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

  it("offers the ticket requester ranking as a native record grouping", () => {
    expect(dashboardGroupingOptions("records")).toContainEqual({
      value: "ticketRequesterContact",
      label: "Contatos que abriram chamados",
      section: "native",
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

const legacyNativeContactRanking = {
  id: "ticketRequesterRanking",
  title: "Top 10 contatos que abriram chamados",
  dataSource: "records" as const,
  groupBy: "ticketRequesterContact",
  visible: true,
  visualization: "table" as const,
  columns: 1 as const,
  valueMode: "count" as const,
};

describe("conversation contact ranking revision 5", () => {
  it("uses the stable native id for conversation contacts and exposes the new grouping", () => {
    expect(DASHBOARD_NATIVE_REVISION).toBe(5);
    expect(
      DEFAULT_DASHBOARD_COMPONENTS.find((item) => item.id === "ticketRequesterRanking"),
    ).toMatchObject({
      title: "Top 10 contatos que mais abrem conversas",
      dataSource: "conversations",
      groupBy: "conversationContact",
    });
    expect(dashboardGroupingOptions("conversations")).toContainEqual({
      value: "conversationContact",
      label: "Contatos",
      section: "native",
    });
    expect(dashboardGroupingOptions("records")).toContainEqual({
      value: "ticketRequesterContact",
      label: "Contatos que abriram chamados",
      section: "native",
    });
  });

  it("migrates only the old native data meaning and default title without replacing customization", () => {
    const customTicketWidget = {
      ...legacyNativeContactRanking,
      id: "custom-tickets",
      title: "Chamados do cliente",
    };
    const customizedNative = {
      ...legacyNativeContactRanking,
      visible: false,
      columns: 4 as const,
      visualization: "bars" as const,
      valueMode: "percentage" as const,
    };
    const other = DEFAULT_DASHBOARD_COMPONENTS.find((item) => item.id === "messages")!;
    const source = [customTicketWidget, customizedNative, other];
    const migrated = parseDashboardPreferences({
      version: 2,
      nativeRevision: 4,
      components: source,
    });
    expect(migrated).toEqual([
      customTicketWidget,
      {
        ...customizedNative,
        title: "Top 10 contatos que mais abrem conversas",
        dataSource: "conversations",
        groupBy: "conversationContact",
      },
      other,
    ]);
    expect(source[1]).toEqual(customizedNative);
    expect(migrated.filter((item) => item.id === "ticketRequesterRanking")).toHaveLength(1);
  });

  it("keeps a personalized ranking title and its saved layout", () => {
    const personalized = {
      ...legacyNativeContactRanking,
      title: "Ranking personalizado",
      visualization: "pie" as const,
      columns: 3 as const,
    };
    expect(
      parseDashboardPreferences({ version: 2, nativeRevision: 4, components: [personalized] }),
    ).toEqual([{ ...personalized, dataSource: "conversations", groupBy: "conversationContact" }]);
  });

  it("does not rewrite a native id deliberately configured for a different source or group", () => {
    for (const customized of [
      {
        ...legacyNativeContactRanking,
        dataSource: "contacts" as const,
        groupBy: "customer",
        visualization: "cards" as const,
        columns: 2 as const,
      },
      { ...legacyNativeContactRanking, groupBy: "queue" },
    ]) {
      expect(
        parseDashboardPreferences({ version: 2, nativeRevision: 4, components: [customized] }),
      ).toEqual([customized]);
    }
  });

  it("remains identical after API serialization and reopening revision 5 without adding a duplicate", () => {
    const migrated = parseDashboardPreferences({
      version: 2,
      nativeRevision: 4,
      components: [legacyNativeContactRanking],
    });
    const saved = JSON.parse(
      JSON.stringify({
        version: 2,
        nativeRevision: DASHBOARD_NATIVE_REVISION,
        components: migrated,
      }),
    );
    const reopened = parseDashboardPreferences(saved);
    expect(reopened).toEqual(migrated);
    expect(reopened.filter((item) => item.id === "ticketRequesterRanking")).toHaveLength(1);
    expect(reopened[0].groupBy).toBe("conversationContact");
  });

  it("does not undo a ticket grouping intentionally saved after revision 5", () => {
    expect(
      parseDashboardPreferences({
        version: 2,
        nativeRevision: 5,
        components: [legacyNativeContactRanking],
      }),
    ).toEqual([legacyNativeContactRanking]);
  });

  it("chains previous layout migrations with the new conversation grouping for older revisions", () => {
    const old = {
      ...legacyNativeContactRanking,
      visualization: "bars" as const,
      columns: 4 as const,
    };
    expect(parseDashboardPreferences({ version: 2, nativeRevision: 1, components: [old] })).toEqual(
      [
        {
          ...old,
          title: "Top 10 contatos que mais abrem conversas",
          dataSource: "conversations",
          groupBy: "conversationContact",
          visualization: "table",
          columns: 1,
        },
      ],
    );
  });
});

it.each([
  ["Top 10 contatos que abriram chamados", "Top 10 contatos que mais abrem conversas"],
  ["Meu ranking personalizado", "Meu ranking personalizado"],
])(
  "migrates the flat legacy ranking label %s without replacing custom presentation",
  (label, expectedTitle) => {
    const result = parseDashboardPreferences({
      visible: ["ticketRequesterRanking"],
      order: ["recent", "ticketRequesterRanking"],
      labels: { ticketRequesterRanking: label, recent: "Atividade personalizada" },
      columns: { ticketRequesterRanking: 3 },
    });
    expect(result[1]).toMatchObject({
      id: "ticketRequesterRanking",
      title: expectedTitle,
      columns: 3,
      visible: true,
      dataSource: "conversations",
      groupBy: "conversationContact",
    });
    expect(result[0]).toMatchObject({ id: "recent", title: "Atividade personalizada" });
  },
);

it.each([
  {
    ...legacyNativeContactRanking,
    dataSource: "contacts" as const,
    groupBy: "customer",
    visualization: "pie" as const,
    columns: 4 as const,
  },
  {
    ...legacyNativeContactRanking,
    groupBy: "queue",
    visualization: "bars" as const,
    columns: 2 as const,
  },
])("preserves every setting of a repurposed native id even in revision 1", (repurposed) => {
  expect(
    parseDashboardPreferences({ version: 2, nativeRevision: 1, components: [repurposed] }),
  ).toEqual([repurposed]);
});
