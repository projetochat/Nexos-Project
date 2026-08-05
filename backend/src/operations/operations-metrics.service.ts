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

export type OperationsRange = { start: Date; end: Date };
export type OperationsMetricFilters = {
  departmentId?: string;
  assignedMembershipId?: string;
  customerId?: string;
  contactId?: string;
};

const ACTIVE_CONVERSATION_STATUSES = [
  ConversationStatus.ABERTA,
  ConversationStatus.EM_ANDAMENTO,
] as const;
const ACTIVE_LEAD_STATUSES = [LeadStatus.NEW, LeadStatus.QUEUED, LeadStatus.ASSIGNED] as const;

@Injectable()
export class OperationsMetricsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async snapshot(tenantId: string, range: OperationsRange, filters: OperationsMetricFilters = {}) {
    const conversationScope = conversationMetricScope(tenantId, filters);
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
      firstResponseRows,
      attendanceRows,
    ] = await this.prisma.$transaction([
      this.prisma.conversation.count({
        where: {
          ...conversationScope,
          status: { in: [...ACTIVE_CONVERSATION_STATUSES] },
          archivedAt: null,
        },
      }),
      this.prisma.conversation.count({
        where: { ...closedConversationWhere(tenantId, range), ...conversationScope },
      }),
      this.prisma.conversation.count({
        where: { ...conversationScope, status: ConversationStatus.AGUARDANDO, archivedAt: null },
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
    };
  }

  async chartData(tenantId: string, range: OperationsRange, filters: OperationsMetricFilters = {}) {
    const conversationRange: Prisma.ConversationWhereInput = {
      ...conversationMetricScope(tenantId, filters),
      archivedAt: null,
      createdAt: { gte: range.start, lt: range.end },
      department: { active: true },
    };
    const [byDepartment, byAgent, byCustomer, byConnection] = await Promise.all([
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
      this.prisma.conversation.findMany({
        where: conversationRange,
        select: {
          contact: { select: { customer: { select: { id: true, name: true, color: true } } } },
        },
      }),
      this.prisma.conversation.groupBy({
        by: ["connectionId"],
        where: conversationRange,
        _count: { _all: true },
      }),
    ]);
    const [departments, memberships, connections] = await Promise.all([
      this.prisma.department.findMany({ where: { tenantId, active: true } }),
      this.prisma.tenantMembership.findMany({ where: { tenantId }, include: { user: true } }),
      this.prisma.messagingConnection.findMany({ where: { tenantId, archivedAt: null } }),
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

  semantics() {
    return {
      conversasAbertas: "ABERTA ou EM_ANDAMENTO, archivedAt null.",
      conversasEncerradas: "FECHADA com closedAt preenchido no periodo, archivedAt null.",
      conversasAguardando: "AGUARDANDO, archivedAt null.",
      leadsAtivos: "NEW, QUEUED ou ASSIGNED, sem conversa FECHADA com closedAt preenchido.",
      novosLeads: "Lead criado no periodo e vinculado a conversa nao arquivada do tenant.",
      leadsConvertidos: "CONVERTED com convertedAt no periodo.",
      leadsPerdidos: "DISCARDED com discardedAt no periodo.",
    };
  }
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
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.assignedMembershipId ? { assignedMembershipId: filters.assignedMembershipId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.customerId ? { contact: { customerId: filters.customerId } } : {}),
  } satisfies Prisma.ConversationWhereInput;
}

function leadMetricScope(tenantId: string, filters: OperationsMetricFilters) {
  return {
    tenantId,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.assignedMembershipId ? { assignedMembershipId: filters.assignedMembershipId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.customerId ? { contact: { customerId: filters.customerId } } : {}),
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
