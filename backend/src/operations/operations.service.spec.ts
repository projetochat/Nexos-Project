import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationsService } from "./operations.service";

afterEach(() => vi.useRealTimers());

describe("tenant dashboard configuration", () => {
  it("reads the single configuration owned by the tenant", async () => {
    const updatedAt = new Date("2026-10-07T00:00:00.000Z");
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ configuration: { version: 2, components: [] }, updatedAt }]),
    };
    const service = new OperationsService(prisma as never, {} as never);

    await expect(
      service.dashboardConfiguration({ tenantId: "tenant-a" } as never),
    ).resolves.toEqual({ configuration: { version: 2, components: [] }, updatedAt });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("rejects a shared component without a title before persistence", async () => {
    const prisma = { $queryRaw: vi.fn() };
    const service = new OperationsService(prisma as never, {} as never);

    await expect(
      service.updateDashboardConfiguration({ tenantId: "tenant-a" } as never, {
        version: 2,
        components: [
          {
            id: "component-a",
            title: "",
            visible: true,
            visualization: "cards",
            columns: 1,
            dataSource: "records",
            groupBy: "queue",
            valueMode: "count",
          },
        ],
      }),
    ).rejects.toThrow("Identificação ou título");
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("migrates the native requester ranking to a one-column list only for old configurations", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { configuration: null, updatedAt: new Date("2026-10-23T00:00:00.000Z") },
      ]),
    };
    const service = new OperationsService(prisma as never, {} as never);
    const ranking = {
      id: "ticketRequesterRanking",
      title: "Top 10 contatos que abriram chamados",
      visible: true,
      visualization: "bars",
      columns: 2,
      dataSource: "records",
      groupBy: "ticketRequesterContact",
      valueMode: "count",
    };

    const result = await service.updateDashboardConfiguration({ tenantId: "tenant-a" } as never, {
      version: 2,
      components: [ranking],
    });

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(result.configuration).toEqual({
      version: 2,
      nativeRevision: 4,
      components: [{ ...ranking, visualization: "table", columns: 1 }],
    });
  });
});

describe("dashboard week ranges", () => {
  it.each([
    ["week", "2026-09-13T03:00:00.000Z", "2026-09-15T15:00:00.000Z"],
    ["previous_week", "2026-09-06T03:00:00.000Z", "2026-09-13T03:00:00.000Z"],
  ] as const)(
    "uses Sunday boundaries for %s in the company timezone",
    async (period, start, end) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T15:00:00.000Z"));
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
        conversation: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const metrics = {
        snapshot: vi.fn().mockResolvedValue({}),
        chartData: vi.fn().mockResolvedValue({}),
        semantics: vi.fn().mockReturnValue({}),
      };
      const service = new OperationsService(prisma as never, metrics as never);
      const result = await service.dashboard(
        {
          tenantId: "tenant-a",
          roleKey: "agent",
          connectionIds: ["vocical"],
          chatDepartmentIds: ["department-a"],
          permissions: ["chat.conversations.view_all_active"],
        } as never,
        { period },
      );
      expect(result.range).toEqual({ start, end });
      expect(metrics.snapshot).toHaveBeenNthCalledWith(
        1,
        "tenant-a",
        {
          start: new Date(start),
          end: new Date(end),
        },
        {
          period,
          allowedConnectionIds: ["vocical"],
          allowedDepartmentIds: ["department-a"],
          conversationAccess: {
            connectionId: { in: ["vocical"] },
            departmentId: { in: ["department-a"] },
          },
        },
      );
      expect(metrics.chartData).toHaveBeenCalledWith(
        "tenant-a",
        expect.anything(),
        {
          period,
          allowedConnectionIds: ["vocical"],
          allowedDepartmentIds: ["department-a"],
          conversationAccess: {
            connectionId: { in: ["vocical"] },
            departmentId: { in: ["department-a"] },
          },
        },
        "America/Sao_Paulo",
      );
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: "tenant-a",
            archivedAt: null,
            connectionId: { in: ["vocical"] },
            departmentId: { in: ["department-a"] },
          },
          orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
          take: 7,
        }),
      );
    },
  );
});

