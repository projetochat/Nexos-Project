import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import {
  ConversationStatus,
  LeadStatus,
  MessagingConnectionStatus,
  MessageDirection,
  Prisma,
  TicketStatus,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { closedConversationWhere, OperationsMetricsService } from "./operations-metrics.service";

type OperationalQuery = {
  period?: "today" | "yesterday" | "7d" | "30d" | "custom";
  start?: string;
  end?: string;
  q?: string;
  departmentId?: string;
  assignedMembershipId?: string;
  status?: string;
  customerId?: string;
  contactId?: string;
  page?: number;
  pageSize?: number;
  format?: "csv" | "xlsx" | "pdf";
};

const conversationInclude = {
  contact: { include: { customer: true } },
  department: true,
  assignedMembership: { include: { user: { select: { id: true, name: true, email: true } } } },
  connection: true,
} satisfies Prisma.ConversationInclude;

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OperationsMetricsService) private readonly metrics: OperationsMetricsService,
  ) {}

  async dashboard(current: AuthenticatedUser, query: OperationalQuery) {
    const range = periodRange(query);
    const previous = previousRange(range);
    this.logger.log({
      event: "operations.dashboard.query",
      tenantId: current.tenantId,
      period: query.period ?? "today",
    });
    const [now, before, charts, recent] = await Promise.all([
      this.metrics.snapshot(current.tenantId, range, query),
      this.metrics.snapshot(current.tenantId, previous, query),
      this.metrics.chartData(current.tenantId, range, query),
      this.recentConversations(current.tenantId),
    ]);
    return {
      range: serializeRange(range),
      kpis: withComparison(now, before),
      charts,
      recent,
      semantics: this.metrics.semantics(),
    };
  }

  async history(current: AuthenticatedUser, query: OperationalQuery) {
    const range = periodRange(query, "30d");
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = conversationWhere(current.tenantId, query, range);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: conversationInclude,
        orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
        skip: Number((page - 1) * pageSize),
        take: Number(pageSize),
      }),
      this.prisma.conversation.count({ where }),
    ]);
    this.logger.log({
      event: "operations.history.query",
      tenantId: current.tenantId,
      resultCount: items.length,
      page,
      pageSize,
    });
    return {
      items: items.map(serializeConversation),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async timeline(current: AuthenticatedUser, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirstOrThrow({
      where: { id: conversationId, tenantId: current.tenantId },
      include: conversationInclude,
    });
    const [lead, messages, tickets] = await Promise.all([
      this.prisma.lead.findFirst({ where: { tenantId: current.tenantId, conversationId } }),
      this.prisma.message.findMany({
        where: { tenantId: current.tenantId, conversationId },
        include: {
          authorMembership: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.ticket.findMany({
        where: { tenantId: current.tenantId, conversationId },
        include: { createdByMembership: { include: { user: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const events = [
      {
        at: conversation.createdAt,
        event: "conversation.created",
        origin: "system",
        user: null,
        description: "Conversa criada",
      },
      ...(lead
        ? [
            {
              at: lead.createdAt,
              event: "lead.created",
              origin: lead.source.toLowerCase(),
              user: null,
              description: "Lead criado",
            },
          ]
        : []),
      ...messages.map((message) => ({
        at: message.createdAt,
        event:
          message.direction === MessageDirection.SYSTEM
            ? "conversation.event"
            : message.direction === MessageDirection.INBOUND
              ? "message.inbound"
              : "message.outbound",
        origin: message.direction.toLowerCase(),
        user: message.authorMembership?.user.name ?? null,
        description:
          message.direction === MessageDirection.SYSTEM
            ? (message.content ?? "")
            : "Mensagem registrada",
      })),
      ...tickets.map((ticket) => ({
        at: ticket.createdAt,
        event: "ticket.created",
        origin: "ticket",
        user: ticket.createdByMembership.user.name,
        description: `Chamado ${ticket.protocol} criado`,
      })),
      ...(conversation.closedAt
        ? [
            {
              at: conversation.closedAt,
              event: "conversation.closed",
              origin: "system",
              user: conversation.assignedMembership?.user.name ?? null,
              description: "Conversa encerrada",
            },
          ]
        : []),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    return {
      conversation: serializeConversation(conversation),
      items: events.map((item) => ({ ...item, at: item.at.toISOString() })),
    };
  }

  async report(current: AuthenticatedUser, query: OperationalQuery) {
    const range = periodRange(query, "30d");
    const [snapshot, charts, conversations] = await Promise.all([
      this.metrics.snapshot(current.tenantId, range, query),
      this.metrics.chartData(current.tenantId, range, query),
      this.history(current, { ...query, pageSize: query.pageSize ?? 50 }),
    ]);
    this.logger.log({
      event: "operations.report.query",
      tenantId: current.tenantId,
      total: conversations.total,
    });
    return {
      range: serializeRange(range),
      kpis: snapshot,
      charts,
      conversations,
      semantics: this.metrics.semantics(),
    };
  }

  async exportReport(current: AuthenticatedUser, query: OperationalQuery) {
    const report = await this.report(current, { ...query, pageSize: 100 });
    const rows = report.conversations.items.map((item) => ({
      protocolo: item.protocolo ?? "",
      contato: item.contact?.nome ?? "",
      cliente: item.contact?.customer?.nome ?? "",
      departamento: item.department?.nome ?? "",
      atendente: item.agent?.nome ?? "",
      status: item.status,
      criadoEm: item.created_at,
      ultimaMensagemEm: item.last_message_at,
    }));
    const format = query.format ?? "csv";
    if (format === "pdf") {
      return {
        body: pdf(rows),
        contentType: "application/pdf",
        filename: "nexos-atendimento.pdf",
      };
    }
    if (format === "xlsx") {
      return {
        body: excelHtml(rows),
        contentType: "application/vnd.ms-excel; charset=utf-8",
        filename: "nexos-atendimento.xls",
      };
    }
    return {
      body: csv(rows),
      contentType: "text/csv; charset=utf-8",
      filename: "nexos-atendimento.csv",
    };
  }

  async queues(current: AuthenticatedUser, query: OperationalQuery) {
    const range = periodRange(query, "30d");
    const departments = await this.prisma.department.findMany({
      where: { tenantId: current.tenantId, active: true },
      include: {
        members: { include: { membership: { include: { user: true } } } },
      },
      orderBy: { name: "asc" },
    });
    const result = await Promise.all(
      departments.map(async (department) => {
        const [leadCount, activeCount, closedCount, transferCount, closedRows] = await Promise.all([
          this.prisma.lead.count({
            where: {
              tenantId: current.tenantId,
              departmentId: department.id,
              status: { in: [LeadStatus.NEW, LeadStatus.QUEUED, LeadStatus.ASSIGNED] },
              conversation: {
                archivedAt: null,
                OR: [{ status: { not: ConversationStatus.FECHADA } }, { closedAt: null }],
              },
            },
          }),
          this.prisma.conversation.count({
            where: {
              tenantId: current.tenantId,
              departmentId: department.id,
              status: { in: [ConversationStatus.ABERTA, ConversationStatus.EM_ANDAMENTO] },
              archivedAt: null,
            },
          }),
          this.prisma.conversation.count({
            where: {
              ...closedConversationWhere(current.tenantId, range),
              departmentId: department.id,
            },
          }),
          this.prisma.message.count({
            where: {
              tenantId: current.tenantId,
              direction: MessageDirection.SYSTEM,
              createdAt: { gte: range.start, lt: range.end },
              content: { contains: "transfer", mode: "insensitive" },
              conversation: { departmentId: department.id },
            },
          }),
          this.prisma.conversation.findMany({
            where: {
              ...closedConversationWhere(current.tenantId, range),
              departmentId: department.id,
            },
            select: { createdAt: true, closedAt: true },
          }),
        ]);
        const capacity = Math.max(1, department.members.length * 5);
        const tempoMedioMinutos = averageMinutes(
          closedRows
            .map((row) => (row.closedAt ? row.closedAt.getTime() - row.createdAt.getTime() : null))
            .filter((value): value is number => value !== null && value >= 0),
        );
        return {
          id: department.id,
          nome: department.name,
          cor: department.color,
          prioridade: leadCount > capacity ? "alta" : leadCount > 0 ? "normal" : "baixa",
          quantidade: leadCount + activeCount,
          leads: leadCount,
          conversasAtivas: activeCount,
          conversasEncerradas: closedCount,
          transferencias: transferCount,
          atendentes: department.members.length,
          capacidade: capacity,
          sla: percentage(Math.max(0, capacity - leadCount), capacity),
          tempoMedioMinutos,
        };
      }),
    );
    return { items: result };
  }

  private async snapshot(tenantId: string, range: { start: Date; end: Date }) {
    const [
      abertas,
      encerradas,
      aguardando,
      emAtendimento,
      novosLeads,
      leadsConvertidos,
      leadsPerdidos,
      mensagensEnviadas,
      mensagensRecebidas,
      chamadosCriados,
      chamadosResolvidos,
      clientesAtivos,
      contatosAtivos,
      departamentosAtivos,
      instanciasConectadas,
      firstResponseRows,
      attendanceRows,
    ] = await this.prisma.$transaction([
      this.prisma.conversation.count({
        where: { tenantId, status: ConversationStatus.ABERTA, archivedAt: null },
      }),
      this.prisma.conversation.count({
        where: {
          tenantId,
          status: ConversationStatus.FECHADA,
          closedAt: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.conversation.count({
        where: { tenantId, status: ConversationStatus.AGUARDANDO, archivedAt: null },
      }),
      this.prisma.conversation.count({
        where: { tenantId, status: ConversationStatus.EM_ANDAMENTO, archivedAt: null },
      }),
      this.prisma.lead.count({
        where: { tenantId, createdAt: { gte: range.start, lt: range.end } },
      }),
      this.prisma.lead.count({
        where: {
          tenantId,
          status: LeadStatus.CONVERTED,
          updatedAt: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.lead.count({
        where: {
          tenantId,
          status: LeadStatus.DISCARDED,
          updatedAt: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.message.count({
        where: {
          tenantId,
          direction: MessageDirection.OUTBOUND,
          createdAt: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.message.count({
        where: {
          tenantId,
          direction: MessageDirection.INBOUND,
          createdAt: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.ticket.count({
        where: { tenantId, createdAt: { gte: range.start, lt: range.end }, archivedAt: null },
      }),
      this.prisma.ticket.count({
        where: {
          tenantId,
          status: { in: [TicketStatus.RESOLVIDO, TicketStatus.FECHADO] },
          updatedAt: { gte: range.start, lt: range.end },
          archivedAt: null,
        },
      }),
      this.prisma.customer.count({ where: { tenantId, archivedAt: null } }),
      this.prisma.contact.count({ where: { tenantId, archivedAt: null } }),
      this.prisma.department.count({ where: { tenantId, active: true } }),
      this.prisma.messagingConnection.count({
        where: { tenantId, status: MessagingConnectionStatus.CONNECTED, archivedAt: null },
      }),
      this.prisma.conversation.findMany({
        where: { tenantId, createdAt: { gte: range.start, lt: range.end }, archivedAt: null },
        select: {
          createdAt: true,
          messages: {
            where: { direction: MessageDirection.OUTBOUND },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      this.prisma.conversation.findMany({
        where: {
          tenantId,
          status: ConversationStatus.FECHADA,
          createdAt: { gte: range.start, lt: range.end },
          closedAt: { not: null },
          archivedAt: null,
        },
        select: { createdAt: true, closedAt: true },
      }),
    ]);
    const tempoMedioPrimeiraRespostaMin = averageMinutes(
      firstResponseRows
        .map((row) =>
          row.messages[0] ? row.messages[0].createdAt.getTime() - row.createdAt.getTime() : null,
        )
        .filter((value): value is number => value !== null && value >= 0),
    );
    const tempoMedioEncerramentoMin = averageMinutes(
      attendanceRows
        .map((row) => (row.closedAt ? row.closedAt.getTime() - row.createdAt.getTime() : null))
        .filter((value): value is number => value !== null && value >= 0),
    );
    return {
      conversasAbertas: abertas,
      conversasEncerradas: encerradas,
      conversasAguardando: aguardando,
      conversasEmAtendimento: emAtendimento,
      novosLeads,
      leadsConvertidos,
      leadsPerdidos,
      tempoMedioPrimeiraRespostaMin,
      tempoMedioAtendimentoMin: tempoMedioEncerramentoMin,
      tempoMedioEncerramentoMin,
      sla: percentage(encerradas, encerradas + aguardando + abertas),
      mensagensEnviadas,
      mensagensRecebidas,
      chamadosCriados,
      chamadosResolvidos,
      clientesAtivos,
      contatosAtivos,
      atendentesOcupados: emAtendimento,
      departamentosAtivos,
      instanciasConectadas,
    };
  }

  private async chartData(tenantId: string, range: { start: Date; end: Date }) {
    const [byDepartment, byAgent, byCustomer, byConnection] = await Promise.all([
      this.prisma.conversation.groupBy({
        by: ["departmentId"],
        where: { tenantId, createdAt: { gte: range.start, lt: range.end } },
        _count: { _all: true },
      }),
      this.prisma.conversation.groupBy({
        by: ["assignedMembershipId"],
        where: { tenantId, createdAt: { gte: range.start, lt: range.end } },
        _count: { _all: true },
      }),
      this.prisma.conversation.findMany({
        where: { tenantId, createdAt: { gte: range.start, lt: range.end } },
        select: {
          contact: { select: { customer: { select: { id: true, name: true, color: true } } } },
        },
      }),
      this.prisma.conversation.groupBy({
        by: ["connectionId"],
        where: { tenantId, createdAt: { gte: range.start, lt: range.end } },
        _count: { _all: true },
      }),
    ]);
    const [departments, memberships, connections] = await Promise.all([
      this.prisma.department.findMany({ where: { tenantId } }),
      this.prisma.tenantMembership.findMany({ where: { tenantId }, include: { user: true } }),
      this.prisma.messagingConnection.findMany({ where: { tenantId } }),
    ]);
    const customerCounts = new Map<string, { nome: string; cor: string; total: number }>();
    for (const row of byCustomer) {
      const customer = row.contact.customer;
      if (!customer) continue;
      const item = customerCounts.get(customer.id) ?? {
        nome: customer.name,
        cor: customer.color,
        total: 0,
      };
      item.total += 1;
      customerCounts.set(customer.id, item);
    }
    return {
      byDepartment: byDepartment.map((row) => {
        const department = departments.find((item) => item.id === row.departmentId);
        return {
          nome: department?.name ?? "Sem departamento",
          cor: department?.color ?? "#64748b",
          total: row._count._all,
        };
      }),
      byAgent: byAgent.map((row) => {
        const membership = memberships.find((item) => item.id === row.assignedMembershipId);
        return { nome: membership?.user.name ?? "Sem atendente", total: row._count._all };
      }),
      byCustomer: [...customerCounts.values()],
      byConnection: byConnection.map((row) => {
        const connection = connections.find((item) => item.id === row.connectionId);
        return { nome: connection?.name ?? "Sem instancia", total: row._count._all };
      }),
    };
  }

  private recentConversations(tenantId: string) {
    return this.prisma.conversation
      .findMany({
        where: { tenantId, archivedAt: null },
        include: conversationInclude,
        orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
        take: 8,
      })
      .then((items) => items.map(serializeConversation));
  }
}

function conversationWhere(
  tenantId: string,
  query: OperationalQuery,
  range: { start: Date; end: Date },
) {
  const where: Prisma.ConversationWhereInput = {
    ...closedConversationWhere(tenantId, range),
  };
  const status = parseConversationStatus(query.status);
  if (status && status !== ConversationStatus.FECHADA) {
    where.id = "__history_only_closed_conversations__";
  }
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.assignedMembershipId) where.assignedMembershipId = query.assignedMembershipId;
  if (query.contactId) where.contactId = query.contactId;
  if (query.customerId) where.contact = { customerId: query.customerId };
  const q = query.q?.trim();
  if (q) {
    where.AND = [
      {
        OR: [
          { protocol: { contains: q, mode: "insensitive" } },
          { lastMessagePreview: { contains: q, mode: "insensitive" } },
          { contact: { name: { contains: q, mode: "insensitive" } } },
          { contact: { phone: { contains: q, mode: "insensitive" } } },
          { assignedMembership: { user: { name: { contains: q, mode: "insensitive" } } } },
          { department: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
    ];
  }
  return where;
}

function parseConversationStatus(status?: string) {
  if (!status) return null;
  const normalized = status.trim().toUpperCase();
  if (!normalized) return null;
  if (!Object.values(ConversationStatus).includes(normalized as ConversationStatus)) {
    throw new BadRequestException({
      code: "OPERATIONS_STATUS_INVALID",
      message: "Status de conversa invalido.",
    });
  }
  return normalized as ConversationStatus;
}

function serializeConversation(
  conversation: Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>,
) {
  return {
    id: conversation.id,
    tenantId: conversation.tenantId,
    contact_id: conversation.contactId,
    department_id: conversation.departmentId,
    assigned_membership_id: conversation.assignedMembershipId,
    status: conversation.status.toLowerCase(),
    protocolo: conversation.protocol,
    created_at: conversation.createdAt.toISOString(),
    updated_at: conversation.updatedAt.toISOString(),
    closed_at: conversation.closedAt?.toISOString() ?? null,
    last_message_at: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
    lastMessagePreview: conversation.lastMessagePreview,
    unreadCount: conversation.unreadCount,
    contact: {
      id: conversation.contact.id,
      nome: conversation.contact.name,
      telefone: conversation.contact.phone,
      customer: conversation.contact.customer
        ? {
            id: conversation.contact.customer.id,
            nome: conversation.contact.customer.name,
            cor: conversation.contact.customer.color,
          }
        : null,
    },
    department: conversation.department
      ? {
          id: conversation.department.id,
          nome: conversation.department.name,
          cor: conversation.department.color,
        }
      : null,
    agent: conversation.assignedMembership
      ? {
          id: conversation.assignedMembership.user.id,
          membershipId: conversation.assignedMembership.id,
          nome: conversation.assignedMembership.user.name,
          email: conversation.assignedMembership.user.email,
        }
      : null,
    connection: conversation.connection
      ? {
          id: conversation.connection.id,
          name: conversation.connection.name,
          status: conversation.connection.status.toLowerCase(),
        }
      : null,
  };
}

function periodRange(query: OperationalQuery, fallback: OperationalQuery["period"] = "today") {
  const period = query.period ?? fallback;
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (period === "custom" && query.start && query.end) {
    return { start: new Date(query.start), end: new Date(query.end) };
  }
  if (period === "yesterday") {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - 1);
    return { start, end: startOfToday };
  }
  if (period === "7d" || period === "30d") {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - (period === "7d" ? 6 : 29));
    return { start, end: now };
  }
  return { start: startOfToday, end: now };
}

function previousRange(range: { start: Date; end: Date }) {
  const duration = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - duration), end: range.start };
}

function withComparison(
  current: Record<string, number | null>,
  previous: Record<string, number | null>,
) {
  return Object.fromEntries(
    Object.entries(current).map(([key, value]) => [
      key,
      {
        value,
        previous: previous[key] ?? null,
        changePercent: value === null ? null : percentChange(value, previous[key] ?? 0),
      },
    ]),
  );
}

function percentChange(value: number, previous: number) {
  if (previous === 0) return value === 0 ? 0 : 100;
  return Math.round(((value - previous) / previous) * 10_000) / 100;
}

function percentage(value: number, total: number) {
  if (total <= 0) return 100;
  return Math.round((value / total) * 10_000) / 100;
}

function averageMinutes(values: number[]) {
  if (values.length === 0) return null;
  const averageMs = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round((averageMs / 60_000) * 100) / 100;
}

function serializeRange(range: { start: Date; end: Date }) {
  return { start: range.start.toISOString(), end: range.end.toISOString() };
}

function csv(rows: Array<Record<string, string | number | null>>) {
  const headers = Object.keys(rows[0] ?? { vazio: "" });
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  return lines.join("\n");
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function excelHtml(rows: Array<Record<string, string | number | null>>) {
  const headers = Object.keys(rows[0] ?? { vazio: "" });
  const cells = (value: string | number | null | undefined) =>
    `<td>${escapeHtml(String(value ?? ""))}</td>`;
  return [
    '<html><head><meta charset="utf-8"></head><body><table>',
    `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`,
    `<tbody>${rows
      .map((row) => `<tr>${headers.map((header) => cells(row[header])).join("")}</tr>`)
      .join("")}</tbody>`,
    "</table></body></html>",
  ].join("");
}

function pdf(rows: Array<Record<string, string | number | null>>) {
  const lines = [
    "Nexos - Relatorio de atendimento",
    ...rows
      .slice(0, 60)
      .map((row) =>
        [row.protocolo, row.contato, row.cliente, row.departamento, row.status]
          .map((value) => String(value ?? ""))
          .join(" | "),
      ),
  ];
  const content = lines
    .map((line, index) => `BT /F1 9 Tf 40 ${780 - index * 12} Td (${escapePdf(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${object}\n`;
  }
  const xref = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return body;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapePdf(value: string) {
  return value.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?");
}
