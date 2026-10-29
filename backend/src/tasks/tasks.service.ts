import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { canReadContactAdditionalFields } from "../auth/contact-additional-fields-access";
import { effectivePermissions } from "../auth/effective-permissions";
import {
  roleConnectionIds,
  roleChatDepartmentIds,
  roleChatScopes,
} from "../auth/connection-access";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { conversationVisibilityWhere } from "../conversations/conversation-visibility";
import { nextTaskOccurrences, validateTaskRecurrence } from "./task-recurrence";
import {
  normalizeTaskInput,
  normalizeTaskSettings,
  normalizeTaskSmtp,
  normalizeTaskSmtpTest,
} from "./task-input";
import { resolveTaskAudience, taskContactScope, taskFilterFields } from "./task-audience";
import {
  TaskSmtpService,
  TaskSmtpFailure,
  taskSmtpConfigurationFingerprint,
  taskSmtpCredentialBase,
  type TaskEncryptedPassword,
} from "./task-smtp";
import type {
  TaskInput,
  TaskQuery,
  TaskRecord,
  TaskSettings,
  TaskSmtpAccount,
  TaskSmtpInput,
  TaskOccurrence,
  TaskRecipient,
} from "./task-contract";
export type TaskDb = Prisma.TransactionClient;
export type TaskPayload = {
  assignedNameSnapshot?: string | null;
  createdBySnapshot?: { membershipId: string; name: string | null };
  resolvedRecipients?: Array<Pick<TaskRecipient, "id" | "name" | "kind">>;
  input: TaskInput;
  fixed: { contactIds: string[]; groupIds: string[] };
  creatorScope: { connections: string[] | null; departments: string[] | null };
};
export type TaskRow = {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  type: string;
  assignedMembershipId: string | null;
  createdByMembershipId: string | null;
  priority: string;
  status: string;
  payload: TaskPayload;
  nextDueAt: Date | null;
  version: number;
  legacyOrigin: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type OccurrenceRow = {
  id: string;
  tenantId: string;
  taskId: string;
  dueAt: Date;
  status: string;
  snapshot: TaskPayload & { version: number; prepared?: boolean };
  completedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};
export type SmtpRow = TaskSmtpInput & {
  id: string;
  tenantId: string;
  credential: TaskEncryptedPassword;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export function taskOccurrenceId(taskId: string, dueAt: string) {
  const bytes = createHash("sha256").update(`${taskId}:${dueAt}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function audienceKey(audience: TaskInput["audience"]) {
  return JSON.stringify({
    mode: audience.mode,
    selection: audience.selection,
    contactIds: [...audience.contactIds].sort(),
    groupIds: [...audience.groupIds].sort(),
    conditions: audience.conditions
      .map((condition) =>
        JSON.stringify({
          field: condition.field,
          operator: condition.operator,
          value: condition.value,
        }),
      )
      .sort(),
  });
}
export const TASK_DEFAULT_SETTINGS: TaskSettings = {
  popupEnabled: true,
  whatsappEnabled: false,
  emailEnabled: false,
  defaultSmtpAccountId: null,
  bellEnabled: true,
  defaultLeadMinutes: 0,
  timezone: "America/Sao_Paulo",
};
const json = (value: unknown) => JSON.stringify(value);
const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
const permission = (current: AuthenticatedUser, key: string) => {
  if (!current.permissions?.includes(key as never))
    throw new ForbiddenException("Permissão insuficiente.");
};
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  constructor(
    @Inject(PrismaService) readonly prisma: PrismaService,
    @Inject(ConfigService) readonly config: ConfigService,
    @Inject(PlanEntitlementService) readonly entitlements: PlanEntitlementService,
    @Inject(TaskSmtpService) readonly smtp: TaskSmtpService,
  ) {}
  enabled() {
    return this.config.get<string>("TRIXUS_TASKS_ENABLED") === "true";
  }
  workerEnabled() {
    return this.enabled() && this.config.get<string>("TRIXUS_TASKS_WORKER_ENABLED") === "true";
  }
  capabilities() {
    return {
      enabled: this.enabled(),
      workerEnabled: this.workerEnabled(),
      smtpConfigured: this.smtp.configured(),
      channels: ["popup", "bell", "whatsapp", "email"],
      attachmentsEnabled: false,
      whatsappResponsibleSupported: false,
    };
  }
  assertEnabled() {
    if (!this.enabled())
      throw new ServiceUnavailableException({
        code: "TASKS_DISABLED",
        message: "Gestão de Tarefas aguarda ativação.",
      });
  }
  async context(
    current: AuthenticatedUser,
    key = "schedules.read",
    db: TaskDb = this.prisma,
  ): Promise<AuthenticatedUser> {
    this.assertEnabled();
    await this.entitlements.assertFeature(current.tenantId, "chat");
    const member = await db.tenantMembership.findFirst({
      where: {
        id: current.membershipId,
        tenantId: current.tenantId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        role: { active: true },
      },
      include: { user: true, role: { include: { permissions: true } } },
    });
    if (!member || (current.userId && member.userId !== current.userId))
      throw new ForbiddenException("Vínculo ativo obrigatório.");
    const actor: AuthenticatedUser = {
      ...current,
      userId: member.userId,
      roleId: member.roleId,
      roleKey: member.role.key,
      permissions: effectivePermissions(member.role),
      connectionIds: roleConnectionIds(member.role),
      chatDepartmentIds: roleChatDepartmentIds(member.role),
      chatScopes: roleChatScopes(member.role),
    };
    permission(actor, key);
    return actor;
  }
  async actorByMembership(
    tenantId: string,
    membershipId: string,
    key = "schedules.read",
    db: TaskDb = this.prisma,
  ) {
    return this.context(
      { tenantId, membershipId, userId: "", roleId: "", roleKey: "", platformRole: "USER" },
      key,
      db,
    );
  }
  private async row(
    id: string,
    tenantId: string,
    db: TaskDb = this.prisma,
    lock = false,
    includeArchived = false,
  ) {
    const rows = await db.$queryRaw<TaskRow[]>(
      Prisma.sql`SELECT * FROM "task_definitions" WHERE "tenantId"=${tenantId} AND "id"=${id} ${includeArchived ? Prisma.empty : Prisma.sql`AND "archivedAt" IS NULL`} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`,
    );
    if (!rows[0]) throw new NotFoundException("Tarefa não encontrada.");
    return rows[0];
  }
  async visible(row: TaskRow, current: AuthenticatedUser) {
    const input = row.payload.input;
    if (current.roleKey === "tenant_admin") return;
    if (
      input.audience.conditions.some((condition) => condition.field.startsWith("custom:")) &&
      !canReadContactAdditionalFields(current)
    )
      throw new NotFoundException("Tarefa não encontrada.");
    if (
      current.roleKey !== "tenant_admin" &&
      input.audience.selection === "dynamic" &&
      input.audience.mode === "filters"
    ) {
      const scope = row.payload.creatorScope;
      if (
        !scope.connections ||
        !scope.departments ||
        scope.connections.some((id) => !current.connectionIds?.includes(id)) ||
        scope.departments.some((id) => !current.chatDepartmentIds?.includes(id))
      )
        throw new NotFoundException("Tarefa não encontrada.");
    }
    if (input.channels.whatsapp.enabled)
      await this.connection(input.channels.whatsapp.connectionId, current, this.prisma, true);
    if (input.audience.selection === "fixed")
      await resolveTaskAudience(
        this.prisma,
        current,
        {
          ...input.audience,
          mode: row.payload.fixed.groupIds.length ? "groups" : "contacts",
          contactIds: row.payload.fixed.contactIds,
          groupIds: row.payload.fixed.groupIds,
        },
        input.channels.whatsapp.enabled ? input.channels.whatsapp.connectionId : undefined,
        true,
      );
  }
  async notificationDetails(
    ids: string[],
    current: AuthenticatedUser,
  ): Promise<Record<string, { priority: string; title: string }>> {
    if (!this.enabled()) return {};
    const actor = await this.context(current);
    const result: Record<string, { priority: string; title: string }> = {};
    for (const id of [...new Set(ids)].slice(0, 100)) {
      try {
        const row = await this.row(id, actor.tenantId);
        await this.visible(row, actor);
        result[id] = { priority: row.priority, title: row.title };
      } catch (error) {
        if (
          error instanceof ForbiddenException ||
          error instanceof NotFoundException ||
          error instanceof BadRequestException
        )
          continue;
        throw error;
      }
    }
    return result;
  }
  async get(id: string, current: AuthenticatedUser) {
    const actor = await this.context(current);
    const row = await this.row(id, actor.tenantId);
    await this.visible(row, actor);
    return this.serialize(row);
  }
  getTask(id: string, current: AuthenticatedUser) {
    return this.get(id, current);
  }
  private async serialize(row: TaskRow): Promise<TaskRecord> {
    const [member, occurrence] = await Promise.all([
      row.assignedMembershipId
        ? this.prisma.tenantMembership.findFirst({
            where: { tenantId: row.tenantId, id: row.assignedMembershipId },
            include: { user: true },
          })
        : null,
      this.prisma.$queryRaw<Array<{ id: string; dueAt: Date }>>(
        Prisma.sql`SELECT "id","dueAt" FROM "task_occurrences" WHERE "tenantId"=${row.tenantId} AND "taskId"=${row.id} AND "status" IN ('pending','processing','failed') ORDER BY "dueAt" ASC LIMIT 1`,
      ),
    ]);
    return {
      ...row.payload.input,
      id: row.id,
      tenantId: row.tenantId,
      version: row.version,
      status: row.status as TaskInput["status"],
      nextDueAt: iso(occurrence[0]?.dueAt ?? row.nextDueAt),
      nextOccurrenceId: occurrence[0]?.id ?? null,
      assignedName: member?.presentationName ?? member?.user.name ?? null,
      createdAt: iso(row.createdAt)!,
      updatedAt: iso(row.updatedAt)!,
    };
  }
  private queryWhere(query: TaskQuery, current: AuthenticatedUser, includeArchived = false) {
    const clauses = [Prisma.sql`"tenantId"=${current.tenantId}`, Prisma.sql`"archivedAt" IS NULL`];
    if (query.search)
      clauses.push(
        Prisma.sql`("title" ILIKE ${`%${query.search.slice(0, 200)}%`} OR "description" ILIKE ${`%${query.search.slice(0, 200)}%`})`,
      );
    for (const [key, value] of [
      ["assignedMembershipId", query.assignedMembershipId],
      ["status", query.status],
      ["priority", query.priority],
      ["type", query.type],
    ] as const) {
      if (value) clauses.push(Prisma.sql`${Prisma.raw(`"${key}"`)}=${value}`);
    }
    return Prisma.join(clauses, " AND ");
  }
  private async filtered(query: TaskQuery, current: AuthenticatedUser, includeArchived = false) {
    const rows = await this.prisma.$queryRaw<TaskRow[]>(
      Prisma.sql`SELECT * FROM "task_definitions" WHERE ${this.queryWhere(query, current, includeArchived)} ORDER BY "createdAt" DESC,"id" DESC LIMIT 2001`,
    );
    if (rows.length > 2000)
      throw new BadRequestException("Refine a busca: mais de 2000 tarefas no período.");
    const visible: TaskRow[] = [];
    for (const row of rows) {
      try {
        await this.visible(row, current);
        if (
          (query.start && row.nextDueAt && row.nextDueAt < date(query.start)) ||
          (query.end && row.nextDueAt && row.nextDueAt > date(query.end))
        )
          continue;
        visible.push(row);
      } catch (error) {
        if (error instanceof NotFoundException || error instanceof BadRequestException) continue;
        throw error;
      }
    }
    return visible;
  }
  async list(query: TaskQuery, current: AuthenticatedUser) {
    const actor = await this.context(current);
    const rows = await this.filtered(query, actor);
    const { page, pageSize } = pagination(query);
    return {
      items: await Promise.all(
        rows.slice((page - 1) * pageSize, page * pageSize).map((row) => this.serialize(row)),
      ),
      total: rows.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    };
  }
  async summary(query: TaskQuery, current: AuthenticatedUser) {
    const actor = await this.context(current);
    const rows = await this.filtered(query, actor);
    const ids = rows.map((row) => row.id);
    const occurrences = ids.length
      ? await this.prisma.$queryRaw<OccurrenceRow[]>(
          Prisma.sql`SELECT * FROM "task_occurrences" WHERE "tenantId"=${actor.tenantId} AND "taskId"=ANY(${ids}::text[]) AND "status"<>'cancelled'`,
        )
      : [];
    const now = new Date();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { timezone: true },
    });
    const day = (value: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tenant?.timezone ?? "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(value);
    const today = day(now);
    const pending = occurrences.filter(
      (row) => row.status === "pending" || row.status === "failed",
    );
    const overdue = pending.filter((row) => row.dueAt < now);
    const upcomingRows = rows
      .filter((row) => row.status === "active" && row.nextDueAt && row.nextDueAt >= now)
      .sort((a, b) => a.nextDueAt!.getTime() - b.nextDueAt!.getTime())
      .slice(0, 5);
    const overdueRows = rows
      .filter((row) => overdue.some((occ) => occ.taskId === row.id))
      .slice(0, 5);
    return {
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      today: occurrences.filter((r) => day(r.dueAt) === today).length,
      paused: rows.filter((r) => r.status === "paused").length,
      pending: pending.length,
      inProgress: occurrences.filter((r) => r.status === "processing").length,
      overdue: overdue.length,
      completed: rows.filter((r) => r.status === "completed").length,
      recurring: rows.filter((r) => r.payload.input.recurrence.frequency !== "once").length,
      byStatus: ["active", "paused", "completed"].map((name) => ({
        name,
        total: rows.filter((r) => r.status === name).length,
      })),
      byPriority: ["low", "medium", "high"].map((name) => ({
        name,
        total: rows.filter((r) => r.priority === name).length,
      })),
      upcoming: await Promise.all(upcomingRows.map((row) => this.serialize(row))),
      overdueTasks: await Promise.all(overdueRows.map((row) => this.serialize(row))),
    };
  }
  async connection(
    id: string,
    current: AuthenticatedUser,
    db: TaskDb = this.prisma,
    historicalRead = false,
  ) {
    if (current.roleKey !== "tenant_admin" && !current.connectionIds?.includes(id))
      throw new NotFoundException("Instância indisponível.");
    const connection = await db.messagingConnection.findFirst({
      where: {
        tenantId: current.tenantId,
        id,
        ...(historicalRead ? {} : { archivedAt: null, serviceEnabled: true }),
      },
    });
    if (!connection) throw new NotFoundException("Instância indisponível.");
    return connection;
  }
  private async validateTargets(
    input: TaskInput,
    current: AuthenticatedUser,
    fixed?: TaskPayload["fixed"],
  ) {
    const assignedActor = await this.actorByMembership(
      current.tenantId,
      input.assignedMembershipId,
    );
    if (input.channels.whatsapp.enabled || input.channels.email.enabled)
      permission(current, "messages.send");
    if (input.channels.whatsapp.enabled)
      await this.connection(input.channels.whatsapp.connectionId, current);
    if (input.channels.email.enabled) {
      if (!input.channels.email.smtpAccountId)
        input.channels.email.smtpAccountId =
          (await this.settingsFor(current.tenantId)).defaultSmtpAccountId ?? "";
      await this.smtpRow(input.channels.email.smtpAccountId, current.tenantId);
      for (const id of input.channels.email.membershipIds ?? [])
        await this.actorByMembership(current.tenantId, id);
    }
    const recipients = await resolveTaskAudience(
      this.prisma,
      current,
      fixed
        ? {
            ...input.audience,
            mode: fixed.groupIds.length ? "groups" : "contacts",
            contactIds: fixed.contactIds,
            groupIds: fixed.groupIds,
          }
        : input.audience,
      input.channels.whatsapp.enabled ? input.channels.whatsapp.connectionId : undefined,
    );
    if (
      input.audience.conditions.some((condition) => condition.field.startsWith("custom:")) &&
      !canReadContactAdditionalFields(assignedActor)
    )
      throw new BadRequestException("O responsável não possui acesso aos campos dos filtros.");
    if (
      assignedActor.roleKey !== "tenant_admin" &&
      assignedActor.membershipId !== current.membershipId
    ) {
      if (
        input.audience.selection === "dynamic" &&
        input.audience.mode === "filters" &&
        (current.roleKey === "tenant_admin" ||
          current.connectionIds?.some((id) => !assignedActor.connectionIds?.includes(id)) ||
          current.chatDepartmentIds?.some((id) => !assignedActor.chatDepartmentIds?.includes(id)))
      )
        throw new BadRequestException("Seleção dinâmica exige responsável com escopo equivalente.");
      if (recipients.length)
        await resolveTaskAudience(this.prisma, assignedActor, {
          ...input.audience,
          mode: recipients[0].kind === "group" ? "groups" : "contacts",
          selection: "fixed",
          contactIds: recipients.filter((r) => r.kind === "contact").map((r) => r.id),
          groupIds: recipients.filter((r) => r.kind === "group").map((r) => r.id),
          conditions: [],
        });
    }
    return recipients;
  }
  private async payload(
    input: TaskInput,
    recipients: TaskRecipient[],
    current: AuthenticatedUser,
    previous?: TaskPayload,
  ): Promise<TaskPayload> {
    const [assigned, creator] = await Promise.all([
      this.prisma.tenantMembership.findFirst({
        where: { id: input.assignedMembershipId, tenantId: current.tenantId, status: "ACTIVE" },
        include: { user: true },
      }),
      this.prisma.tenantMembership.findFirst({
        where: { id: current.membershipId, tenantId: current.tenantId, status: "ACTIVE" },
        include: { user: true },
      }),
    ]);
    return {
      assignedNameSnapshot: assigned?.presentationName ?? assigned?.user.name ?? null,
      createdBySnapshot: previous?.createdBySnapshot ?? {
        membershipId: current.membershipId,
        name: creator?.presentationName ?? creator?.user.name ?? null,
      },
      input,
      fixed: {
        contactIds: recipients.filter((r) => r.kind === "contact").map((r) => r.id),
        groupIds: recipients.filter((r) => r.kind === "group").map((r) => r.id),
      },
      creatorScope: {
        connections: current.connectionIds ?? null,
        departments: current.chatDepartmentIds ?? null,
      },
    };
  }
  async create(value: unknown, current: AuthenticatedUser, fixed?: TaskPayload["fixed"]) {
    const actor = await this.context(current, "schedules.create");
    const input = normalizeTaskInput(value);
    const targets = await this.validateTargets(input, actor, fixed);
    const payload = await this.payload(input, targets, actor);
    const id = randomUUID();
    const next = nextTaskOccurrences(input.recurrence, { limit: 1 })[0] ?? null;
    const row = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<TaskRow[]>(
        Prisma.sql`INSERT INTO "task_definitions" ("id","tenantId","title","description","type","assignedMembershipId","createdByMembershipId","priority","status","payload","nextDueAt","legacyOrigin") VALUES (${id},${actor.tenantId},${input.title},${input.description},${input.type},${input.assignedMembershipId},${actor.membershipId},${input.priority},${input.status},${json(payload)}::jsonb,${next ? new Date(next) : null},${input.legacyOrigin ?? null}) RETURNING *`,
      );
      await this.history(tx, rows[0], "created", actor.membershipId);
      await this.materializeRow(
        tx,
        rows[0],
        new Date(),
        new Date(Date.now() + 93 * 86400000),
        true,
      );
      return rows[0];
    });
    return this.serialize(row);
  }
  async update(id: string, value: unknown, current: AuthenticatedUser) {
    const actor = await this.context(current, "schedules.update");
    const existing = await this.row(id, actor.tenantId);
    await this.visible(existing, actor);
    const version = (value as { version?: unknown })?.version;
    if (!Number.isInteger(version) || version !== existing.version)
      throw new ConflictException("Tarefa alterada; atualize antes de editar.");
    const input = normalizeTaskInput(value, existing.payload.input);
    const targets = await this.validateTargets(
      input,
      actor,
      input.audience.selection === "fixed" &&
        audienceKey(input.audience) === audienceKey(existing.payload.input.audience)
        ? existing.payload.fixed
        : undefined,
    );
    const payload = await this.payload(input, targets, actor, existing.payload);
    const next = nextTaskOccurrences(input.recurrence, { after: new Date(), limit: 1 })[0] ?? null;
    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await this.row(id, actor.tenantId, tx, true);
      if (locked.version !== version)
        throw new ConflictException("Tarefa alterada; atualize antes de editar.");
      const unsafe = await tx.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`SELECT COUNT(*) AS "count" FROM "task_deliveries" d JOIN "task_occurrences" o ON o."id"=d."occurrenceId" WHERE o."taskId"=${id} AND o."tenantId"=${actor.tenantId} AND o."dueAt">=CURRENT_TIMESTAMP AND (d."status" IN ('processing','sent','ambiguous') OR d."messageId" IS NOT NULL)`,
      );
      if (Number(unsafe[0]?.count))
        throw new ConflictException(
          "Uma ocorrência futura já iniciou o envio; pause e revise a execução.",
        );
      await this.history(tx, locked, "updated", actor.membershipId, {
        previous: locked.payload.input,
      });
      await tx.$executeRaw(
        Prisma.sql`UPDATE "task_deliveries" SET "status"='cancelled' WHERE "tenantId"=${actor.tenantId} AND "status" IN ('pending','failed') AND "occurrenceId" IN (SELECT "id" FROM "task_occurrences" WHERE "taskId"=${id} AND "dueAt">=CURRENT_TIMESTAMP)`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "task_occurrences" SET "status"='cancelled' WHERE "tenantId"=${actor.tenantId} AND "taskId"=${id} AND "dueAt">=CURRENT_TIMESTAMP AND "status" IN ('pending','failed')`,
      );
      const rows = await tx.$queryRaw<TaskRow[]>(
        Prisma.sql`UPDATE "task_definitions" SET "title"=${input.title},"description"=${input.description},"type"=${input.type},"assignedMembershipId"=${input.assignedMembershipId},"createdByMembershipId"=COALESCE("createdByMembershipId",${actor.membershipId}),"priority"=${input.priority},"status"=${input.status},"payload"=${json(payload)}::jsonb,"nextDueAt"=${next ? new Date(next) : null},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${actor.tenantId} AND "id"=${id} RETURNING *`,
      );
      if (input.status !== "completed")
        await this.materializeRow(
          tx,
          rows[0],
          new Date(),
          new Date(Date.now() + 93 * 86400000),
          false,
          true,
        );
      return rows[0];
    });
    return this.serialize(row);
  }
  async duplicate(id: string, value: unknown, current: AuthenticatedUser) {
    const actor = await this.context(current, "schedules.create");
    const row = await this.row(id, actor.tenantId);
    await this.visible(row, actor);
    const recurrence = (value as { recurrence?: TaskInput["recurrence"] })?.recurrence;
    if (!recurrence) throw new BadRequestException("Informe a nova data e recorrência da cópia.");
    return this.create(
      {
        ...row.payload.input,
        title: `${row.title} - cópia`.slice(0, 200),
        status: "paused",
        recurrence,
      },
      actor,
      row.payload.input.audience.selection === "fixed" ? row.payload.fixed : undefined,
    );
  }
  async setStatus(id: string, status: "active" | "paused", current: AuthenticatedUser) {
    const actor = await this.context(current, "schedules.update");
    const row = await this.row(id, actor.tenantId);
    await this.visible(row, actor);
    if (
      status === "active" &&
      (row.payload.input.channels.whatsapp.enabled || row.payload.input.channels.email.enabled)
    )
      permission(actor, "messages.send");
    if (row.status === "completed")
      throw new ConflictException("Série concluída não pode ser retomada.");
    const saved = await this.prisma.$transaction(async (tx) => {
      const locked = await this.row(id, actor.tenantId, tx, true);
      await this.visible(locked, actor);
      if (
        status === "active" &&
        (locked.payload.input.channels.whatsapp.enabled ||
          locked.payload.input.channels.email.enabled)
      )
        permission(actor, "messages.send");
      if (locked.status === "completed")
        throw new ConflictException("Série concluída não pode ser retomada.");
      if (locked.version !== row.version)
        throw new ConflictException("Tarefa alterada; atualize antes de mudar a situação.");
      const rows = await tx.$queryRaw<TaskRow[]>(
        Prisma.sql`UPDATE "task_definitions" SET "status"=${status},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${actor.tenantId} AND "id"=${id} RETURNING *`,
      );
      await this.history(tx, locked, status, actor.membershipId);
      return rows[0];
    });
    return this.serialize(saved);
  }
  async remove(id: string, current: AuthenticatedUser) {
    const actor = await this.context(current, "schedules.delete");
    const row = await this.row(id, actor.tenantId);
    await this.visible(row, actor);
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.row(id, actor.tenantId, tx, true);
      await this.visible(locked, actor);
      if (locked.version !== row.version)
        throw new ConflictException("Tarefa alterada; atualize antes de excluir.");
      await this.history(tx, locked, "archived", actor.membershipId);
      await tx.$executeRaw(
        Prisma.sql`UPDATE "task_definitions" SET "archivedAt"=CURRENT_TIMESTAMP,"status"='completed',"nextDueAt"=NULL,"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${actor.tenantId} AND "id"=${id}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "task_deliveries" SET "status"='cancelled' WHERE "tenantId"=${actor.tenantId} AND "status"='pending' AND "occurrenceId" IN (SELECT "id" FROM "task_occurrences" WHERE "taskId"=${id})`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "task_occurrences" SET "status"='cancelled' WHERE "tenantId"=${actor.tenantId} AND "taskId"=${id} AND "status"='pending'`,
      );
    });
    return { deleted: true };
  }
  async history(
    db: TaskDb,
    row: Pick<TaskRow, "id" | "tenantId">,
    action: string,
    membershipId: string | null,
    payload: unknown = {},
    occurrenceId: string | null = null,
  ) {
    await db.$executeRaw(
      Prisma.sql`INSERT INTO "task_history" ("id","tenantId","taskId","occurrenceId","action","membershipId","payload") VALUES (${randomUUID()},${row.tenantId},${row.id},${occurrenceId},${action},${membershipId},${json(payload)}::jsonb)`,
    );
  }
  private occurrenceDates(row: TaskRow, start: Date, end: Date, includeFirst: boolean) {
    if (row.status === "completed") return [];
    let after = new Date(start.getTime() - 1);
    const dates: string[] = [];
    for (let batch = 0; batch < 201; batch++) {
      const upcoming = nextTaskOccurrences(row.payload.input.recurrence, { after, limit: 10 });
      if (!upcoming.length) break;
      let done = false;
      for (const due of upcoming) {
        if (new Date(due) > end) {
          done = true;
          break;
        }
        dates.push(due);
        if (dates.length > 2000)
          throw new BadRequestException("Materialização acima de 2000 ocorrências.");
      }
      if (done || upcoming.length < 10) break;
      after = new Date(upcoming.at(-1)!);
    }
    if (includeFirst && !dates.length) {
      const first = nextTaskOccurrences(row.payload.input.recurrence, { limit: 1 })[0];
      if (first) dates.push(first);
    }
    return dates;
  }
  async materializeRow(
    db: TaskDb,
    row: TaskRow,
    start: Date,
    end: Date,
    includeFirst: boolean,
    reactivate = false,
  ) {
    if (row.status === "completed") return 0;
    const dates = this.occurrenceDates(row, start, end, includeFirst);
    if (!dates.length) return 0;
    const snapshot = { ...row.payload, version: row.version, prepared: false };
    const data = dates.map((dueAt) => ({ id: taskOccurrenceId(row.id, dueAt), dueAt, snapshot }));
    return db.$executeRaw(
      Prisma.sql`INSERT INTO "task_occurrences" ("id","tenantId","taskId","dueAt","snapshot") SELECT item."id",${row.tenantId},${row.id},item."dueAt"::timestamp,item."snapshot" FROM jsonb_to_recordset(${json(data)}::jsonb) AS item("id" text,"dueAt" text,"snapshot" jsonb) ${reactivate ? Prisma.sql`ON CONFLICT ("taskId","dueAt") DO UPDATE SET "snapshot"=EXCLUDED."snapshot","status"='pending',"completedAt"=NULL WHERE "task_occurrences"."status"='cancelled' AND NOT EXISTS (SELECT 1 FROM "task_deliveries" d WHERE d."occurrenceId"="task_occurrences"."id" AND (d."status" IN ('processing','sent','ambiguous') OR d."messageId" IS NOT NULL))` : Prisma.sql`ON CONFLICT ("taskId","dueAt") DO NOTHING`}`,
    );
  }
  async materialize(
    value: { start?: string; end?: string; taskId?: string },
    current: AuthenticatedUser,
  ) {
    const actor = await this.context(current, "schedules.update");
    const [start, end] = range(value.start, value.end);
    const rows = value.taskId
      ? [await this.row(value.taskId, actor.tenantId)]
      : await this.filtered({}, actor);
    if (rows.length > 50)
      throw new BadRequestException("Materialize no máximo 50 tarefas por operação.");
    let planned = 0;
    for (const row of rows) {
      await this.visible(row, actor);
      planned += this.occurrenceDates(row, start, end, false).length;
      if (planned > 2000)
        throw new BadRequestException("Materialize um conjunto menor: limite de 2000 ocorrências.");
    }
    const created = await this.prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const row of rows) {
          const locked = await this.row(row.id, actor.tenantId, tx, true);
          if (locked.version !== row.version)
            throw new ConflictException("Tarefa alterada durante a materialização.");
          count += await this.materializeRow(tx, locked, start, end, false);
        }
        return count;
      },
      { timeout: 15000 },
    );
    return { created };
  }
  async occurrences(query: TaskQuery, current: AuthenticatedUser, history = false) {
    const actor = await this.context(current);
    const allowed = query.taskId
      ? [await this.row(query.taskId, actor.tenantId, this.prisma, false, history)]
      : await this.filtered({}, actor, history);
    for (const row of allowed) await this.visible(row, actor);
    const ids = allowed.map((row) => row.id);
    const { page, pageSize } = pagination(query);
    if (!ids.length) return { items: [], total: 0, page, pageSize, totalPages: 1 };
    const clauses = [
      Prisma.sql`o."tenantId"=${actor.tenantId}`,
      Prisma.sql`o."taskId"=ANY(${ids}::text[])`,
    ];
    if (query.assignedMembershipId)
      clauses.push(
        Prisma.sql`o."snapshot"#>>'{input,assignedMembershipId}'=${query.assignedMembershipId}`,
      );
    if (query.channel) {
      if (!["popup", "bell", "whatsapp", "email"].includes(query.channel))
        throw new BadRequestException("Canal inválido.");
      clauses.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "task_deliveries" d WHERE d."occurrenceId"=o."id" AND d."channel"=${query.channel})`,
      );
    }
    if (query.search) {
      const search = `%${query.search.slice(0, 200)}%`;
      clauses.push(
        Prisma.sql`(o."snapshot"#>>'{input,title}' ILIKE ${search} OR o."snapshot"#>>'{input,description}' ILIKE ${search} OR EXISTS(SELECT 1 FROM "task_deliveries" d WHERE d."occurrenceId"=o."id" AND d."payload"#>>'{recipient,name}' ILIKE ${search}))`,
      );
    }
    if (query.start) clauses.push(Prisma.sql`o."dueAt">=${date(query.start)}`);
    if (query.end) clauses.push(Prisma.sql`o."dueAt"<=${date(query.end)}`);
    if (query.status) clauses.push(Prisma.sql`o."status"=${query.status}`);
    if (history)
      clauses.push(
        Prisma.sql`(o."status"<>'pending' OR EXISTS(SELECT 1 FROM "task_deliveries" d WHERE d."occurrenceId"=o."id"))`,
      );
    const where = Prisma.join(clauses, " AND ");
    const totalRows = await this.prisma.$queryRaw<Array<{ total: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS "total" FROM "task_occurrences" o WHERE ${where}`,
    );
    const rows = await this.prisma.$queryRaw<OccurrenceRow[]>(
      Prisma.sql`SELECT o.* FROM "task_occurrences" o WHERE ${where} ORDER BY o."dueAt" ${history ? Prisma.sql`DESC` : Prisma.sql`ASC`},o."id" ASC OFFSET ${(page - 1) * pageSize} LIMIT ${pageSize}`,
    );
    const total = Number(totalRows[0]?.total ?? 0);
    return {
      items: await Promise.all(
        rows.map((row) =>
          this.serializeOccurrence(row, allowed.find((task) => task.id === row.taskId)!),
        ),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
  async serializeOccurrence(row: OccurrenceRow, task: TaskRow): Promise<TaskOccurrence> {
    const deliveries = await this.prisma.$queryRaw<
      Array<{
        id: string;
        channel: "popup";
        destination: string;
        status: "pending";
        lastError: string | null;
        createdAt: Date;
        sentAt: Date | null;
        payload?: { recipient?: TaskRecipient; recipientName?: string };
      }>
    >(
      Prisma.sql`SELECT "id","channel","destination","status","lastError","createdAt","sentAt","payload" FROM "task_deliveries" WHERE "tenantId"=${row.tenantId} AND "occurrenceId"=${row.id} ORDER BY "createdAt" ASC`,
    );
    const member = task.assignedMembershipId
      ? await this.prisma.tenantMembership.findFirst({
          where: { id: task.assignedMembershipId, tenantId: task.tenantId },
          include: { user: true },
        })
      : null;
    return {
      id: row.id,
      taskId: row.taskId,
      taskTitle: row.snapshot.input.title,
      dueAt: iso(row.dueAt)!,
      status: row.status as TaskOccurrence["status"],
      completedAt: iso(row.completedAt),
      executionError: row.lastError ?? null,
      createdAt: iso(row.createdAt)!,
      taskPriority: row.snapshot.input.priority,
      taskType: row.snapshot.input.type,
      assignedName:
        row.snapshot.assignedNameSnapshot ?? member?.presentationName ?? member?.user.name ?? null,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        channel: delivery.channel,
        status: delivery.status,
        lastError: delivery.lastError,
        destination:
          delivery.payload?.recipient?.name ??
          delivery.payload?.recipientName ??
          (["popup", "bell"].includes(delivery.channel)
            ? (row.snapshot.assignedNameSnapshot ?? "Responsável")
            : "Destinatário"),
        createdAt: iso(delivery.createdAt)!,
        sentAt: iso(delivery.sentAt),
      })),
    } as TaskOccurrence;
  }
  async completeOccurrence(id: string, current: AuthenticatedUser) {
    const actor = await this.context(current, "schedules.update");
    const found = await this.prisma.$queryRaw<OccurrenceRow[]>(
      Prisma.sql`SELECT * FROM "task_occurrences" WHERE "tenantId"=${actor.tenantId} AND "id"=${id}`,
    );
    if (!found[0]) throw new NotFoundException("Ocorrência não encontrada.");
    const task = await this.row(found[0].taskId, actor.tenantId);
    await this.visible(task, actor);
    let resolvedTask = task;
    const saved = await this.prisma.$transaction(async (tx) => {
      const locked = await this.row(task.id, actor.tenantId, tx, true);
      resolvedTask = locked;
      await this.visible(locked, actor);
      const existing = await tx.$queryRaw<OccurrenceRow[]>(
        Prisma.sql`SELECT * FROM "task_occurrences" WHERE "tenantId"=${actor.tenantId} AND "id"=${id} FOR UPDATE`,
      );
      if (!existing[0]) throw new NotFoundException("Ocorrência não encontrada.");
      if (existing[0].status === "completed") return existing[0];
      const rows = await tx.$queryRaw<OccurrenceRow[]>(
        Prisma.sql`UPDATE "task_occurrences" SET "status"='completed',"completedAt"=COALESCE("completedAt",CURRENT_TIMESTAMP) WHERE "tenantId"=${actor.tenantId} AND "id"=${id} AND "status"<>'cancelled' RETURNING *`,
      );
      if (!rows[0]) throw new ConflictException("Ocorrência cancelada não pode ser concluída.");
      await tx.$executeRaw(
        Prisma.sql`UPDATE "task_deliveries" SET "status"='cancelled' WHERE "tenantId"=${actor.tenantId} AND "occurrenceId"=${id} AND "status"='pending'`,
      );
      if (
        locked.payload.input.recurrence.frequency === "once" &&
        new Date(locked.payload.input.recurrence.startAt).getTime() === rows[0].dueAt.getTime()
      )
        await tx.$executeRaw(
          Prisma.sql`UPDATE "task_definitions" SET "status"='completed',"nextDueAt"=NULL,"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${actor.tenantId} AND "id"=${task.id}`,
        );
      await this.history(tx, task, "occurrence.completed", actor.membershipId, {}, id);
      return rows[0];
    });
    return this.serializeOccurrence(saved, resolvedTask);
  }
  async previewRecurrence(
    value: { recurrence: TaskInput["recurrence"] },
    current: AuthenticatedUser,
  ) {
    await this.context(current);
    try {
      validateTaskRecurrence(value.recurrence);
      return { dates: nextTaskOccurrences(value.recurrence, { after: new Date(), limit: 10 }) };
    } catch {
      throw new BadRequestException("Recorrência inválida.");
    }
  }
  async previewAudience(
    value: { audience: TaskInput["audience"]; connectionId?: string },
    current: AuthenticatedUser,
  ) {
    const actor = await this.context(current);
    if (value.connectionId) await this.connection(value.connectionId, actor);
    const recipients = await resolveTaskAudience(
      this.prisma,
      actor,
      value.audience,
      value.connectionId,
    );
    return {
      contactCount: recipients.filter((r) => r.kind === "contact").length,
      groupCount: recipients.filter((r) => r.kind === "group").length,
      total: recipients.length,
      sample: recipients.slice(0, 10).map(({ id, name, kind }) => ({ id, name, kind })),
    };
  }
  async filterFields(current: AuthenticatedUser) {
    return taskFilterFields(this.prisma, await this.context(current));
  }
  async options(current: AuthenticatedUser) {
    const actor = await this.context(current);
    const [memberships, contacts, groups, connections, customers, tags, tenant] = await Promise.all(
      [
        this.prisma.tenantMembership.findMany({
          where: {
            tenantId: actor.tenantId,
            status: "ACTIVE",
            user: { status: "ACTIVE" },
            role: { active: true },
          },
          include: { user: true, role: { include: { permissions: true } } },
        }),
        this.prisma.contact.findMany({
          where: taskContactScope(actor),
          select: { id: true, name: true },
          take: 5000,
          orderBy: { name: "asc" },
        }),
        this.prisma.conversation.findMany({
          where: {
            AND: [
              { tenantId: actor.tenantId, isGroup: true, archivedAt: null },
              conversationVisibilityWhere(actor),
            ],
          },
          select: { id: true, groupName: true, connectionId: true },
          take: 2000,
        }),
        this.prisma.messagingConnection.findMany({
          where: {
            tenantId: actor.tenantId,
            archivedAt: null,
            serviceEnabled: true,
            ...(actor.roleKey === "tenant_admin" ? {} : { id: { in: actor.connectionIds ?? [] } }),
          },
          select: { id: true, name: true, status: true },
        }),
        this.prisma.customer.findMany({
          where: {
            tenantId: actor.tenantId,
            archivedAt: null,
            ...(actor.roleKey === "tenant_admin"
              ? {}
              : { contacts: { some: taskContactScope(actor) } }),
          },
          select: { id: true, name: true },
          take: 5000,
        }),
        this.prisma.tag.findMany({
          where: {
            tenantId: actor.tenantId,
            ...(actor.roleKey === "tenant_admin"
              ? {}
              : { contacts: { some: { contact: taskContactScope(actor) } } }),
          },
          select: { id: true, name: true },
          take: 5000,
        }),
        this.prisma.tenant.findUnique({
          where: { id: actor.tenantId },
          select: { timezone: true },
        }),
      ],
    );
    return {
      memberships: memberships
        .filter((member) => effectivePermissions(member.role).includes("schedules.read"))
        .map((member) => ({ id: member.id, name: member.presentationName ?? member.user.name })),
      contacts,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.groupName ?? "Grupo",
        connectionId: group.connectionId,
      })),
      connections: connections.map((c) => ({ ...c, status: c.status.toLowerCase() })),
      customers,
      tags,
      timezone: tenant?.timezone ?? "America/Sao_Paulo",
    };
  }
  async settings(current: AuthenticatedUser) {
    await this.context(current);
    return this.settingsFor(current.tenantId);
  }
  async settingsFor(tenantId: string, db: TaskDb = this.prisma) {
    this.assertEnabled();
    const rows = await db.$queryRaw<Array<{ payload: TaskSettings }>>(
      Prisma.sql`SELECT "payload" FROM "task_settings" WHERE "tenantId"=${tenantId}`,
    );
    return rows[0]?.payload ?? TASK_DEFAULT_SETTINGS;
  }
  async saveSettings(value: unknown, current: AuthenticatedUser) {
    const actor = await this.context(current, "schedules.update");
    const settings = normalizeTaskSettings(value);
    const previous = await this.settingsFor(actor.tenantId);
    if (
      (settings.whatsappEnabled && !previous.whatsappEnabled) ||
      (settings.emailEnabled && !previous.emailEnabled)
    )
      permission(actor, "messages.send");
    if (settings.defaultSmtpAccountId)
      await this.smtpRow(settings.defaultSmtpAccountId, actor.tenantId);
    await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "task_settings" ("tenantId","payload") VALUES (${actor.tenantId},${json(settings)}::jsonb) ON CONFLICT("tenantId") DO UPDATE SET "payload"=EXCLUDED."payload","updatedAt"=CURRENT_TIMESTAMP`,
    );
    return settings;
  }
  async smtpRow(id: string, tenantId: string, db: TaskDb = this.prisma) {
    this.assertEnabled();
    const rows = await db.$queryRaw<SmtpRow[]>(
      Prisma.sql`SELECT * FROM "task_smtp_accounts" WHERE "tenantId"=${tenantId} AND "id"=${id} AND "archivedAt" IS NULL AND "active"=true`,
    );
    if (!rows[0]) throw new BadRequestException("Conta SMTP indisponível.");
    return rows[0];
  }
  private smtpPublic(row: SmtpRow): TaskSmtpAccount {
    const fingerprint = taskSmtpConfigurationFingerprint(row, row.credential);
    const validated =
      row.active &&
      !!row.lastVerifiedAt &&
      (!row.credential.connectionFingerprint ||
        row.credential.connectionFingerprint === fingerprint);
    const tested = validated && row.credential.lastTestFingerprint === fingerprint;
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      fromAddress: row.fromAddress,
      fromName: row.fromName,
      active: row.active,
      hasPassword: true,
      lastVerifiedAt: validated ? iso(row.lastVerifiedAt) : null,
      validationStatus: validated ? "validated" : "unvalidated",
      lastValidatedAt: validated ? iso(row.lastVerifiedAt) : null,
      lastTestAcceptedAt: tested ? (row.credential.lastTestAcceptedAt ?? null) : null,
      lastTestReference: tested ? (row.credential.lastTestReference ?? null) : null,
      lastTestMessageId: tested ? (row.credential.lastTestMessageId ?? null) : null,
      createdAt: iso(row.createdAt)!,
      updatedAt: iso(row.updatedAt)!,
    };
  }
  async smtpList(current: AuthenticatedUser) {
    const actor = await this.context(current);
    const rows = await this.prisma.$queryRaw<SmtpRow[]>(
      Prisma.sql`SELECT * FROM "task_smtp_accounts" WHERE "tenantId"=${actor.tenantId} AND "archivedAt" IS NULL ORDER BY "name" ASC`,
    );
    return rows.map((row) => this.smtpPublic(row));
  }
  private smtpAuditData(
    actor: AuthenticatedUser,
    id: string,
    action: string,
    reference: string,
    metadata: Record<string, unknown> = {},
  ) {
    return {
      actorUserId: actor.userId,
      actorPlatformRole: actor.platformRole,
      tenantId: actor.tenantId,
      action,
      targetType: "task_smtp_account",
      targetId: id,
      requestId: reference,
      metadataJson: { reference, ...metadata } as Prisma.InputJsonValue,
    };
  }
  private async smtpOutcomeAudit(
    actor: AuthenticatedUser,
    id: string,
    action: string,
    reference: string,
    metadata: Record<string, unknown> = {},
  ) {
    try {
      await this.prisma.platformAuditLog.create({
        data: this.smtpAuditData(actor, id, action, reference, metadata),
      });
      return true;
    } catch {
      this.logger.warn({ event: "tasks.smtp.audit_failed", reference, outcome: action });
      return false;
    }
  }
  async smtpSave(id: string | undefined, value: unknown, current: AuthenticatedUser) {
    const actor = await this.context(current, "schedules.update");
    const input = normalizeTaskSmtp(value);
    if (input.active) permission(actor, "messages.send");
    const accountId = id ?? randomUUID();
    let previous: SmtpRow | undefined;
    if (id) {
      const rows = await this.prisma.$queryRaw<SmtpRow[]>(
        Prisma.sql`SELECT * FROM "task_smtp_accounts" WHERE "tenantId"=${actor.tenantId} AND "id"=${id} AND "archivedAt" IS NULL`,
      );
      previous = rows[0];
      if (!previous) throw new NotFoundException("Conta SMTP não encontrada.");
      if (
        !input.password &&
        (previous.host !== input.host ||
          previous.port !== input.port ||
          previous.secure !== input.secure ||
          previous.username !== input.username)
      )
        throw new BadRequestException("Informe a senha ao alterar o servidor ou o usuário SMTP.");
    }
    if (!input.password && !previous) throw new BadRequestException("Informe a senha SMTP.");
    const base = input.password
      ? this.smtp.encrypt(input.password, actor.tenantId, accountId)
      : taskSmtpCredentialBase(previous!.credential);
    const fingerprint = taskSmtpConfigurationFingerprint(input, base);
    const unchanged =
      !!previous &&
      !input.password &&
      taskSmtpConfigurationFingerprint(previous, previous.credential) === fingerprint;
    const credential: TaskEncryptedPassword = { ...base };
    let validatedAt: Date | null = null;
    const reference = randomUUID();
    if (input.active) {
      try {
        await this.prisma.platformAuditLog.create({
          data: this.smtpAuditData(actor, accountId, "tasks.smtp.validation.requested", reference),
        });
      } catch {
        throw new ServiceUnavailableException({
          code: "TASK_SMTP_AUDIT_UNAVAILABLE",
          message: "Não foi possível registrar a solicitação. A conexão não foi testada.",
        });
      }
      try {
        const verified = await this.smtp.verify(
          input,
          input.password ?? this.smtp.decrypt(base, actor.tenantId, accountId),
        );
        if (!verified.verified) throw new Error("SMTP not validated");
      } catch (error) {
        await this.smtpOutcomeAudit(actor, accountId, "tasks.smtp.validation.failed", reference);
        if (error instanceof BadRequestException) throw error;
        throw new ServiceUnavailableException({
          code: "TASK_SMTP_CONNECTION_VALIDATION_FAILED",
          message:
            "Não foi possível validar a conexão SMTP. Confira as configurações e tente novamente.",
          details: { reference, retryable: false },
        });
      }
      validatedAt = new Date();
      credential.connectionFingerprint = fingerprint;
      if (unchanged && previous!.credential.lastTestFingerprint === fingerprint) {
        credential.lastTestAcceptedAt = previous!.credential.lastTestAcceptedAt;
        credential.lastTestReference = previous!.credential.lastTestReference;
        credential.lastTestMessageId = previous!.credential.lastTestMessageId;
        credential.lastTestFingerprint = fingerprint;
      }
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      const rows = id
        ? await tx.$queryRaw<SmtpRow[]>(
            Prisma.sql`UPDATE "task_smtp_accounts" SET "name"=${input.name},"host"=${input.host},"port"=${input.port},"secure"=${input.secure},"username"=${input.username},"fromAddress"=${input.fromAddress},"fromName"=${input.fromName},"credential"=${json(credential)}::jsonb,"active"=${input.active},"lastVerifiedAt"=${validatedAt},"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${actor.tenantId} AND "id"=${id} AND "archivedAt" IS NULL AND "updatedAt"=${previous!.updatedAt} AND "credential"=${json(previous!.credential)}::jsonb RETURNING *`,
          )
        : await tx.$queryRaw<SmtpRow[]>(
            Prisma.sql`INSERT INTO "task_smtp_accounts" ("id","tenantId","name","host","port","secure","username","fromAddress","fromName","credential","active","lastVerifiedAt") VALUES (${accountId},${actor.tenantId},${input.name},${input.host},${input.port},${input.secure},${input.username},${input.fromAddress},${input.fromName},${json(credential)}::jsonb,${input.active},${validatedAt}) RETURNING *`,
          );
      if (!rows[0])
        throw new ConflictException(
          "A conta SMTP foi alterada durante a validação. Atualize e tente novamente.",
        );
      await tx.platformAuditLog.create({
        data: this.smtpAuditData(
          actor,
          accountId,
          input.active ? "tasks.smtp.connection.validated" : "tasks.smtp.draft.saved",
          reference,
        ),
      });
      return rows[0];
    });
    return this.smtpPublic(saved);
  }
  async smtpRemove(id: string, current: AuthenticatedUser) {
    const actor = await this.context(current, "schedules.update");
    const affected = await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "task_smtp_accounts" SET "active"=false,"archivedAt"=CURRENT_TIMESTAMP,"lastVerifiedAt"=NULL,"credential"="credential"-'connectionFingerprint'-'lastTestAcceptedAt'-'lastTestReference'-'lastTestMessageId'-'lastTestFingerprint',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${actor.tenantId} AND "id"=${id}`,
    );
    if (!affected) throw new NotFoundException("Conta SMTP não encontrada.");
    return { deleted: true };
  }
  async smtpVerify(
    id: string,
    value: unknown,
    current: AuthenticatedUser,
  ): Promise<import("./task-contract").TaskSmtpTestResult> {
    const actor = await this.context(current, "schedules.update");
    permission(actor, "messages.send");
    const input = normalizeTaskSmtpTest(value);
    const account = await this.smtpRow(id, actor.tenantId);
    const reference = randomUUID();
    const messageId = `<${reference}@trixus.invalid>`;
    const recipientHash = createHash("sha256").update(input.recipient.toLowerCase()).digest("hex");
    try {
      await this.prisma.platformAuditLog.create({
        data: this.smtpAuditData(actor, id, "tasks.smtp.test.requested", reference, {
          recipientHash,
        }),
      });
    } catch {
      throw new ServiceUnavailableException({
        code: "TASK_SMTP_AUDIT_UNAVAILABLE",
        message: "Não foi possível registrar a solicitação. Nenhum e-mail de teste foi enviado.",
      });
    }
    let sendStarted = false;
    try {
      const password = this.smtp.decrypt(account.credential, actor.tenantId, id);
      sendStarted = true;
      const sent = await this.smtp.send(account, password, {
        to: input.recipient,
        subject: "Teste de e-mail — Trixus",
        body: `Este é um e-mail de teste do Trixus.\n\nData e hora (UTC): ${new Date().toISOString()}\nReferência: ${reference}\n\nO servidor SMTP aceitou este teste. O recebimento na caixa de entrada deve ser conferido por você.`,
        deliveryId: reference,
      });
      if (sent.accepted !== true) throw new TaskSmtpFailure(true);
    } catch (error) {
      const ambiguous = sendStarted && (!(error instanceof TaskSmtpFailure) || error.ambiguous);
      await this.smtpOutcomeAudit(
        actor,
        id,
        ambiguous ? "tasks.smtp.test.ambiguous" : "tasks.smtp.test.failed",
        reference,
        { recipientHash },
      );
      throw new ServiceUnavailableException({
        code: ambiguous ? "TASK_SMTP_TEST_OUTCOME_UNKNOWN" : "TASK_SMTP_TEST_FAILED",
        message: ambiguous
          ? "Não foi possível confirmar o resultado. Confira a caixa de entrada antes de solicitar um novo teste."
          : "O servidor SMTP não confirmou a aceitação do teste. Confira as configurações e tente novamente.",
        reference,
        retryable: false,
        details: { reference, retryable: false },
      });
    }
    const acceptedAt = new Date();
    const fingerprint = taskSmtpConfigurationFingerprint(account, account.credential);
    const credential = {
      ...account.credential,
      connectionFingerprint: fingerprint,
      lastTestAcceptedAt: acceptedAt.toISOString(),
      lastTestReference: reference,
      lastTestMessageId: messageId,
      lastTestFingerprint: fingerprint,
    };
    let configurationUnchanged = false;
    let auditRecorded = true;
    try {
      configurationUnchanged = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.$executeRaw(
          Prisma.sql`UPDATE "task_smtp_accounts" SET "credential"=${json(credential)}::jsonb,"lastVerifiedAt"=${acceptedAt},"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${actor.tenantId} AND "id"=${id} AND "active"=true AND "archivedAt" IS NULL AND "updatedAt"=${account.updatedAt} AND "credential"=${json(account.credential)}::jsonb`,
        );
        await tx.platformAuditLog.create({
          data: this.smtpAuditData(actor, id, "tasks.smtp.test.accepted", reference, {
            recipientHash,
            messageId,
            configurationUnchanged: changed === 1,
          }),
        });
        return changed === 1;
      });
    } catch {
      auditRecorded = false;
      this.logger.warn({ event: "tasks.smtp.audit_failed", reference, outcome: "accepted" });
    }
    return {
      verified: true,
      accepted: true,
      reference,
      messageId,
      message: "E-mail de teste aceito pelo servidor SMTP.",
      auditRecorded,
      configurationUnchanged,
    };
  }
  async popups(current: AuthenticatedUser) {
    const actor = await this.context(current);
    const rows = await this.prisma.$queryRaw<
      Array<{
        deliveryId: string;
        occurrenceId: string;
        taskId: string;
        snapshot: OccurrenceRow["snapshot"];
        dueAt: Date;
      }>
    >(
      Prisma.sql`SELECT d."id" AS "deliveryId",o."id" AS "occurrenceId",o."taskId",o."snapshot",o."dueAt" FROM "task_deliveries" d JOIN "task_occurrences" o ON o."id"=d."occurrenceId" JOIN "task_definitions" t ON t."id"=o."taskId" WHERE d."tenantId"=${actor.tenantId} AND d."destination"=${actor.membershipId} AND d."channel"='popup' AND d."status"='sent' AND d."dismissedAt" IS NULL AND o."status" NOT IN ('completed','cancelled') AND t."archivedAt" IS NULL ORDER BY d."createdAt" ASC LIMIT 20`,
    );
    const items = [];
    for (const row of rows) {
      try {
        const task = await this.row(row.taskId, actor.tenantId);
        await this.visible(task, actor);
        const recipientNames: string[] = [];
        for (const kind of ["contact", "group"] as const) {
          const selected = (row.snapshot.resolvedRecipients ?? []).filter(
            (recipient) => recipient.kind === kind,
          );
          if (!selected.length) continue;
          try {
            const allowed = await resolveTaskAudience(this.prisma, actor, {
              mode: kind === "group" ? "groups" : "contacts",
              selection: "fixed",
              contactIds: kind === "contact" ? selected.map((r) => r.id) : [],
              groupIds: kind === "group" ? selected.map((r) => r.id) : [],
              conditions: [],
            });
            const allowedIds = new Set(allowed.map((r) => r.id));
            recipientNames.push(...selected.filter((r) => allowedIds.has(r.id)).map((r) => r.name));
          } catch {
            /* Snapshot names are hidden after a scope/identity change. */
          }
        }
        items.push({
          deliveryId: row.deliveryId,
          occurrenceId: row.occurrenceId,
          taskId: row.taskId,
          title: row.snapshot.input.title,
          description: row.snapshot.input.description,
          priority: row.snapshot.input.priority,
          assignedName:
            row.snapshot.assignedNameSnapshot ??
            (
              await this.prisma.tenantMembership.findFirst({
                where: { id: row.snapshot.input.assignedMembershipId, tenantId: actor.tenantId },
                include: { user: true },
              })
            )?.user.name ??
            null,
          recipientNames,
          dueAt: iso(row.dueAt),
        });
      } catch {
        /* Do not expose a popup after scope revocation. */
      }
    }
    return { items };
  }
  async dismissPopup(id: string, current: AuthenticatedUser) {
    const actor = await this.context(current);
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "task_deliveries" SET "dismissedAt"=COALESCE("dismissedAt",CURRENT_TIMESTAMP) WHERE "tenantId"=${actor.tenantId} AND "id"=${id} AND "destination"=${actor.membershipId} AND "channel"='popup'`,
    );
    return { dismissed: true };
  }
}
export function date(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new BadRequestException("Data inválida.");
  return parsed;
}
export function range(start?: string, end?: string) {
  const from = start ? date(start) : new Date();
  const to = end ? date(end) : new Date(from.getTime() + 31 * 86400000);
  if (to < from || to.getTime() - from.getTime() > 93 * 86400000)
    throw new BadRequestException("Selecione um intervalo de até 93 dias.");
  return [from, to];
}
function pagination(query: TaskQuery) {
  const page = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1)));
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(query.pageSize) || 20)));
  return { page, pageSize };
}