describe("conversation visibility in operational history", () => {
  it.each([
    ["contacts", "DIRECT"],
    ["groups", "GROUP"],
  ] as const)(
    "applies the %s type to the same paginated query and count",
    async (conversationType, persistedType) => {
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
        conversation: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
        $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
      };
      const service = new OperationsService(prisma as never, {} as never);

      await service.history(
        {
          tenantId: "tenant-a",
          membershipId: "membership-a",
          roleKey: "tenant_admin",
          permissions: [],
        } as never,
        { period: "30d", conversationType, q: "Equipe Norte", page: 2, pageSize: 10 },
      );

      const findWhere = prisma.conversation.findMany.mock.calls[0][0].where;
      const countWhere = prisma.conversation.count.mock.calls[0][0].where;
      expect(findWhere).toEqual(countWhere);
      expect(findWhere.AND[0]).toEqual(
        expect.objectContaining({
          tenantId: "tenant-a",
          conversationType: persistedType,
          AND: [
            {
              OR: expect.arrayContaining([
                { groupName: { contains: "Equipe Norte", mode: "insensitive" } },
              ]),
            },
          ],
        }),
      );
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    },
  );

  it("limits history to the attendant or unassigned queue without view-all", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      conversation: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const service = new OperationsService(prisma as never, {} as never);

    await service.history(
      {
        tenantId: "tenant-a",
        membershipId: "membership-a",
        roleKey: "agent",
        connectionIds: ["connection-a"],
        chatDepartmentIds: ["department-a"],
        permissions: [],
      } as never,
      { period: "30d" },
    );

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ tenantId: "tenant-a" }),
            {
              AND: [
                { connectionId: { in: ["connection-a"] } },
                { departmentId: { in: ["department-a"] } },
                {
                  OR: [{ assignedMembershipId: "membership-a" }, { assignedMembershipId: null }],
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it("returns closure date and the author of the latest closure message with assignee fallback", async () => {
    const closedAt = new Date("2026-10-20T18:30:00.000Z");
    const baseConversation = {
      tenantId: "tenant-a",
      contactId: "contact-a",
      departmentId: "department-a",
      assignedMembershipId: "membership-fallback",
      assignedMembershipNameSnapshot: null,
      status: "FECHADA",
      protocol: "000123",
      createdAt: new Date("2026-10-20T15:00:00.000Z"),
      updatedAt: closedAt,
      closedAt,
      lastMessageAt: closedAt,
      lastMessagePreview: "Conversa encerrada",
      unreadCount: 0,
      conversationType: "DIRECT",
      groupName: null,
      contact: {
        id: "contact-a",
        name: "Cliente",
        phone: "5562999990000",
        customer: null,
        customFieldValues: [],
      },
      department: { id: "department-a", name: "Suporte", color: "#123456" },
      assignedMembership: {
        id: "membership-fallback",
        presentationName: "Atendente atual",
        user: { id: "user-fallback", name: "Fallback", email: "fallback@example.com" },
      },
      connection: { id: "connection-a", name: "WhatsApp Principal", status: "CONNECTED" },
    };
    const closureMembership = {
      id: "membership-closer",
      presentationName: "Natã Rabelo",
      user: { id: "user-closer", name: "Nome global", email: "closer@example.com" },
    };
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      conversation: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...baseConversation,
            id: "conversation-with-message",
            messages: [{ authorMembership: closureMembership }],
          },
          { ...baseConversation, id: "conversation-with-fallback", messages: [] },
          {
            ...baseConversation,
            id: "conversation-with-deleted-assignee",
            assignedMembershipId: null,
            assignedMembershipNameSnapshot: "Atendente excluído",
            assignedMembership: null,
            messages: [{ authorMembership: null, participantName: "Encerrador excluído" }],
          },
          {
            ...baseConversation,
            id: "conversation-with-deleted-closer-and-active-assignee",
            messages: [{ authorMembership: null, participantName: "Outro encerrador excluído" }],
          },
        ]),
        count: vi.fn().mockResolvedValue(4),
      },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const service = new OperationsService(prisma as never, {} as never);

    const result = await service.history(
      {
        tenantId: "tenant-a",
        membershipId: "membership-a",
        roleKey: "tenant_admin",
        permissions: ["chat.phone.read"],
      } as never,
      { period: "30d" },
    );

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          messages: expect.objectContaining({
            orderBy: { createdAt: "desc" },
            take: 1,
          }),
        }),
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        closed_at: "2026-10-20T18:30:00.000Z",
        closed_by: {
          id: "user-closer",
          membershipId: "membership-closer",
          nome: "Natã Rabelo",
          email: "closer@example.com",
        },
      }),
    );
    expect(result.items[1].closed_by).toEqual({
      id: "user-fallback",
      membershipId: "membership-fallback",
      nome: "Atendente atual",
      email: "fallback@example.com",
    });
    expect(result.items[2]).toEqual(
      expect.objectContaining({
        assigned_membership_id: null,
        assigned_membership_name_snapshot: "Atendente excluído",
        agent: null,
        closed_by: {
          id: null,
          membershipId: null,
          nome: "Encerrador excluído",
          email: null,
        },
      }),
    );
    expect(result.items[3].closed_by).toEqual({
      id: null,
      membershipId: null,
      nome: "Outro encerrador excluído",
      email: null,
    });
  });

  it.each([
    [[], false],
    [["contacts.additional_fields.read"], true],
  ] as const)(
    "applies additional-field permission in history for %j",
    async (permissions, allowed) => {
      const now = new Date("2026-10-06T12:00:00.000Z");
      const conversation = {
        id: "conversation-a",
        tenantId: "tenant-a",
        contactId: "contact-a",
        departmentId: null,
        assignedMembershipId: null,
        status: "FECHADA",
        protocol: "000001",
        createdAt: now,
        updatedAt: now,
        closedAt: now,
        lastMessageAt: now,
        lastMessagePreview: "Encerrada",
        unreadCount: 0,
        conversationType: "GROUP",
        groupName: "Equipe Norte",
        contact: {
          id: "contact-a",
          name: "Ana",
          phone: "5511999990000",
          customer: null,
          customFieldValues: [
            {
              tenantId: "tenant-a",
              fieldId: "field-a",
              value: "segredo",
              field: {
                tenantId: "tenant-a",
                label: "Código",
                variableKey: "codigo",
                type: "TEXT",
                mask: null,
              },
            },
            {
              tenantId: "tenant-b",
              fieldId: "field-b",
              value: "outra-tenant",
              field: {
                tenantId: "tenant-b",
                label: "Código B",
                variableKey: "codigo_b",
                type: "TEXT",
                mask: null,
              },
            },
          ],
        },
        department: null,
        assignedMembership: null,
        connection: null,
      };
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
        conversation: {
          findMany: vi.fn().mockResolvedValue([conversation]),
          count: vi.fn().mockResolvedValue(1),
        },
        $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
      };
      const service = new OperationsService(prisma as never, {} as never);

      const result = await service.history(
        {
          tenantId: "tenant-a",
          membershipId: "membership-a",
          roleKey: "agent",
          connectionIds: [],
          chatDepartmentIds: [],
          permissions: [...permissions],
        } as never,
        { period: "30d" },
      );
      const serialized = result.items[0].contact as Record<string, unknown>;
      expect(result.items[0]).toEqual(
        expect.objectContaining({ is_group: true, group_name: "Equipe Norte" }),
      );
      if (!allowed) {
        expect(serialized).not.toHaveProperty("customFields");
        expect(serialized).not.toHaveProperty("customFieldValues");
        expect(JSON.stringify(result)).not.toContain("variableKey");
      } else {
        expect(serialized.customFields).toEqual({ "field-a": "segredo" });
        expect(serialized.customFieldValues).toEqual([
          expect.objectContaining({ variableKey: "codigo", value: "segredo" }),
        ]);
        expect(JSON.stringify(result)).not.toContain("codigo_b");
      }
    },
  );
});

