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
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
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
      nativeRevision: 5,
      components: [
        {
          ...ranking,
          visualization: "table",
          columns: 1,
          title: "Top 10 contatos que mais abrem conversas",
          dataSource: "conversations",
          groupBy: "conversationContact",
        },
      ],
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
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

describe("dashboard conversation contact ranking", () => {
  function fixture(rows: Array<{ contactId: string; _count: { _all: number } }> = []) {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      conversation: { groupBy: vi.fn().mockResolvedValue(rows) },
      contact: {
        findMany: vi.fn().mockResolvedValue([
          { id: "contact-b", name: "Contato B" },
          { id: "contact-a", name: "Contato A" },
        ]),
      },
      ticket: { groupBy: vi.fn() },
    };
    return { prisma, service: new OperationsService(prisma as never, {} as never) };
  }
  const query = {
    groupBy: "conversationContact",
    period: "custom" as const,
    start: "2026-10-01",
    end: "2026-10-07",
  };
  const admin = {
    tenantId: "tenant-a",
    roleKey: "tenant_admin",
    permissions: ["chat.conversations.view_all_active"],
  } as never;

  it("counts conversations by contact in the tenant timezone without requiring status or protocol", async () => {
    const f = fixture([
      { contactId: "contact-b", _count: { _all: 7 } },
      { contactId: "contact-a", _count: { _all: 3 } },
    ]);
    const result = await f.service.dashboardComponentData(admin, { ...query, status: "fechada" });
    const input = f.prisma.conversation.groupBy.mock.calls[0][0];
    expect(input).toMatchObject({
      by: ["contactId"],
      _count: { _all: true },
      take: 10,
      orderBy: [{ _count: { contactId: "desc" } }, { contactId: "asc" }],
      where: {
        tenantId: "tenant-a",
        archivedAt: null,
        isGroup: false,
        conversationType: "DIRECT",
        createdAt: { gte: new Date("2026-10-01T03:00:00Z"), lt: new Date("2026-10-08T03:00:00Z") },
        contact: { is: { tenantId: "tenant-a", archivedAt: null } },
      },
    });
    expect(input.where).not.toHaveProperty("status");
    expect(input.where).not.toHaveProperty("protocol");
    expect(input.where).not.toHaveProperty("closedAt");
    expect(f.prisma.contact.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", archivedAt: null, id: { in: ["contact-b", "contact-a"] } },
      select: { id: true, name: true },
    });
    expect(result.items).toEqual([
      { nome: "Contato B", total: 7 },
      { nome: "Contato A", total: 3 },
    ]);
    expect(f.prisma.ticket.groupBy).not.toHaveBeenCalled();
  });

  it("intersects explicit filters with common-user visibility and connection/department scopes", async () => {
    const f = fixture();
    await f.service.dashboardComponentData(
      {
        tenantId: "tenant-a",
        roleKey: "agent",
        membershipId: "member-a",
        connectionIds: ["allowed-connection"],
        chatDepartmentIds: ["allowed-department"],
        permissions: [],
      } as never,
      {
        ...query,
        customerId: "customer-a",
        contactId: "contact-a",
        connectionId: "requested-connection",
        departmentId: "requested-department",
        assignedMembershipId: "member-a",
        conversationId: "conversation-a",
      },
    );
    const where = f.prisma.conversation.groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: "tenant-a",
      connectionId: "requested-connection",
      departmentId: "requested-department",
      assignedMembershipId: "member-a",
      contactId: "contact-a",
      id: "conversation-a",
      contact: { is: { tenantId: "tenant-a", archivedAt: null, customerId: "customer-a" } },
      AND: [
        {
          AND: [
            { connectionId: { in: ["allowed-connection"] } },
            { departmentId: { in: ["allowed-department"] } },
            { OR: [{ assignedMembershipId: "member-a" }, { assignedMembershipId: null }] },
          ],
        },
        { connectionId: { in: ["allowed-connection"] } },
        { departmentId: { in: ["allowed-department"] } },
      ],
    });
  });

  it("retains empty scopes rather than turning them into unrestricted access", async () => {
    const f = fixture();
    await f.service.dashboardComponentData(
      { tenantId: "tenant-a", roleKey: "agent", connectionIds: [], chatDepartmentIds: [] } as never,
      query,
    );
    expect(f.prisma.conversation.groupBy.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([{ connectionId: { in: [] } }, { departmentId: { in: [] } }]),
    );
  });

  it("does not rank virtual group contacts when groups are explicitly selected", async () => {
    const f = fixture();
    await expect(
      f.service.dashboardComponentData(admin, { ...query, conversationType: "groups" }),
    ).resolves.toEqual({ items: [] });
    expect(f.prisma.conversation.groupBy).not.toHaveBeenCalled();
    expect(f.prisma.contact.findMany).not.toHaveBeenCalled();
  });
});

