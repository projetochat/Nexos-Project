import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { ContactCompanyRole, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { CreateContactDto } from "./dto/create-contact.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { ListContactsQueryDto } from "./dto/list-contacts-query.dto";
import { PaginationDto } from "./dto/pagination.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { normalizePhone } from "./phone-normalization";

const customerInclude = {
  contacts: { where: { archivedAt: null }, select: { id: true } },
} satisfies Prisma.CustomerInclude;

const contactInclude = {
  customer: { select: { id: true, name: true, color: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.ContactInclude;

@Controller("crm")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CrmController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
  ) {}

  @Get("customers")
  @RequirePermissions("crm.read")
  async listCustomers(@Query() query: PaginationDto, @CurrentUser() current: AuthenticatedUser) {
    const { page, pageSize, skip } = pagination(query);
    const q = query.q?.trim();
    const where: Prisma.CustomerWhereInput = {
      tenantId: current.tenantId,
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { responsibleContactName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
        include: customerInclude,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return paginated(
      items.map((customer) => this.serializeCustomer(customer)),
      total,
      page,
      pageSize,
    );
  }

  @Get("customers/:id")
  @RequirePermissions("crm.read")
  async findCustomer(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const customer = await this.findCustomerOrThrow(id, current.tenantId);
    return this.serializeCustomer(customer);
  }

  @Post("customers")
  @RequirePermissions("crm.manage")
  async createCustomer(@Body() dto: CreateCustomerDto, @CurrentUser() current: AuthenticatedUser) {
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: current.tenantId,
        name: dto.name.trim(),
        email: cleanNullable(dto.email),
        phone: cleanNullable(dto.phone),
        notes: cleanNullable(dto.notes),
        responsibleContactName: cleanNullable(dto.responsibleContactName),
        color: dto.color ?? "#6366f1",
      },
      include: customerInclude,
    });
    return this.serializeCustomer(customer);
  }

  @Patch("customers/:id")
  @RequirePermissions("crm.manage")
  async updateCustomer(
    @Param("id") id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerOrThrow(id, current.tenantId);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        email: nullableUpdate(dto.email),
        phone: nullableUpdate(dto.phone),
        notes: nullableUpdate(dto.notes),
        responsibleContactName: nullableUpdate(dto.responsibleContactName),
        color: dto.color,
      },
      include: customerInclude,
    });
    return this.serializeCustomer(customer);
  }

  @Delete("customers/:id")
  @RequirePermissions("crm.manage")
  async deleteCustomer(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.findCustomerOrThrow(id, current.tenantId);
    const customer = await this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { tenantId: current.tenantId, customerId: id, archivedAt: null },
        data: { customerId: null },
      });
      return tx.customer.update({
        where: { id },
        data: { archivedAt: new Date() },
        include: customerInclude,
      });
    });
    return this.serializeCustomer(customer);
  }

  @Get("customers/:id/contacts")
  @RequirePermissions("crm.read")
  async listCustomerContacts(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.findCustomerOrThrow(id, current.tenantId);
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId: current.tenantId, customerId: id, archivedAt: null },
      orderBy: [{ name: "asc" }],
      include: contactInclude,
    });
    return contacts.map((contact) => this.serializeContact(contact));
  }

  @Get("contacts")
  @RequirePermissions("crm.read")
  async listContacts(
    @Query() query: ListContactsQueryDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const { page, pageSize, skip } = pagination(query);
    const q = query.q?.trim();
    const qDigits = q?.replace(/\D/g, "") ?? "";
    const where: Prisma.ContactWhereInput = {
      tenantId: current.tenantId,
      archivedAt: null,
      ...(query.linked === "linked" ? { customerId: { not: null } } : {}),
      ...(query.linked === "unlinked" ? { customerId: null } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.instance ? { instance: query.instance } : {}),
      ...(query.department ? { departmentName: query.department } : {}),
      ...(query.tagId
        ? {
            tags: {
              some: {
                tenantId: current.tenantId,
                tagId: query.tagId,
                tag: { archivedAt: null },
              },
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              ...(qDigits
                ? [{ normalizedPhone: { contains: qDigits, mode: "insensitive" } } as const]
                : []),
              { email: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
        include: contactInclude,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return paginated(
      items.map((contact) => this.serializeContact(contact)),
      total,
      page,
      pageSize,
    );
  }

  @Get("contacts/options")
  @RequirePermissions("crm.read")
  async contactOptions(@CurrentUser() current: AuthenticatedUser) {
    const [instances, departments, tags] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where: { tenantId: current.tenantId, archivedAt: null, instance: { not: null } },
        distinct: ["instance"],
        select: { instance: true },
        orderBy: { instance: "asc" },
      }),
      this.prisma.contact.findMany({
        where: { tenantId: current.tenantId, archivedAt: null, departmentName: { not: null } },
        distinct: ["departmentName"],
        select: { departmentName: true },
        orderBy: { departmentName: "asc" },
      }),
      this.prisma.tag.findMany({
        where: { tenantId: current.tenantId, archivedAt: null },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      instances: instances.map((item) => item.instance).filter(Boolean),
      departments: departments.map((item) => item.departmentName).filter(Boolean),
      tags: tags.map((tag) => this.serializeTag(tag)),
    };
  }

  @Get("contacts/:id")
  @RequirePermissions("crm.read")
  async findContact(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const contact = await this.findContactOrThrow(id, current.tenantId);
    return this.serializeContact(contact);
  }

  @Post("contacts")
  @RequirePermissions("crm.manage")
  async createContact(@Body() dto: CreateContactDto, @CurrentUser() current: AuthenticatedUser) {
    await this.entitlements.assertTenantOperational(current.tenantId);
    await this.entitlements.assertWithinLimit(
      current.tenantId,
      "maxContacts",
      await this.prisma.contact.count({ where: { tenantId: current.tenantId, archivedAt: null } }),
    );
    const links = await this.resolveContactLinks(dto, current.tenantId);
    const normalizedPhone = normalizePhone(dto.phone);
    const existing = await this.prisma.contact.findFirst({
      where: { tenantId: current.tenantId, normalizedPhone },
      include: contactInclude,
    });
    if (existing?.archivedAt === null) {
      throw new ConflictException({
        code: "CONTACT_ALREADY_EXISTS",
        message: "Ja existe um contato ativo com este telefone.",
      });
    }
    if (existing?.archivedAt) {
      const contact = await this.prisma.$transaction(async (tx) => {
        await tx.contactTag.deleteMany({
          where: { contactId: existing.id, tenantId: current.tenantId },
        });
        if (links.tagIds.length) {
          await tx.contactTag.createMany({
            data: links.tagIds.map((tagId) => ({
              tenantId: current.tenantId,
              contactId: existing.id,
              tagId,
            })),
          });
        }
        return tx.contact.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
          data: {
            name: dto.name.trim(),
            phone: dto.phone.trim(),
            normalizedPhone,
            email: cleanNullable(dto.email),
            customerId: links.customerId,
            departmentId: links.departmentId,
            departmentName: cleanNullable(dto.departmentName),
            companyRole: dto.companyRole ?? null,
            instance: cleanNullable(dto.instance),
            archivedAt: null,
          },
          include: contactInclude,
        });
      });
      return this.serializeContact(contact, { lifecycle: "restored" });
    }
    try {
      const contact = await this.prisma.contact.create({
        data: {
          tenantId: current.tenantId,
          name: dto.name.trim(),
          phone: dto.phone.trim(),
          normalizedPhone,
          email: cleanNullable(dto.email),
          customerId: links.customerId,
          departmentId: links.departmentId,
          departmentName: cleanNullable(dto.departmentName),
          companyRole: dto.companyRole ?? null,
          instance: cleanNullable(dto.instance),
          tags: links.tagIds.length
            ? {
                createMany: {
                  data: links.tagIds.map((tagId) => ({ tenantId: current.tenantId, tagId })),
                },
              }
            : undefined,
        },
        include: contactInclude,
      });
      return this.serializeContact(contact, { lifecycle: "created" });
    } catch (error) {
      handlePrismaError(error);
    }
  }

  @Patch("contacts/:id")
  @RequirePermissions("crm.manage")
  async updateContact(
    @Param("id") id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findContactOrThrow(id, current.tenantId);
    const links = await this.resolveContactLinks(dto, current.tenantId);
    try {
      const contact = await this.prisma.$transaction(async (tx) => {
        if (dto.tagIds) {
          await tx.contactTag.deleteMany({ where: { contactId: id, tenantId: current.tenantId } });
          if (links.tagIds.length) {
            await tx.contactTag.createMany({
              data: links.tagIds.map((tagId) => ({
                tenantId: current.tenantId,
                contactId: id,
                tagId,
              })),
            });
          }
        }
        return tx.contact.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            phone: dto.phone?.trim(),
            normalizedPhone: dto.phone ? normalizePhone(dto.phone) : undefined,
            email: nullableUpdate(dto.email),
            customerId: dto.customerId === undefined ? undefined : links.customerId,
            departmentId: dto.departmentId === undefined ? undefined : links.departmentId,
            departmentName: nullableUpdate(dto.departmentName),
            companyRole: dto.companyRole === undefined ? undefined : dto.companyRole,
            instance: nullableUpdate(dto.instance),
          },
          include: contactInclude,
        });
      });
      this.realtime.publishContactUpdated({
        tenantId: current.tenantId,
        contactId: contact.id,
        contact: this.serializeContact(contact),
      });
      return this.serializeContact(contact);
    } catch (error) {
      handlePrismaError(error);
    }
  }

  @Delete("contacts/:id")
  @RequirePermissions("crm.manage")
  async deleteContact(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.findContactOrThrow(id, current.tenantId);
    const contact = await this.prisma.contact.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: contactInclude,
    });
    return this.serializeContact(contact);
  }

  @Get("tags")
  @RequirePermissions("crm.read")
  async listTags(@CurrentUser() current: AuthenticatedUser) {
    const tags = await this.prisma.tag.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: { name: "asc" },
    });
    return tags.map((tag) => this.serializeTag(tag));
  }

  private async findCustomerOrThrow(id: string, tenantId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: customerInclude,
    });
    if (!customer) throw new NotFoundException("Cliente nao encontrado.");
    return customer;
  }

  private async findContactOrThrow(id: string, tenantId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: contactInclude,
    });
    if (!contact) throw new NotFoundException("Contato nao encontrado.");
    return contact;
  }

  private async resolveContactLinks(
    dto: {
      customerId?: string | null;
      departmentId?: string | null;
      tagIds?: string[];
    },
    tenantId: string,
  ) {
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId, archivedAt: null },
      });
      if (!customer) throw new BadRequestException("Cliente inexistente para este tenant.");
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId, active: true },
      });
      if (!department) throw new BadRequestException("Departamento inexistente para este tenant.");
    }

    const tagIds = [...new Set(dto.tagIds ?? [])];
    if (tagIds.length) {
      const count = await this.prisma.tag.count({ where: { tenantId, id: { in: tagIds } } });
      if (count !== tagIds.length)
        throw new BadRequestException("Etiqueta inexistente para este tenant.");
    }

    return {
      customerId: dto.customerId || null,
      departmentId: dto.departmentId || null,
      tagIds,
    };
  }

  private serializeCustomer(
    customer: Prisma.CustomerGetPayload<{ include: typeof customerInclude }>,
  ) {
    return {
      id: customer.id,
      tenantId: customer.tenantId,
      nome: customer.name,
      email: customer.email,
      telefone: customer.phone,
      notas: customer.notes,
      contato_responsavel: customer.responsibleContactName,
      cor: customer.color,
      contactCount: customer.contacts.length,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  private serializeContact(
    contact: Prisma.ContactGetPayload<{ include: typeof contactInclude }>,
    meta?: { lifecycle?: "created" | "restored" },
  ) {
    return {
      id: contact.id,
      tenantId: contact.tenantId,
      nome: contact.name,
      telefone: contact.phone,
      normalizedPhone: contact.normalizedPhone,
      avatar_url: contact.avatarUrl,
      customer_id: contact.customerId,
      email: contact.email,
      departamento: contact.departmentName,
      departmentId: contact.departmentId,
      nivel_gerencia: roleLabel(contact.companyRole),
      instancia: contact.instance,
      customer: contact.customer
        ? { id: contact.customer.id, nome: contact.customer.name, cor: contact.customer.color }
        : null,
      tags: contact.tags.map((item) => this.serializeTag(item.tag)),
      lifecycle: meta?.lifecycle,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }

  private serializeTag(tag: { id: string; name: string; color: string }) {
    return { id: tag.id, nome: tag.name, cor: tag.color };
  }
}

function pagination(query: PaginationDto) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25);
  if (!Number.isInteger(page) || page < 1) throw new BadRequestException("Pagina invalida.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new BadRequestException("Tamanho de pagina invalido.");
  }
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function cleanNullable(value?: string | null) {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

function nullableUpdate(value?: string | null) {
  if (value === undefined) return undefined;
  return cleanNullable(value);
}

function roleLabel(role: ContactCompanyRole | null) {
  const labels: Record<ContactCompanyRole, string> = {
    COLABORADOR: "Colaborador",
    SUPERVISOR: "Supervisor",
    GERENTE: "Gerente",
    DIRETORIA: "Diretoria",
  };
  return role ? labels[role] : null;
}

function handlePrismaError(error: unknown): never {
  if (isPrismaError(error, "P2002")) {
    throw new ConflictException({
      code: "CONTACT_ALREADY_EXISTS",
      message: "Ja existe um contato ativo com este telefone.",
    });
  }
  throw error;
}

function isPrismaError(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