describe("dashboard ticket requester ranking", () => {
  it("returns the tenant-scoped global top 10 contacts regardless of the selected period", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      ticket: {
        groupBy: vi.fn().mockResolvedValue([
          { requesterContactId: "contact-b", _count: { _all: 7 } },
          { requesterContactId: "contact-a", _count: { _all: 3 } },
        ]),
      },
      contact: {
        findMany: vi.fn().mockResolvedValue([
          { id: "contact-a", name: "Ana" },
          { id: "contact-b", name: "Bruno" },
        ]),
      },
    };
    const service = new OperationsService(prisma as never, {} as never);

    const result = await service.dashboardComponentData(
      { tenantId: "tenant-a", roleKey: "tenant_admin" } as never,
      {
        period: "custom",
        start: "2026-10-01",
        end: "2026-10-07",
        groupBy: "ticketRequesterContact",
        customerId: "customer-a",
        departmentId: "department-a",
        assignedMembershipId: "membership-a",
        connectionId: "connection-a",
      },
    );

    expect(prisma.ticket.groupBy).toHaveBeenCalledWith({
      by: ["requesterContactId"],
      where: {
        tenantId: "tenant-a",
        archivedAt: null,
        requesterContactId: { not: null },
        requesterContact: { is: { archivedAt: null } },
        customerId: "customer-a",
        departmentId: "department-a",
        assignedMembershipId: "membership-a",
        conversation: { is: { connectionId: "connection-a" } },
      },
      _count: { _all: true },
      orderBy: [{ _count: { requesterContactId: "desc" } }, { requesterContactId: "asc" }],
      take: 10,
    });
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        archivedAt: null,
        id: { in: ["contact-b", "contact-a"] },
      },
      select: { id: true, name: true },
    });
    expect(result.items).toEqual([
      { nome: "Bruno", total: 7 },
      { nome: "Ana", total: 3 },
    ]);
  });
});

