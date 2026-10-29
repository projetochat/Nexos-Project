import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma";
import { canReadContactAdditionalFields } from "../auth/contact-additional-fields-access";
import type { AuthenticatedUser } from "../auth/auth.types";
import { conversationVisibilityWhere } from "../conversations/conversation-visibility";
import type { TaskAudience, TaskCondition, TaskRecipient } from "./task-contract";
import type { PrismaService } from "../prisma/prisma.service";

type FieldType = "text" | "number" | "date" | "list" | "checkbox";
const native = [
  { key: "name", label: "Nome", type: "text" },
  { key: "email", label: "E-mail", type: "text" },
  { key: "phone", label: "Telefone", type: "text" },
  { key: "city", label: "Cidade do cliente", type: "text" },
  { key: "state", label: "Estado do cliente", type: "text" },
  { key: "customerId", label: "Cliente", type: "list" },
  { key: "tagIds", label: "Etiquetas", type: "list" },
] as const;
const operators: Record<FieldType, string[]> = {
  text: ["contains", "eq", "neq"],
  number: ["eq", "gt", "lt", "between"],
  date: ["eq", "gt", "lt", "between"],
  list: ["eq", "neq", "in"],
  checkbox: ["checked", "unchecked"],
};
export async function taskFilterFields(db: PrismaService, current: AuthenticatedUser) {
  const fields = canReadContactAdditionalFields(current)
    ? await db.contactCustomField.findMany({
        where: { tenantId: current.tenantId, archivedAt: null },
        orderBy: { position: "asc" },
      })
    : [];
  return {
    native: [...native],
    custom: fields.map((field) => ({
      key: `custom:${field.id}`,
      label: field.label,
      type: field.type.toLowerCase() as FieldType,
      options: field.options,
    })),
  };
}
export function matchesTaskCondition(actual: unknown, condition: TaskCondition, type: FieldType) {
  if (!operators[type].includes(condition.operator))
    throw new BadRequestException("Operador incompatível com o tipo do campo.");
  const { operator, value } = condition;
  if (Array.isArray(value) && !["between", "in"].includes(operator) && value.length !== 1)
    throw new BadRequestException("Operador exige exatamente um valor.");
  if (type === "checkbox")
    return operator === "checked"
      ? actual === true || actual === "true"
      : actual === false || actual === "false" || actual == null || actual === "";
  if (type === "number" || type === "date") {
    const parse = (v: unknown) =>
      type === "number"
        ? typeof v === "number" || (typeof v === "string" && v.trim() !== "")
          ? Number(v)
          : NaN
        : typeof v === "string"
          ? Date.parse(v)
          : NaN;
    const number = parse(actual);
    const values = (Array.isArray(value) ? value : [value]).map(parse);
    if (
      values.some((v) => !Number.isFinite(v)) ||
      (operator === "between" && (values.length !== 2 || values[0] > values[1]))
    )
      throw new BadRequestException("Valor do filtro inválido.");
    if (!Number.isFinite(number)) return false;
    return operator === "eq"
      ? number === values[0]
      : operator === "gt"
        ? number > values[0]
        : operator === "lt"
          ? number < values[0]
          : number >= values[0] && number <= values[1];
  }
  const values = Array.isArray(value) ? value : [value];
  if (values.some((v) => typeof v !== "string") || !values.length)
    throw new BadRequestException("Valor do filtro inválido.");
  const all = (Array.isArray(actual) ? actual : [actual]).map((v) =>
    String(v ?? "").toLocaleLowerCase("pt-BR"),
  );
  const expected = values.map((v) => String(v).toLocaleLowerCase("pt-BR"));
  if (operator === "contains") return all.some((v) => v.includes(expected[0]));
  const equal = all.some((v) => expected.includes(v));
  return operator === "neq" ? !equal : equal;
}
export function taskContactScope(
  current: AuthenticatedUser,
  historicalRead = false,
): Prisma.ContactWhereInput {
  return {
    tenantId: current.tenantId,
    ...(historicalRead ? {} : { archivedAt: null, active: true }),
    ...(current.roleKey === "tenant_admin"
      ? {}
      : {
          conversations: {
            some: {
              AND: [
                { tenantId: current.tenantId, ...(historicalRead ? {} : { archivedAt: null }) },
                conversationVisibilityWhere(current),
              ],
            },
          },
        }),
  };
}
export async function resolveTaskAudience(
  db: PrismaService,
  current: AuthenticatedUser,
  audience: TaskAudience,
  connectionId?: string,
  historicalRead = false,
): Promise<TaskRecipient[]> {
  if (
    !audience ||
    !["contacts", "groups", "filters"].includes(audience.mode) ||
    !["fixed", "dynamic"].includes(audience.selection)
  )
    throw new BadRequestException("Seleção de destinatários inválida.");
  const contactIds = [...new Set(audience.contactIds ?? [])];
  const groupIds = [...new Set(audience.groupIds ?? [])];
  if (contactIds.length + groupIds.length > 2000 || (audience.conditions ?? []).length > 30)
    throw new BadRequestException("Seleção excede o limite de destinatários ou filtros.");
  const recipients: TaskRecipient[] = [];
  if (audience.mode !== "groups") {
    const metadata =
      audience.mode === "filters"
        ? await taskFilterFields(db, current)
        : { native: [], custom: [] };
    const fields = new Map(
      [...metadata.native, ...metadata.custom].map((field) => [field.key, field]),
    );
    for (const condition of audience.conditions ?? []) {
      const field = fields.get(condition.field);
      if (
        audience.mode === "filters" &&
        (!field || !operators[field.type as FieldType]?.includes(condition.operator))
      )
        throw new BadRequestException("Campo ou operador de filtro inválido.");
    }
    const contacts = await db.contact.findMany({
      where: {
        AND: [
          taskContactScope(current, historicalRead),
          ...(audience.mode === "contacts" ? [{ id: { in: contactIds } }] : []),
          ...(connectionId
            ? [
                {
                  OR: [
                    { instanceIds: { has: connectionId } },
                    { conversations: { some: { connectionId } } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: {
        customer: true,
        tags: true,
        customFieldValues: { where: { tenantId: current.tenantId } },
      },
      take: 5001,
      orderBy: { id: "asc" },
    });
    if (contacts.length > 5000)
      throw new BadRequestException("Refine os filtros: seleção acima de 5000 contatos.");
    if (audience.mode === "contacts" && contacts.length !== contactIds.length)
      throw new BadRequestException("Contato indisponível no escopo autorizado.");
    for (const contact of contacts) {
      const values: Record<string, unknown> = {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        city: contact.customer?.tenantId === current.tenantId ? contact.customer.city : null,
        state: contact.customer?.tenantId === current.tenantId ? contact.customer.state : null,
        customerId: contact.customerId,
        tagIds: contact.tags.map((tag) => tag.tagId),
      };
      for (const field of contact.customFieldValues)
        values[`custom:${field.fieldId}`] = field.value;
      if (
        audience.mode === "filters" &&
        !(audience.conditions ?? []).every((condition) =>
          matchesTaskCondition(
            values[condition.field],
            condition,
            fields.get(condition.field)!.type as FieldType,
          ),
        )
      )
        continue;
      recipients.push({
        id: contact.id,
        name: contact.name,
        kind: "contact",
        email: contact.email,
        phone: contact.normalizedPhone,
      });
    }
  }
  if (audience.mode === "groups") {
    const groups = await db.conversation.findMany({
      where: {
        AND: [
          {
            tenantId: current.tenantId,
            id: { in: groupIds },
            ...(historicalRead ? {} : { archivedAt: null }),
            isGroup: true,
            ...(connectionId ? { connectionId } : {}),
          },
          conversationVisibilityWhere(current),
        ],
      },
      include: { contact: true },
    });
    if (groups.length !== groupIds.length)
      throw new BadRequestException("Grupo indisponível no escopo autorizado.");
    for (const group of groups) {
      if (!group.connectionId) throw new BadRequestException("Grupo sem instância válida.");
      recipients.push({
        id: group.id,
        name: group.groupName ?? group.contact?.name ?? "Grupo",
        kind: "group",
        email: null,
        phone: null,
        conversationId: group.id,
        connectionId: group.connectionId,
      });
    }
  }
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = recipient.kind + ":" + recipient.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