describe("native contact ranking revision five", () => {
  const ranking = {
    id: "ticketRequesterRanking",
    title: "Top 10 contatos que abriram chamados",
    visible: false,
    visualization: "bars",
    columns: 3,
    dataSource: "records",
    groupBy: "ticketRequesterContact",
    valueMode: "count",
  };
  async function normalize(components: unknown[], nativeRevision = 4) {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    return new OperationsService(prisma as never, {} as never).updateDashboardConfiguration(
      { tenantId: "tenant-a" } as never,
      { version: 2, nativeRevision, components },
    );
  }
  it("migrates the stable native ID while preserving layout and visibility", async () => {
    const result = await normalize([ranking]);
    expect(result.configuration).toEqual({
      version: 2,
      nativeRevision: 5,
      components: [
        {
          ...ranking,
          title: "Top 10 contatos que mais abrem conversas",
          dataSource: "conversations",
          groupBy: "conversationContact",
        },
      ],
    });
  });
  it("preserves custom titles", async () => {
    const result = await normalize([{ ...ranking, title: "Meu ranking" }]);
    expect(result.configuration.components[0]).toMatchObject({
      title: "Meu ranking",
      groupBy: "conversationContact",
    });
  });
  it.each([1, 4])(
    "leaves custom ticket components and repurposed native IDs unchanged at revision %s",
    async (revision) => {
      const components = [
        { ...ranking, id: "custom-ticket-ranking" },
        { ...ranking, dataSource: "contacts", groupBy: "department" },
      ];
      expect((await normalize(components, revision)).configuration.components).toEqual(components);
    },
  );
  it("accepts revision five without re-migrating intentionally configured components", async () => {
    expect((await normalize([ranking], 5)).configuration.components).toEqual([ranking]);
  });
  it("rejects revisions newer than supported", async () => {
    await expect(normalize([ranking], 6)).rejects.toThrow("Revisão da configuração");
  });
});

describe("history contact avatar projection", () => {
  const cases = [
    {
      isGroup: false,
      avatarUrl: "https://avatar.test/contact.png",
      groupImageUrl: null,
      expected: "https://avatar.test/contact.png",
    },
    { isGroup: false, avatarUrl: null, groupImageUrl: null, expected: null },
    {
      isGroup: true,
      avatarUrl: "https://avatar.test/contact.png",
      groupImageUrl: "https://avatar.test/group.png",
      expected: "https://avatar.test/group.png",
    },
    {
      isGroup: true,
      avatarUrl: "https://avatar.test/contact.png",
      groupImageUrl: null,
      expected: "https://avatar.test/contact.png",
    },
    { isGroup: true, avatarUrl: null, groupImageUrl: null, expected: null },
  ];
  function fixture(input: (typeof cases)[number]) {
    const conversation = {
      id: "conversation-a",
      tenantId: "tenant-a",
      contactId: "contact-a",
      departmentId: null,
      assignedMembershipId: null,
      assignedMembership: null,
      status: "FECHADA",
      protocol: "000001",
      isGroup: input.isGroup,
      conversationType: input.isGroup ? "GROUP" : "DIRECT",
      groupImageUrl: input.groupImageUrl,
      groupName: input.isGroup ? "Grupo sintético" : null,
      createdAt: new Date("2026-10-20T15:00:00Z"),
      updatedAt: new Date("2026-10-20T18:00:00Z"),
      closedAt: new Date("2026-10-20T18:00:00Z"),
      lastMessageAt: null,
      lastMessagePreview: "Conversa encerrada",
      unreadCount: 0,
      contact: {
        id: "contact-a",
        name: "Contato sintético",
        phone: "5511999990000",
        avatarUrl: input.avatarUrl,
        customer: null,
        customFieldValues: [],
      },
      department: null,
      connection: null,
      messages: [],
    };
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      conversation: {
        findMany: vi.fn().mockResolvedValue([conversation]),
        count: vi.fn().mockResolvedValue(1),
        findFirstOrThrow: vi.fn().mockResolvedValue(conversation),
      },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
      lead: { findFirst: vi.fn().mockResolvedValue(null) },
      message: { findMany: vi.fn().mockResolvedValue([]) },
      ticket: { findMany: vi.fn().mockResolvedValue([]) },
    };
    return { prisma, conversation, service: new OperationsService(prisma as never, {} as never) };
  }
  const current = {
    tenantId: "tenant-a",
    roleKey: "agent",
    membershipId: "member-a",
    connectionIds: ["connection-a"],
    chatDepartmentIds: ["department-a"],
    permissions: [],
  } as never;

  it.each(cases)("preserves avatar in closed history with group fallback: %j", async (input) => {
    const f = fixture(input);
    const result = await f.service.history(current, { period: "30d" });
    expect(result.items[0].contact.avatar_url).toBe(input.expected);
    expect(result.items[0].contact.telefone).toBeNull();
    expect(f.prisma.conversation.findMany.mock.calls[0][0].where.AND).toEqual([
      expect.objectContaining({ tenantId: "tenant-a", archivedAt: null, status: "FECHADA" }),
      {
        AND: [
          { connectionId: { in: ["connection-a"] } },
          { departmentId: { in: ["department-a"] } },
          { OR: [{ assignedMembershipId: "member-a" }, { assignedMembershipId: null }] },
        ],
      },
    ]);
  });

  it.each(cases)("preserves avatar in the timeline projection: %j", async (input) => {
    const f = fixture(input);
    const result = await f.service.timeline(current, "conversation-a");
    expect(result.conversation.contact.avatar_url).toBe(input.expected);
    expect(result.conversation.contact.telefone).toBeNull();
    expect(f.prisma.conversation.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ id: "conversation-a", tenantId: "tenant-a" }, expect.any(Object)] },
      }),
    );
  });
  it.each(["#9A12BC", null, undefined])(
    "preserves configured instance color in history and timeline: %j",
    async (color) => {
      const f = fixture(cases[0]);
      Object.assign(f.conversation, {
        connection: { id: "connection-a", name: "Instância sintética", status: "CONNECTED", color },
      });
      const history = await f.service.history(current, { period: "30d" });
      const timeline = await f.service.timeline(current, "conversation-a");
      for (const conversation of [history.items[0], timeline.conversation]) {
        expect(conversation.connection).toEqual({
          id: "connection-a",
          name: "Instância sintética",
          status: "connected",
          color: color ?? null,
        });
        expect(conversation.contact.telefone).toBeNull();
      }
      expect(f.prisma.conversation.findMany.mock.calls[0][0].where.AND[0]).toMatchObject({
        tenantId: "tenant-a",
      });
      expect(f.prisma.conversation.findFirstOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ id: "conversation-a", tenantId: "tenant-a" }, expect.any(Object)] },
        }),
      );
    },
  );

  it("keeps an absent instance null in history and timeline", async () => {
    const f = fixture(cases[0]);
    const history = await f.service.history(current, { period: "30d" });
    const timeline = await f.service.timeline(current, "conversation-a");
    expect(history.items[0].connection).toBeNull();
    expect(timeline.conversation.connection).toBeNull();
  });
});

