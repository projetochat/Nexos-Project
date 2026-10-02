import { Inject, Injectable } from "@nestjs/common";
import {
  ConversationStatus,
  LeadStatus,
  MessagingConnectionStatus,
  MessageDirection,
  Prisma,
  TicketStatus,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { conversationQueueScope } from "../conversations/conversation-queue-scope";

export type OperationsRange = { start: Date; end: Date };
export type OperationsMetricFilters = {
  departmentId?: string;
  assignedMembershipId?: string;
  customerId?: string;
  connectionId?: string;
  allowedConnectionIds?: string[];
  allowedDepartmentIds?: string[];
  contactId?: string;
};

const ACTIVE_LEAD_STATUSES = [LeadStatus.NEW, LeadStatus.QUEUED, LeadStatus.ASSIGNED] as const;

@Injectable()
export class OperationsMetricsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async snapshot(tenantId: string, range: OperationsRange, filters: OperationsMetricFilters = {}) {
    const conversationScope = conversationMetricScope(tenantId, filters);
    const queueConversationScope: Prisma.ConversationWhereInput = {
      ...conversationScope,
      createdAt: { gte: range.start, lt: range.end },
    };
    const leadScope = leadMetricScope(tenantId, filters);
    const [
      abertas,
      encerradas,
      aguardando,
      emAtendimento,
      novosLeads,
      leadsAtivos,
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
      filaAtivas,
      filaStandby,
      filaFila,
      filaLeads,
      contadorAtivasAtuais,
      contadorStandbyAtual,
      contadorFilaAtual,
      contadorLeadsAtuais,
      contadorFechadasAtuais,
      conversasTotalAtual,
      conversasTotalPeriodo,
      firstResponseRows,
      attendanceRows,
    ] = await this.prisma.$transaction([
      this.prisma.conversation.count({
        where: {
          ...queueConversationScope,
          status: ConversationStatus.ABERTA,
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: { ...closedConversationWhere(tenantId, range), ...conversationScope },
      }),
      this.prisma.conversation.count({
        where: {
          ...queueConversationScope,
          status: ConversationStatus.AGUARDANDO,
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: { ...conversationScope, status: ConversationStatus.EM_ANDAMENTO, archivedAt: null },
      }),
      this.prisma.lead.count({
        where: {
          ...leadScope,
          createdAt: { gte: range.start, lt: range.end },
          conversation: { tenantId, archivedAt: null },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadScope,
          status: { in: [...ACTIVE_LEAD_STATUSES] },
          conversation: {
            tenantId,
            archivedAt: null,
            OR: [{ status: { not: ConversationStatus.FECHADA } }, { closedAt: null }],
          },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadScope,
          status: LeadStatus.CONVERTED,
          convertedAt: { gte: range.start, lt: range.end },
          conversation: { tenantId, archivedAt: null },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadScope,
          status: LeadStatus.DISCARDED,
          discardedAt: { gte: range.start, lt: range.end },
          conversation: { tenantId, archivedAt: null },
        },
      }),
      this.prisma.message.count({
        where: {
          tenantId,
          direction: MessageDirection.OUTBOUND,
          createdAt: { gte: range.start, lt: range.end },
          conversation: { ...conversationScope, archivedAt: null },
        },
      }),
      this.prisma.message.count({
        where: {
          tenantId,
          direction: MessageDirection.INBOUND,
          createdAt: { gte: range.start, lt: range.end },
          conversation: { ...conversationScope, archivedAt: null },
        },
      }),
      this.prisma.ticket.count({
        where: {
          tenantId,
          createdAt: { gte: range.start, lt: range.end },
          archivedAt: null,
          conversation: conversationScope,
        },
      }),
      this.prisma.ticket.count({
        where: {
          tenantId,
          conversation: conversationScope,
          status: { in: [TicketStatus.RESOLVIDO, TicketStatus.FECHADO] },
          updatedAt: { gte: range.start, lt: range.end },
          archivedAt: null,
        },
      }),
      this.prisma.customer.count({
        where: {
          tenantId,
          archivedAt: null,
          ...(filters.allowedConnectionIds || filters.allowedDepartmentIds
            ? { contacts: { some: { conversations: { some: conversationScope } } } }
            : {}),
        },
      }),
      this.prisma.contact.count({
        where: {
          tenantId,
          archivedAt: null,
          ...(filters.allowedConnectionIds || filters.allowedDepartmentIds
            ? { conversations: { some: conversationScope } }
            : {}),
        },
      }),
      this.prisma.department.count({
        where: {
          tenantId,
          active: true,
          ...(filters.allowedDepartmentIds
            ? { id: { in: filters.allowedDepartmentIds } }
            : filters.allowedConnectionIds
              ? { conversations: { some: conversationScope } }
              : {}),
        },
      }),
      this.prisma.messagingConnection.count({
        where: {
          tenantId,
          status: MessagingConnectionStatus.CONNECTED,
          archivedAt: null,
          ...(filters.allowedConnectionIds ? { id: { in: filters.allowedConnectionIds } } : {}),
        },
      }),
      this.prisma.conversation.count({
        where: {
          ...queueConversationScope,
          ...conversationQueueScope("ativas"),
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: {
          ...queueConversationScope,
          ...conversationQueueScope("standby"),
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: {
          ...queueConversationScope,
          ...conversationQueueScope("fila"),
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: {
          ...conversationScope,
          ...conversationQueueScope("leads"),
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: {
          ...conversationScope,
          ...conversationQueueScope("ativas"),
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: { ...conversationScope, ...conversationQueueScope("standby"), archivedAt: null },
      }),
      this.prisma.conversation.count({
        where: {
          ...conversationScope,
          ...conversationQueueScope("fila"),
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: {
          ...conversationScope,
          ...conversationQueueScope("leads"),
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: { ...closedConversationWhere(tenantId), ...conversationScope },
      }),
      this.prisma.conversation.count({
        where: { ...conversationScope, archivedAt: null },
      }),
      this.prisma.conversation.count({
        where: {
          ...conversationScope,
          createdAt: { gte: range.start, lt: range.end },
          archivedAt: null,
        },
      }),
      this.prisma.conversation.findMany({
        where: {
          ...conversationScope,
          createdAt: { gte: range.start, lt: range.end },
          archivedAt: null,
        },
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
        where: { ...closedConversationWhere(tenantId, range), ...conversationScope },
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
      leadsAtivos,
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
      filaAtivas,
      filaStandby,
      filaFila,
      filaLeads,
      contadorAtivasAtuais,
      contadorStandbyAtual,
      contadorFilaAtual,
      contadorLeadsAtuais,
      contadorFechadasAtuais,
      conversasTotalAtual,
      conversasTotalPeriodo,
    };
  }

  async chartData(
    tenantId: string,
    range: OperationsRange,
    filters: OperationsMetricFilters = {},
    timezone = "America/Sao_Paulo",
  ) {
    const conversationRange: Prisma.ConversationWhereInput = {
      ...conversationMetricScope(tenantId, filters),
      archivedAt: null,
      createdAt: { gte: range.start, lt: range.end },
      department: { active: true },
    };
    const [byDepartment, byAgent, byContact, byConnection, messages] = await Promise.all([
      this.prisma.conversation.groupBy({
        by: ["departmentId"],
        where: conversationRange,
        _count: { _all: true },
      }),
      this.prisma.conversation.groupBy({
        by: ["assignedMembershipId"],
        where: conversationRange,
        _count: { _all: true },
      }),
      this.prisma.conversation.groupBy({
        by: ["contactId"],
        where: conversationRange,
        _count: { _all: true },
      }),
      this.prisma.conversation.groupBy({
        by: ["connectionId"],
        where: conversationRange,
        _count: { _all: true },
      }),
      this.prisma.message.findMany({
        where: {
          tenantId,
          direction: { in: [MessageDirection.INBOUND, MessageDirection.OUTBOUND] },
          type: { not: "SYSTEM" },
          createdAt: { gte: range.start, lt: range.end },
          conversation: { ...conversationMetricScope(tenantId, filters), archivedAt: null },
        },
        select: {
          createdAt: true,
          direction: true,
          type: true,
          conversation: { select: { id: true, contactId: true } },
        },
      }),
    ]);
    const [departments, memberships, connections, contacts] = await Promise.all([
      this.prisma.department.findMany({ where: { tenantId, active: true } }),
      this.prisma.tenantMembership.findMany({ where: { tenantId }, include: { user: true } }),
      this.prisma.messagingConnection.findMany({ where: { tenantId, archivedAt: null } }),
      loadInBatches(
        byContact.flatMap((row) => (row.contactId ? [row.contactId] : [])),
        10_000,
        (contactIds) =>
          this.prisma.contact.findMany({
            where: { tenantId, id: { in: contactIds } },
            select: {
              id: true,
              customer: { select: { id: true, name: true, color: true } },
              tags: { where: { tag: { archivedAt: null } }, select: { tag: true } },
            },
          }),
      ),
    ]);
    const departmentById = new Map(departments.map((item) => [item.id, item]));
    const membershipById = new Map(memberships.map((item) => [item.id, item]));
    const connectionById = new Map(connections.map((item) => [item.id, item]));
    const contactById = new Map(contacts.map((item) => [item.id, item]));
    const customerCounts = new Map<string, { nome: string; cor: string; total: number }>();
    const tagCounts = new Map<string, { nome: string; cor: string; total: number }>();
    let taggedConversationTotal = 0;
    for (const row of byContact) {
      if (!row.contactId) continue;
      const contact = contactById.get(row.contactId);
      if (!contact) continue;
      const customer = contact.customer;
      if (customer) {
        const item = customerCounts.get(customer.id) ?? {
          nome: customer.name,
          cor: customer.color,
          total: 0,
        };
        item.total += row._count._all;
        customerCounts.set(customer.id, item);
      }
      if (contact.tags.length > 0) taggedConversationTotal += row._count._all;
      for (const tag of contact.tags) {
        const current = tagCounts.get(tag.tag.id) ?? {
          nome: tag.tag.name,
          cor: tag.tag.color,
          total: 0,
        };
        current.total += row._count._all;
        tagCounts.set(tag.tag.id, current);
      }
    }
    const messagesByHour = messageTrafficByHour(messages, timezone);
    const messageContactsTotal = uniqueInboundContacts(messages);
    const messageAttendancesTotal = uniqueInboundConversations(messages);
    return {
      byDepartment: byDepartment.map((row) => {
        const department = row.departmentId ? departmentById.get(row.departmentId) : undefined;
        return {
          nome: department?.name ?? "Sem departamento",
          cor: department?.color ?? "#64748b",
          total: row._count._all,
        };
      }),
      byAgent: byAgent.map((row) => {
        const membership = row.assignedMembershipId
          ? membershipById.get(row.assignedMembershipId)
          : undefined;
        return {
          nome: membership?.presentationName?.trim() || membership?.user.name || "Sem atendente",
          total: row._count._all,
        };
      }),
      byCustomer: [...customerCounts.values()],
      byConnection: byConnection.map((row) => {
        const connection = row.connectionId ? connectionById.get(row.connectionId) : undefined;
        return { nome: connection?.name ?? "Sem instância", total: row._count._all };
      }),
      byTag: [...tagCounts.values()].map((item) => ({
        ...item,
        percentual:
          taggedConversationTotal === 0
            ? 0
            : Math.round((item.total / taggedConversationTotal) * 10_000) / 100,
      })),
      messagesByHour,
      messageContactsTotal,
      messageAttendancesTotal,
    };
  }

  semantics() {
    return {
      conversasAbertas: "ABERTA ou EM_ANDAMENTO, archivedAt null.",
      conversasEncerradas: "FECHADA com closedAt preenchido no periodo, archivedAt null.",
      conversasAguardando: "AGUARDANDO, archivedAt null.",
      leadsAtivos: "NEW, QUEUED ou ASSIGNED, sem conversa FECHADA com closedAt preenchido.",
      novosLeads: "Lead criado no periodo é vinculado a conversa não arquivada do tenant.",
      leadsConvertidos: "CONVERTED com convertedAt no periodo.",
      leadsPerdidos: "DISCARDED com discardedAt no periodo.",
    };
  }
}

async function loadInBatches<TValue, TResult>(
  values: TValue[],
  batchSize: number,
  loader: (batch: TValue[]) => Promise<TResult[]>,
) {
  const results: TResult[] = [];
  for (let offset = 0; offset < values.length; offset += batchSize) {
    results.push(...(await loader(values.slice(offset, offset + batchSize))));
  }
  return results;
}

export function closedConversationWhere(tenantId: string, range?: OperationsRange) {
  return {
    tenantId,
    status: ConversationStatus.FECHADA,
    closedAt: range ? { gte: range.start, lt: range.end } : { not: null },
    archivedAt: null,
  } satisfies Prisma.ConversationWhereInput;
}

function conversationMetricScope(tenantId: string, filters: OperationsMetricFilters) {
  return {
    tenantId,
    ...(filters.allowedConnectionIds || filters.allowedDepartmentIds
      ? {
          AND: [
            ...(filters.allowedConnectionIds
              ? [{ connectionId: { in: filters.allowedConnectionIds } }]
              : []),
            ...(filters.allowedDepartmentIds
              ? [{ departmentId: { in: filters.allowedDepartmentIds } }]
              : []),
          ],
        }
      : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.assignedMembershipId ? { assignedMembershipId: filters.assignedMembershipId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.customerId ? { contact: { customerId: filters.customerId } } : {}),
    ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
  } satisfies Prisma.ConversationWhereInput;
}

function leadMetricScope(tenantId: string, filters: OperationsMetricFilters) {
  return {
    ...(filters.allowedConnectionIds || filters.allowedDepartmentIds
      ? {
          AND: [
            ...(filters.allowedConnectionIds
              ? [{ conversation: { connectionId: { in: filters.allowedConnectionIds } } }]
              : []),
            ...(filters.allowedDepartmentIds
              ? [
                  {
                    conversation: { departmentId: { in: filters.allowedDepartmentIds } },
                  },
                ]
              : []),
          ],
        }
      : {}),
    tenantId,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.assignedMembershipId ? { assignedMembershipId: filters.assignedMembershipId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.customerId ? { contact: { customerId: filters.customerId } } : {}),
    ...(filters.connectionId ? { conversation: { connectionId: filters.connectionId } } : {}),
  } satisfies Prisma.LeadWhereInput;
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

export function messageTrafficByHour(messages: MessageTrafficRow[], timezone: string) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hora: String(hour).padStart(2, "0") + "h",
    recebidas: 0,
    enviadas: 0,
    total: 0,
    atendimentos: 0,
  }));
  const contactsByHour = Array.from({ length: 24 }, () => new Set<string>());
  const firstInboundByConversation = new Map<string, { createdAt: Date; hour: number }>();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  });
  for (const message of messages) {
    if (message.type === "SYSTEM" || !["INBOUND", "OUTBOUND"].includes(message.direction)) continue;
    const hour = Number(formatter.format(message.createdAt));
    const bucket = buckets[hour];
    if (message.direction === "INBOUND") {
      bucket.recebidas++;
      const contactId = message.conversation?.contactId;
      if (contactId) contactsByHour[hour].add(contactId);
      const conversationId = message.conversation?.id;
      const currentFirst = conversationId ? firstInboundByConversation.get(conversationId) : null;
      if (conversationId && (!currentFirst || message.createdAt < currentFirst.createdAt)) {
        firstInboundByConversation.set(conversationId, { createdAt: message.createdAt, hour });
      }
    } else bucket.enviadas++;
    bucket.total = bucket.recebidas + bucket.enviadas;
  }
  for (const firstInbound of firstInboundByConversation.values()) {
    buckets[firstInbound.hour].atendimentos++;
  }
  return buckets.map((bucket, hour) => ({
    ...bucket,
    contatosAtendidos: contactsByHour[hour].size,
  }));
}

export function uniqueInboundConversations(messages: MessageTrafficRow[]) {
  return new Set(
    messages.flatMap((message) =>
      message.type !== "SYSTEM" && message.direction === "INBOUND" && message.conversation?.id
        ? [message.conversation.id]
        : [],
    ),
  ).size;
}

export function uniqueInboundContacts(messages: MessageTrafficRow[]) {
  return new Set(
    messages.flatMap((message) =>
      message.type !== "SYSTEM" &&
      message.direction === "INBOUND" &&
      message.conversation?.contactId
        ? [message.conversation.contactId]
        : [],
    ),
  ).size;
}

type MessageTrafficRow = {
  createdAt: Date;
  direction: string;
  type?: string;
  conversation?: { id: string; contactId: string | null } | null;
};