describe("dashboard configurable contact data", () => {
  it("groups contact departments from the customer department source", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      contact: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { customerDepartmentId: "customer-department-a", _count: { _all: 2 } },
          ])
          .mockResolvedValueOnce([
            { contactDepartmentId: "legacy-department-a", _count: { _all: 1 } },
            { contactDepartmentId: null, _count: { _all: 1 } },
          ]),
      },
      customerDepartment: {
        findMany: vi.fn().mockResolvedValue([{ id: "customer-department-a", name: "Financeiro" }]),
      },
      contactDepartment: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "legacy-department-a", name: "Comercial", color: "#123456" }]),
      },
    };
    const service = new OperationsService(prisma as never, {} as never);

    const result = await service.dashboardComponentData(
      { tenantId: "tenant-a", roleKey: "tenant_admin" } as never,
      { period: "today", groupBy: "department" },
    );

    expect(prisma.contact.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ by: ["customerDepartmentId"] }),
    );
    expect(prisma.customerDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a" }) }),
    );
    expect(result.items).toEqual([
      { nome: "Financeiro", total: 2, cor: "#64748b" },
      { nome: "Comercial", total: 1, cor: "#123456" },
      { nome: "Sem departamento", total: 1, cor: "#64748b" },
    ]);
  });

  it("rejects custom-field grouping without the specific permission", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      contactCustomField: { findFirst: vi.fn() },
    };
    const service = new OperationsService(prisma as never, {} as never);

    await expect(
      service.dashboardComponentData(
        { tenantId: "tenant-a", roleKey: "agent", permissions: ["contacts.read"] } as never,
        { period: "today", groupBy: "custom:field-a" },
      ),
    ).rejects.toThrow("Sem permissão para consultar campos adicionais.");
    expect(prisma.contactCustomField.findFirst).not.toHaveBeenCalled();
  });

  it("keeps operational chat departments separate from contact dashboard data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T15:00:00.000Z"));
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      contact: {
        groupBy: vi.fn().mockResolvedValue([
          { customerId: "customer-a", _count: { _all: 3 } },
          { customerId: null, _count: { _all: 1 } },
        ]),
      },
      customer: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "customer-a", name: "Empresa A", color: "#2563eb" }]),
      },
    };
    const service = new OperationsService(prisma as never, {} as never);

    const result = await service.dashboardComponentData(
      {
        tenantId: "tenant-a",
        roleKey: "agent",
        connectionIds: ["connection-a"],
        chatDepartmentIds: ["department-a"],
      } as never,
      {
        period: "today",
        groupBy: "customer",
        departmentId: "department-a",
      },
    );

    expect(prisma.contact.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["customerId"],
        where: expect.objectContaining({
          tenantId: "tenant-a",
          archivedAt: null,
          instanceIds: { hasSome: ["connection-a"] },
        }),
        take: 20,
      }),
    );
    expect(prisma.contact.groupBy.mock.calls[0]?.[0].where).not.toHaveProperty("departmentId");
    expect(result.items).toEqual([
      { nome: "Empresa A", total: 3, cor: "#2563eb" },
      { nome: "Sem empresa", total: 1, cor: "#64748b" },
    ]);
  });

  it("rejects personalized fields that do not belong to the current tenant", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      contactCustomField: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new OperationsService(prisma as never, {} as never);

    await expect(
      service.dashboardComponentData(
        {
          tenantId: "tenant-a",
          roleKey: "tenant_admin",
          permissions: ["contacts.additional_fields.read"],
        } as never,
        {
          period: "today",
          groupBy: "custom:field-from-another-tenant",
        },
      ),
    ).rejects.toThrow("Campo personalizado inválido.");
  });

  it("includes contacts without a value in personalized field groups", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      contactCustomField: { findFirst: vi.fn().mockResolvedValue({ id: "field-a" }) },
      contactCustomFieldValue: {
        groupBy: vi.fn().mockResolvedValue([
          { value: "Instagram", _count: { _all: 3 } },
          { value: "", _count: { _all: 1 } },
        ]),
      },
      contact: { count: vi.fn().mockResolvedValue(2) },
    };
    const service = new OperationsService(prisma as never, {} as never);

    const result = await service.dashboardComponentData(
      {
        tenantId: "tenant-a",
        roleKey: "tenant_admin",
        permissions: ["contacts.additional_fields.read"],
      } as never,
      { period: "today", groupBy: "custom:field-a" },
    );

    expect(prisma.contact.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "tenant-a",
        customFieldValues: { none: { fieldId: "field-a" } },
      }),
    });
    expect(result.items).toEqual([
      { nome: "Instagram", total: 3 },
      { nome: "Não informado", total: 3 },
    ]);
  });
});