describe("history closure author filter", () => {
  const current = {
    tenantId: "tenant-a",
    membershipId: "viewer",
    roleKey: "tenant_admin",
    permissions: [],
  } as never;
  function fixture(ids = ["conversation-a", "conversation-b"]) {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      conversation: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(ids.map((id) => ({ id })))
          .mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(1),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        { conversationId: "conversation-a", authorMembershipId: "closer-a" },
        { conversationId: "conversation-b", authorMembershipId: null },
      ]),
      tenantMembership: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "closer-a",
            presentationName: "Atendente histórico",
            user: { name: "Nome global" },
          },
        ]),
      },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    return { prisma, service: new OperationsService(prisma as never, {} as never) };
  }
  it("filters by real latest closure before count/pagination and derives options independently", async () => {
    const { prisma, service } = fixture();
    const result = await service.history(current, {
      closedByMembershipId: "closer-a",
      includeClosedByOptions: true,
      status: "fechada",
      page: 2,
      pageSize: 10,
    });
    expect(result.closedByOptions).toEqual([
      { membershipId: "closer-a", name: "Atendente histórico" },
    ]);
    const where = prisma.conversation.count.mock.calls[0][0].where;
    expect(where.AND[1]).toEqual({ id: { in: ["conversation-a"] } });
    expect(prisma.conversation.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where, skip: 10, take: 10 }),
    );
    expect(prisma.conversation.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({ select: { id: true } }),
    );
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(["tenant-a", ["conversation-a", "conversation-b"]]);
    expect(sql.sql).toContain('ORDER BY m."conversationId", m."createdAt" DESC, m.id DESC');
    expect(sql.sql).toContain("DISTINCT ON");
    expect(prisma.tenantMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-a", id: { in: ["closer-a"] } } }),
    );
  });
  it("does not substitute current assignee or snapshot when no matching real author exists", async () => {
    const { prisma, service } = fixture();
    await service.history(current, { closedByMembershipId: "assigned-but-not-closer" });
    expect(prisma.conversation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.arrayContaining([{ id: { in: [] } }]) }),
      }),
    );
    expect(prisma.tenantMembership.findMany).not.toHaveBeenCalled();
  });
  it("does not query messages for an empty visible scope", async () => {
    const { prisma, service } = fixture([]);
    const result = await service.history(current, { includeClosedByOptions: true });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.closedByOptions).toEqual([]);
    expect(prisma.tenantMembership.findMany).not.toHaveBeenCalled();
  });
});
