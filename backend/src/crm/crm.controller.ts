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
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import {
  ContactCompanyRole,
  ContactCustomFieldType,
  MessagingConnectionStatus,
  MessagingProviderType,
  Prisma,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { ContactProfilePictureSyncService } from "../messaging/contact-profile-picture-sync.service";
import { EvolutionClient } from "../messaging/evolution/evolution.client";
import { CreateContactDto } from "./dto/create-contact.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { ListContactsQueryDto } from "./dto/list-contacts-query.dto";
import { PaginationDto } from "./dto/pagination.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import {
  contactPhoneDuplicateCandidates,
  groupContactIdentityFromPhone,
  normalizePhone,
} from "./phone-normalization";

class ContactCatalogDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  color?: string;
}

class ContactCustomFieldDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  type?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mask?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  tabName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  groupName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];
}

class ImportContactsFromAgendaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  connectionId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  selectedPhones?: string[];
}

class ReorderContactCustomFieldsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  fieldIds!: string[];
}

class BulkUpdateContactsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  contactIds?: string[];

  @IsOptional()
  @IsBoolean()
  allFiltered?: boolean;

  @IsOptional()
  @IsObject()
  filters?: Partial<ListContactsQueryDto>;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactDepartmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactProfileId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  instanceIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string | number | boolean | null>;

  @IsOptional()
  @IsBoolean()
  delete?: boolean;
}
const customerInclude = {
  contacts: { where: { archivedAt: null }, select: { id: true } },
} satisfies Prisma.CustomerInclude;

const contactInclude = {
  customer: { select: { id: true, name: true, color: true } },
  contactDepartment: { select: { id: true, name: true, color: true } },
  contactProfile: { select: { id: true, name: true, color: true } },
  tags: { include: { tag: true } },
  customFieldValues: { include: { field: true } },
} satisfies Prisma.ContactInclude;

const agendaImportedContactSelect = {
  id: true,
  tenantId: true,
  name: true,
  phone: true,
  normalizedPhone: true,
  avatarUrl: true,
  instance: true,
  instanceIds: true,
} satisfies Prisma.ContactSelect;

const EMPTY_CONTACT_FILTER_VALUE = "__empty__";

@Controller("crm")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CrmController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
    @Inject(ContactProfilePictureSyncService)
    private readonly profilePictures: ContactProfilePictureSyncService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
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
    await this.assertCustomerNameAvailable(dto.name, current.tenantId);
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: current.tenantId,
        name: dto.name.trim(),
        email: cleanNullable(dto.email),
        phone: cleanNullable(dto.phone),
        notes: cleanNullable(dto.notes),
        responsibleContactName: cleanNullable(dto.responsibleContactName),
        color: dto.color ?? "#3B82F6",
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
    if (dto.name) await this.assertCustomerNameAvailable(dto.name, current.tenantId, id);
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
      where: {
        tenantId: current.tenantId,
        customerId: id,
        archivedAt: null,
        NOT: { normalizedPhone: { startsWith: "group:" } },
      },
      orderBy: [{ name: "asc" }],
      include: contactInclude,
    });
    this.profilePictures.enqueueMissing({
      tenantId: current.tenantId,
      contacts,
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
    const where = await this.buildContactListWhere(query, current.tenantId);

    const [allItems, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        include: contactInclude,
      }),
      this.prisma.contact.count({ where }),
    ]);
    const items = allItems.sort(compareContactsByDisplayName).slice(skip, skip + pageSize);

    this.profilePictures.enqueueMissing({
      tenantId: current.tenantId,
      contacts: items,
    });

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
    const [connections, departments, profiles, tags] = await this.prisma.$transaction([
      this.prisma.messagingConnection.findMany({
        where: {
          tenantId: current.tenantId,
          archivedAt: null,
          status: { in: ["CONNECTED", "DISCONNECTED"] },
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          externalReference: true,
          ownerPhoneNormalized: true,
          status: true,
        },
      }),
      this.prisma.contactDepartment.findMany({
        where: { tenantId: current.tenantId, archivedAt: null },
        orderBy: { name: "asc" },
      }),
      this.prisma.contactProfile.findMany({
        where: { tenantId: current.tenantId, archivedAt: null },
        orderBy: { name: "asc" },
      }),
      this.prisma.tag.findMany({
        where: { tenantId: current.tenantId, archivedAt: null },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      instances: connections.map((connection) => ({
        id: connection.id,
        value: connection.id,
        name: connection.name,
        color: connection.color,
        externalReference: connection.externalReference,
        ownerPhone: connection.ownerPhoneNormalized,
        status: connection.status,
      })),
      departments: departments.map((item) => this.serializeContactCatalog(item)),
      profiles: profiles.map((item) => this.serializeContactCatalog(item)),
      tags: tags.map((tag) => this.serializeTag(tag)),
    };
  }

  @Get("contact-custom-fields")
  @RequirePermissions("crm.read")
  async listContactCustomFields(@CurrentUser() current: AuthenticatedUser) {
    const fields = await this.prisma.contactCustomField.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: [{ position: "asc" }, { label: "asc" }],
    });
    return fields.map((field) => this.serializeContactCustomField(field));
  }

  @Post("contact-custom-fields")
  @RequirePermissions("crm.manage")
  async createContactCustomField(
    @Body() dto: ContactCustomFieldDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const data = this.prepareContactCustomField(dto);
    await this.assertContactCustomFieldNameAvailable(data.label!, current.tenantId);
    await this.prisma.contactCustomField.updateMany({
      where: {
        tenantId: current.tenantId,
        normalizedName: data.normalizedName!,
        archivedAt: { not: null },
      },
      data: { normalizedName: `${data.normalizedName}__archived__${Date.now()}` },
    });
    const lastField = await this.prisma.contactCustomField.findFirst({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (lastField?.position ?? -1) + 1;
    const field = await this.prisma.contactCustomField.create({
      data: {
        tenantId: current.tenantId,
        label: data.label!,
        normalizedName: data.normalizedName!,
        type: data.type!,
        required: data.required ?? false,
        mask: data.mask,
        note: data.note,
        tabName: data.tabName!,
        groupName: data.groupName!,
        options: data.options,
        position,
      },
    });
    return this.serializeContactCustomField(field);
  }

  @Patch("contact-custom-fields/reorder")
  @RequirePermissions("crm.manage")
  async reorderContactCustomFields(
    @Body() dto: ReorderContactCustomFieldsDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const fieldIds = Array.from(new Set(dto.fieldIds ?? []));
    if (!fieldIds.length) throw new BadRequestException("Informe a ordem dos campos.");
    const fields = await this.prisma.contactCustomField.findMany({
      where: { tenantId: current.tenantId, id: { in: fieldIds }, archivedAt: null },
      select: { id: true },
    });
    if (fields.length !== fieldIds.length) {
      throw new BadRequestException("Alguns campos adicionais nao foram encontrados.");
    }
    await this.prisma.$transaction(
      fieldIds.map((id, position) =>
        this.prisma.contactCustomField.update({ where: { id }, data: { position } }),
      ),
    );
    const updated = await this.prisma.contactCustomField.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: [{ position: "asc" }, { label: "asc" }],
    });
    return updated.map((field) => this.serializeContactCustomField(field));
  }

  @Patch("contact-custom-fields/:id")
  @RequirePermissions("crm.manage")
  async updateContactCustomField(
    @Param("id") id: string,
    @Body() dto: ContactCustomFieldDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findContactCustomFieldOrThrow(id, current.tenantId);
    if (dto.label)
      await this.assertContactCustomFieldNameAvailable(dto.label, current.tenantId, id);
    const field = await this.prisma.contactCustomField.update({
      where: { id },
      data: this.prepareContactCustomField(dto, true),
    });
    return this.serializeContactCustomField(field);
  }

  @Delete("contact-custom-fields/:id")
  @RequirePermissions("crm.manage")
  async deleteContactCustomField(
    @Param("id") id: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const currentField = await this.findContactCustomFieldOrThrow(id, current.tenantId);
    const field = await this.prisma.contactCustomField.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        normalizedName: `${currentField.normalizedName}__archived__${Date.now()}`,
      },
    });
    return this.serializeContactCustomField(field);
  }

  @Patch("contacts/bulk")
  @RequirePermissions("crm.manage")
  async bulkUpdateContacts(
    @Body() dto: BulkUpdateContactsDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const allFiltered = dto.allFiltered === true;
    const contactIds = Array.from(new Set(dto.contactIds ?? []));
    if (!allFiltered && !contactIds.length)
      throw new BadRequestException("Selecione ao menos um contato.");

    const contactWhere = allFiltered
      ? await this.buildContactListWhere(dto.filters ?? {}, current.tenantId)
      : {
          tenantId: current.tenantId,
          id: { in: contactIds },
          archivedAt: null,
          NOT: { normalizedPhone: { startsWith: "group:" } },
        };
    const total = await this.prisma.contact.count({ where: contactWhere });
    if (!total) throw new BadRequestException("Selecione ao menos um contato.");
    if (!allFiltered && total !== contactIds.length)
      throw new BadRequestException("Alguns contatos nao foram encontrados.");

    const targetContactIds =
      allFiltered && (dto.customFields !== undefined || dto.tagIds !== undefined)
        ? (
            await this.prisma.contact.findMany({
              where: contactWhere,
              select: { id: true },
            })
          ).map((contact) => contact.id)
        : contactIds;

    if (dto.delete) {
      await this.prisma.contact.updateMany({
        where: contactWhere,
        data: { archivedAt: new Date() },
      });
      return { updated: total, deleted: true };
    }

    const links = await this.resolveContactLinks(dto, current.tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: contactWhere,
        data: {
          customerId: dto.customerId === undefined ? undefined : links.customerId,
          contactDepartmentId:
            dto.contactDepartmentId === undefined ? undefined : links.contactDepartmentId,
          contactProfileId: dto.contactProfileId === undefined ? undefined : links.contactProfileId,
          departmentName: dto.contactDepartmentId === undefined ? undefined : links.departmentName,
          email: nullableUpdate(dto.email),
          instance: dto.instanceIds === undefined ? undefined : links.instance,
          instanceIds: dto.instanceIds === undefined ? undefined : links.instanceIds,
        },
      });

      if (dto.customFields !== undefined) {
        for (const contactId of targetContactIds) {
          await this.saveProvidedContactCustomFields(
            tx,
            current.tenantId,
            contactId,
            dto.customFields,
          );
        }
      }

      if (dto.tagIds !== undefined) {
        await tx.contactTag.deleteMany({
          where: { tenantId: current.tenantId, contactId: { in: targetContactIds } },
        });
        if (links.tagIds.length) {
          await tx.contactTag.createMany({
            data: targetContactIds.flatMap((contactId) =>
              links.tagIds.map((tagId) => ({ tenantId: current.tenantId, contactId, tagId })),
            ),
          });
        }
      }
    });

    return { updated: total, deleted: false };
  }
  @Get("contacts/:id")
  @RequirePermissions("crm.read")
  async findContact(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const contact = await this.findContactOrThrow(id, current.tenantId);
    return this.serializeContact(contact);
  }

  @Post("contacts/import/agenda")
  @RequirePermissions("crm.manage")
  async importContactsFromAgenda(
    @Body() dto: ImportContactsFromAgendaDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.entitlements.assertTenantOperational(current.tenantId);
    if (!dto.selectedPhones?.length) {
      throw new BadRequestException("Selecione ao menos um contato para importar.");
    }
    const preview = await this.buildAgendaImportPreview(current.tenantId, dto.connectionId);
    const selectedPhones = new Set(dto.selectedPhones ?? []);
    const selectedIgnoredItems = new Map(
      preview.ignoredItems
        .filter(
          (item) =>
            item.importable && item.normalizedPhone && selectedPhones.has(item.normalizedPhone),
        )
        .map((item) => [item.normalizedPhone as string, item]),
    );
    const candidates = [
      ...preview.items.filter((item) => selectedPhones.has(item.normalizedPhone)),
      ...Array.from(selectedIgnoredItems.values()).map((item) => ({
          id: item.normalizedPhone as string,
          name: item.name,
          phone: item.normalizedPhone as string,
          normalizedPhone: item.normalizedPhone as string,
          avatarUrl: null,
        })),
    ];
    let imported = 0;
    let skipped = 0;
    const importedContacts: Array<{
      id: string;
      tenantId: string;
      name: string;
      phone: string;
      normalizedPhone: string;
      avatarUrl: string | null;
      instance: string | null;
      instanceIds: string[];
    }> = [];

    for (const item of candidates) {
      try {
        const existing = await this.prisma.contact.findFirst({
          where: {
            tenantId: current.tenantId,
            normalizedPhone: { in: contactPhoneDuplicateCandidates(item.normalizedPhone) },
          },
          select: { id: true, archivedAt: true },
        });
        if (existing?.archivedAt === null) {
          skipped += 1;
          continue;
        }
        await this.entitlements.assertWithinLimit(
          current.tenantId,
          "maxContacts",
          await this.prisma.contact.count({
            where: { tenantId: current.tenantId, archivedAt: null },
          }),
        );
        if (existing?.archivedAt) {
          const contact = await this.prisma.contact.update({
            where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
            data: {
              name: item.name,
              phone: item.phone,
              normalizedPhone: item.normalizedPhone,
              avatarUrl: null,
              instance: preview.connection.id,
              instanceIds: [preview.connection.id],
              archivedAt: null,
            },
            select: agendaImportedContactSelect,
          });
          importedContacts.push(contact);
        } else {
          const contact = await this.prisma.contact.create({
            data: {
              tenantId: current.tenantId,
              name: item.name,
              phone: item.phone,
              normalizedPhone: item.normalizedPhone,
              avatarUrl: null,
              instance: preview.connection.id,
              instanceIds: [preview.connection.id],
            },
            select: agendaImportedContactSelect,
          });
          importedContacts.push(contact);
        }
        imported += 1;
      } catch {
        skipped += 1;
      }
    }
    this.profilePictures.enqueueMissing({
      tenantId: current.tenantId,
      contacts: importedContacts,
    });

    return { total: candidates.length, imported, skipped: preview.skipped + skipped };
  }

  @Post("contacts/import/agenda/preview")
  @RequirePermissions("crm.manage")
  async previewContactsFromAgenda(
    @Body() dto: ImportContactsFromAgendaDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.entitlements.assertTenantOperational(current.tenantId);
    const preview = await this.buildAgendaImportPreview(current.tenantId, dto.connectionId);
    return {
      total: preview.total,
      skipped: preview.skipped,
      items: preview.items,
      ignoredItems: preview.ignoredItems,
    };
  }

  private async buildContactListWhere(
    query: Partial<ListContactsQueryDto>,
    tenantId: string,
  ): Promise<Prisma.ContactWhereInput> {
    const q = query.q?.trim();
    const qDigits = q?.replace(/\D/g, "") ?? "";
    const instanceKeys = query.instance
      ? await this.resolveInstanceFilterKeys(query.instance, tenantId)
      : [];
    const filterWithoutCustomer = query.customerId === EMPTY_CONTACT_FILTER_VALUE;
    const filterWithoutDepartment = query.department === EMPTY_CONTACT_FILTER_VALUE;
    const filterWithoutTags = query.tagId === EMPTY_CONTACT_FILTER_VALUE;

    return {
      tenantId,
      archivedAt: null,
      NOT: { normalizedPhone: { startsWith: "group:" } },
      ...(query.linked === "linked" ? { customerId: { not: null } } : {}),
      ...(query.linked === "unlinked" ? { customerId: null } : {}),
      ...(filterWithoutCustomer
        ? { customerId: null }
        : query.customerId
          ? { customerId: query.customerId }
          : {}),
      ...(query.instance
        ? {
            AND: [
              {
                OR: [
                  { instance: { in: instanceKeys } },
                  { instanceIds: { hasSome: instanceKeys } },
                ],
              },
            ],
          }
        : {}),
      ...(filterWithoutDepartment
        ? { contactDepartmentId: null }
        : query.department
          ? { contactDepartmentId: query.department }
          : {}),
      ...(filterWithoutTags
        ? {
            tags: {
              none: {
                tenantId,
                tag: { archivedAt: null },
              },
            },
          }
        : query.tagId
          ? {
              tags: {
                some: {
                  tenantId,
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
  }

  @Get("contact-departments")
  @RequirePermissions("crm.read")
  async listContactDepartments(@CurrentUser() current: AuthenticatedUser) {
    const rows = await this.prisma.contactDepartment.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: { name: "asc" },
    });
    return rows.map((item) => this.serializeContactCatalog(item));
  }

  @Post("contact-departments")
  @RequirePermissions("crm.manage")
  async createContactDepartment(
    @Body() dto: ContactCatalogDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException("Informe o nome.");
    await this.assertContactCatalogNameAvailable("department", name, current.tenantId);
    const item = await this.prisma.contactDepartment.create({
      data: {
        tenantId: current.tenantId,
        name,
        normalizedName: normalizeCatalogName(name),
        description: cleanNullable(dto.description),
        color: dto.color || "#3B82F6",
      },
    });
    return this.serializeContactCatalog(item);
  }

  @Patch("contact-departments/:id")
  @RequirePermissions("crm.manage")
  async updateContactDepartment(
    @Param("id") id: string,
    @Body() dto: ContactCatalogDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.assertContactCatalog("department", id, current.tenantId);
    if (dto.name)
      await this.assertContactCatalogNameAvailable("department", dto.name, current.tenantId, id);
    const item = await this.prisma.contactDepartment.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        normalizedName: dto.name ? normalizeCatalogName(dto.name) : undefined,
        description: nullableUpdate(dto.description),
        color: dto.color,
      },
    });
    return this.serializeContactCatalog(item);
  }

  @Delete("contact-departments/:id")
  @RequirePermissions("crm.manage")
  async deleteContactDepartment(
    @Param("id") id: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.assertContactCatalog("department", id, current.tenantId);
    const item = await this.prisma.contactDepartment.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.prisma.contact.updateMany({
      where: { tenantId: current.tenantId, contactDepartmentId: id },
      data: { contactDepartmentId: null },
    });
    return this.serializeContactCatalog(item);
  }

  @Get("contact-profiles")
  @RequirePermissions("crm.read")
  async listContactProfiles(@CurrentUser() current: AuthenticatedUser) {
    const rows = await this.prisma.contactProfile.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: { name: "asc" },
    });
    return rows.map((item) => this.serializeContactCatalog(item));
  }

  @Post("contact-profiles")
  @RequirePermissions("crm.manage")
  async createContactProfile(
    @Body() dto: ContactCatalogDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException("Informe o nome.");
    await this.assertContactCatalogNameAvailable("profile", name, current.tenantId);
    const item = await this.prisma.contactProfile.create({
      data: {
        tenantId: current.tenantId,
        name,
        normalizedName: normalizeCatalogName(name),
        description: cleanNullable(dto.description),
        color: dto.color || "#3B82F6",
      },
    });
    return this.serializeContactCatalog(item);
  }

  @Patch("contact-profiles/:id")
  @RequirePermissions("crm.manage")
  async updateContactProfile(
    @Param("id") id: string,
    @Body() dto: ContactCatalogDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.assertContactCatalog("profile", id, current.tenantId);
    if (dto.name)
      await this.assertContactCatalogNameAvailable("profile", dto.name, current.tenantId, id);
    const item = await this.prisma.contactProfile.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        normalizedName: dto.name ? normalizeCatalogName(dto.name) : undefined,
        description: nullableUpdate(dto.description),
        color: dto.color,
      },
    });
    return this.serializeContactCatalog(item);
  }

  @Delete("contact-profiles/:id")
  @RequirePermissions("crm.manage")
  async deleteContactProfile(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.assertContactCatalog("profile", id, current.tenantId);
    const item = await this.prisma.contactProfile.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.prisma.contact.updateMany({
      where: { tenantId: current.tenantId, contactProfileId: id },
      data: { contactProfileId: null },
    });
    return this.serializeContactCatalog(item);
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
    const normalizedPhone = groupContactIdentityFromPhone(dto.phone) ?? normalizePhone(dto.phone);
    const phoneCandidates = contactPhoneDuplicateCandidates(dto.phone);
    const existing = await this.prisma.contact.findFirst({
      where: { tenantId: current.tenantId, normalizedPhone: { in: phoneCandidates } },
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
        await this.saveContactCustomFields(tx, current.tenantId, existing.id, dto.customFields);
        return tx.contact.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
          data: {
            name: dto.name.trim(),
            phone: dto.phone.trim(),
            normalizedPhone,
            email: cleanNullable(dto.email),
            avatarUrl: cleanNullable(dto.avatarUrl),
            customerId: links.customerId,
            departmentId: links.departmentId,
            contactDepartmentId: links.contactDepartmentId,
            contactProfileId: links.contactProfileId,
            departmentName: links.departmentName,
            companyRole: dto.companyRole ?? null,
            instance: links.instance,
            instanceIds: links.instanceIds,
            archivedAt: null,
          },
          include: contactInclude,
        });
      });
      return this.serializeContact(contact, { lifecycle: "restored" });
    }
    try {
      const contact = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contact.create({
          data: {
            tenantId: current.tenantId,
            name: dto.name.trim(),
            phone: dto.phone.trim(),
            normalizedPhone,
            email: cleanNullable(dto.email),
            avatarUrl: cleanNullable(dto.avatarUrl),
            customerId: links.customerId,
            departmentId: links.departmentId,
            contactDepartmentId: links.contactDepartmentId,
            contactProfileId: links.contactProfileId,
            departmentName: links.departmentName,
            companyRole: dto.companyRole ?? null,
            instance: links.instance,
            instanceIds: links.instanceIds,
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
        await this.saveContactCustomFields(tx, current.tenantId, created.id, dto.customFields);
        return tx.contact.findUniqueOrThrow({ where: { id: created.id }, include: contactInclude });
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
    const currentContact = await this.findContactOrThrow(id, current.tenantId);
    const currentGroupIdentity = currentContact.normalizedPhone.startsWith("group:")
      ? currentContact.normalizedPhone
      : null;
    if (dto.phone) {
      const phoneCandidates = currentGroupIdentity
        ? [currentGroupIdentity]
        : contactPhoneDuplicateCandidates(dto.phone);
      const duplicate = await this.prisma.contact.findFirst({
        where: {
          tenantId: current.tenantId,
          normalizedPhone: { in: phoneCandidates },
          archivedAt: null,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException({
          code: "CONTACT_PHONE_ALREADY_EXISTS",
          message: "Já existe um contato ativo com este WhatsApp.",
        });
      }
    }
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
        await this.saveContactCustomFields(tx, current.tenantId, id, dto.customFields);
        return tx.contact.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            phone:
              dto.phone === undefined
                ? undefined
                : currentGroupIdentity
                  ? currentContact.phone
                  : dto.phone.trim(),
            normalizedPhone:
              dto.phone === undefined
                ? undefined
                : currentGroupIdentity
                  ? currentGroupIdentity
                  : (groupContactIdentityFromPhone(dto.phone) ?? normalizePhone(dto.phone)),
            email: nullableUpdate(dto.email),
            avatarUrl: nullableUpdate(dto.avatarUrl),
            customerId: dto.customerId === undefined ? undefined : links.customerId,
            departmentId: dto.departmentId === undefined ? undefined : links.departmentId,
            contactDepartmentId:
              dto.contactDepartmentId === undefined ? undefined : links.contactDepartmentId,
            contactProfileId:
              dto.contactProfileId === undefined ? undefined : links.contactProfileId,
            departmentName:
              dto.contactDepartmentId === undefined ? undefined : links.departmentName,
            companyRole: dto.companyRole === undefined ? undefined : dto.companyRole,
            instance:
              dto.instanceIds === undefined && dto.instance === undefined
                ? undefined
                : links.instance,
            instanceIds: dto.instanceIds === undefined ? undefined : links.instanceIds,
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
      include: {
        contacts: {
          where: { contact: { archivedAt: null } },
          include: { contact: { select: { id: true, customerId: true } } },
        },
      },
    });
    return Promise.all(
      tags.map(async (tag) => {
        const contactIds = tag.contacts.map((item) => item.contactId);
        const conversationCount = contactIds.length
          ? await this.prisma.conversation.count({
              where: {
                tenantId: current.tenantId,
                archivedAt: null,
                contactId: { in: contactIds },
              },
            })
          : 0;
        const customerCount = new Set(
          tag.contacts.map((item) => item.contact.customerId).filter(Boolean),
        ).size;
        return this.serializeTag(tag, { conversationCount, customerCount });
      }),
    );
  }

  private async findCustomerOrThrow(id: string, tenantId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: customerInclude,
    });
    if (!customer) throw new NotFoundException("Cliente nao encontrado.");
    return customer;
  }

  private async assertCustomerNameAvailable(name: string, tenantId: string, ignoreId?: string) {
    const cleanName = name.trim().replace(/\s+/g, " ");
    const duplicate = await this.prisma.customer.findFirst({
      where: {
        tenantId,
        archivedAt: null,
        name: { equals: cleanName, mode: "insensitive" },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: "CUSTOMER_ALREADY_EXISTS",
        message: `Empresa do Contato "${cleanName}" já existente.`,
      });
    }
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
      contactDepartmentId?: string | null;
      contactProfileId?: string | null;
      departmentName?: string | null;
      instance?: string | null;
      instanceIds?: string[];
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

    let contactDepartment: Awaited<
      ReturnType<typeof this.prisma.contactDepartment.findFirst>
    > | null = null;
    if (dto.contactDepartmentId) {
      contactDepartment = await this.prisma.contactDepartment.findFirst({
        where: { id: dto.contactDepartmentId, tenantId, archivedAt: null },
      });
      if (!contactDepartment)
        throw new BadRequestException("Departamento do contato inexistente para este tenant.");
    }

    let contactProfile: Awaited<ReturnType<typeof this.prisma.contactProfile.findFirst>> | null =
      null;
    if (dto.contactProfileId) {
      contactProfile = await this.prisma.contactProfile.findFirst({
        where: { id: dto.contactProfileId, tenantId, archivedAt: null },
      });
      if (!contactProfile)
        throw new BadRequestException("Perfil do contato inexistente para este tenant.");
    }

    const requestedInstances = [
      ...new Set((dto.instanceIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    const fallbackInstance = cleanNullable(dto.instance);
    const instanceKeys = fallbackInstance
      ? [...new Set([...requestedInstances, fallbackInstance])]
      : requestedInstances;
    let instanceIds: string[] = [];
    if (instanceKeys.length) {
      const connections = await this.prisma.messagingConnection.findMany({
        where: {
          tenantId,
          archivedAt: null,
          OR: [{ id: { in: instanceKeys } }, { externalReference: { in: instanceKeys } }],
        },
        select: { id: true, externalReference: true },
      });
      const connectionByKey = new Map<string, string>();
      for (const connection of connections) {
        connectionByKey.set(connection.id, connection.id);
        if (connection.externalReference)
          connectionByKey.set(connection.externalReference, connection.id);
      }
      instanceIds = requestedInstances
        .map((key) => connectionByKey.get(key))
        .filter(Boolean) as string[];
      if (!requestedInstances.length && fallbackInstance) {
        const resolvedFallback = connectionByKey.get(fallbackInstance);
        if (resolvedFallback) instanceIds = [resolvedFallback];
      }
      const missing = instanceKeys.some((key) => !connectionByKey.has(key));
      if (missing) throw new BadRequestException("Instancia inexistente para este tenant.");
    }
    const instance = instanceIds[0] ?? fallbackInstance;

    const tagIds = [...new Set(dto.tagIds ?? [])];
    if (tagIds.length) {
      const count = await this.prisma.tag.count({ where: { tenantId, id: { in: tagIds } } });
      if (count !== tagIds.length)
        throw new BadRequestException("Etiqueta inexistente para este tenant.");
    }

    return {
      customerId: dto.customerId || null,
      departmentId: dto.departmentId || null,
      contactDepartmentId: dto.contactDepartmentId || null,
      contactProfileId: dto.contactProfileId || null,
      departmentName: contactDepartment?.name ?? cleanNullable(dto.departmentName),
      instance,
      instanceIds: instanceIds.length ? instanceIds : fallbackInstance ? [fallbackInstance] : [],
      tagIds,
    };
  }

  private async buildAgendaImportPreview(tenantId: string, connectionId?: string | null) {
    const connection = await this.resolveAgendaImportConnection(tenantId, connectionId);
    const contacts = await this.evolution.findContacts({
      instanceName: connection.externalReference,
    });
    const byPhone = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        normalizedPhone: string;
        avatarUrl: string | null;
      }
    >();
    let ignoredItems: Array<{
      name: string;
      phone: string;
      normalizedPhone: string | null;
      reason: string;
      importable: boolean;
    }> = [];

    for (const item of contacts) {
      const name = importedEvolutionContactName(item);
      const rawPhone = importedEvolutionContactRawPhone(item);
      try {
        if (item.isGroup) {
          ignoredItems.push({
            name: name ?? "Grupo WhatsApp",
            phone: rawPhone,
            normalizedPhone: null,
            reason: "Grupo WhatsApp",
            importable: false,
          });
          continue;
        }
        const phone = importedEvolutionContactPhone(item);
        if (!phone || !name) {
          ignoredItems.push({
            name: name ?? "",
            phone: phone || rawPhone,
            normalizedPhone: null,
            reason: !phone ? "Telefone indisponivel" : "Nome indisponivel",
            importable: false,
          });
          continue;
        }
        if (groupContactIdentityFromPhone(phone)) {
          ignoredItems.push({
            name,
            phone,
            normalizedPhone: null,
            reason: "Grupo WhatsApp",
            importable: false,
          });
          continue;
        }
        const normalizedPhone = normalizePhone(phone);
        if (item.type === "group_member") {
          ignoredItems.push({
            name,
            phone: normalizedPhone,
            normalizedPhone,
            reason: "Contato de grupo",
            importable: false,
          });
          continue;
        }
        if (byPhone.has(normalizedPhone)) {
          ignoredItems.push({
            name,
            phone: normalizedPhone,
            normalizedPhone,
            reason: "Telefone duplicado na agenda",
            importable: false,
          });
          continue;
        }
        byPhone.set(normalizedPhone, {
          id: normalizedPhone,
          name: name.slice(0, 120),
          phone: normalizedPhone,
          normalizedPhone,
          avatarUrl: null,
        });
      } catch {
        ignoredItems.push({
          name: name ?? "",
          phone: rawPhone,
          normalizedPhone: null,
          reason: "Telefone invalido",
          importable: false,
        });
      }
    }

    const candidates = [...byPhone.values()];
    const importableIgnoredPhones = ignoredItems
      .map((item) => item.normalizedPhone)
      .filter((phone): phone is string => Boolean(phone));
    const duplicateLookupPhones = [
      ...candidates.map((item) => item.normalizedPhone),
      ...importableIgnoredPhones,
    ];
    if (!duplicateLookupPhones.length) {
      return {
        connection,
        total: contacts.length,
        skipped: ignoredItems.length,
        items: [],
        ignoredItems,
      };
    }

    const existingContacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        normalizedPhone: {
          in: duplicateLookupPhones.flatMap((phone) => contactPhoneDuplicateCandidates(phone)),
        },
      },
      select: { normalizedPhone: true, archivedAt: true },
    });
    const activePhones = new Set(
      existingContacts
        .filter((item) => item.archivedAt === null)
        .map((item) => item.normalizedPhone),
    );
    const items = candidates.filter((item) => !activePhones.has(item.normalizedPhone));
    ignoredItems = ignoredItems.map((item) =>
      item.importable && item.normalizedPhone && activePhones.has(item.normalizedPhone)
        ? { ...item, reason: "Contato ja cadastrado ativo", importable: false }
        : item,
    );
    ignoredItems.push(
      ...candidates
        .filter((item) => activePhones.has(item.normalizedPhone))
        .map((item) => ({
          name: item.name,
          phone: item.normalizedPhone,
          normalizedPhone: item.normalizedPhone,
          reason: "Contato ja cadastrado ativo",
          importable: false,
        })),
    );

    return {
      connection,
      total: contacts.length,
      skipped: ignoredItems.length,
      items,
      ignoredItems,
    };
  }

  private async resolveAgendaImportConnection(tenantId: string, connectionId?: string | null) {
    const connectionKey = cleanNullable(connectionId);
    const connections = await this.prisma.messagingConnection.findMany({
      where: {
        tenantId,
        archivedAt: null,
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: { not: null },
        ...(connectionKey
          ? {
              OR: [
                { id: connectionKey },
                { externalReference: connectionKey },
                { name: connectionKey },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take: connectionKey ? 1 : 2,
    });

    if (!connections.length) {
      throw new BadRequestException(
        connectionKey
          ? "Instancia WhatsApp conectada nao encontrada."
          : "Nenhuma instancia WhatsApp conectada para importar agenda.",
      );
    }
    if (!connectionKey && connections.length > 1) {
      throw new BadRequestException("Selecione uma instancia WhatsApp para importar agenda.");
    }

    const connection = connections[0];
    if (!connection.externalReference) {
      throw new BadRequestException("Instancia WhatsApp sem referencia Evolution.");
    }
    return connection as typeof connection & { externalReference: string };
  }

  private async assertContactCatalog(kind: "department" | "profile", id: string, tenantId: string) {
    const item =
      kind === "department"
        ? await this.prisma.contactDepartment.findFirst({
            where: { id, tenantId, archivedAt: null },
          })
        : await this.prisma.contactProfile.findFirst({
            where: { id, tenantId, archivedAt: null },
          });
    if (!item) throw new NotFoundException("Item nao encontrado.");
  }

  private async assertContactCatalogNameAvailable(
    kind: "department" | "profile",
    name: string,
    tenantId: string,
    ignoreId?: string,
  ) {
    const cleanName = name.trim().replace(/\s+/g, " ");
    const normalizedName = normalizeCatalogName(cleanName);
    const duplicate =
      kind === "department"
        ? await this.prisma.contactDepartment.findFirst({
            where: {
              tenantId,
              archivedAt: null,
              normalizedName,
              ...(ignoreId ? { id: { not: ignoreId } } : {}),
            },
            select: { id: true },
          })
        : await this.prisma.contactProfile.findFirst({
            where: {
              tenantId,
              archivedAt: null,
              normalizedName,
              ...(ignoreId ? { id: { not: ignoreId } } : {}),
            },
            select: { id: true },
          });
    if (duplicate) {
      throw new ConflictException({
        code:
          kind === "department"
            ? "CONTACT_DEPARTMENT_ALREADY_EXISTS"
            : "CONTACT_PROFILE_ALREADY_EXISTS",
        message:
          kind === "department"
            ? `Departamento do Contato "${cleanName}" já existente.`
            : `Perfil do Contato "${cleanName}" já existente.`,
      });
    }
  }

  private async assertContactCustomFieldNameAvailable(
    label: string,
    tenantId: string,
    ignoreId?: string,
  ) {
    const cleanLabel = label.trim().replace(/\s+/g, " ");
    const duplicate = await this.prisma.contactCustomField.findFirst({
      where: {
        tenantId,
        archivedAt: null,
        normalizedName: normalizeCatalogName(cleanLabel),
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: "CONTACT_CUSTOM_FIELD_ALREADY_EXISTS",
        message: `Campo Adicional "${cleanLabel}" já existente.`,
      });
    }
  }

  private prepareContactCustomField(dto: ContactCustomFieldDto, partial = false) {
    const label = dto.label?.trim();
    if (!partial && !label) throw new BadRequestException("Informe o nome do campo.");
    const type = dto.type
      ? parseContactCustomFieldType(dto.type)
      : partial
        ? undefined
        : ContactCustomFieldType.TEXT;
    const options =
      type === ContactCustomFieldType.LIST
        ? unique((dto.options ?? []).map((item) => item.trim()).filter(Boolean))
        : [];
    if (type === ContactCustomFieldType.LIST && options.length === 0) {
      throw new BadRequestException("Informe ao menos uma opcao para a lista.");
    }
    const tabName = cleanNullable(dto.tabName) ?? (partial ? undefined : "Dados Adicionais");
    const groupName =
      dto.groupName === undefined ? (partial ? undefined : "") : dto.groupName.trim();
    if (tabName?.toLowerCase() === "geral") {
      throw new BadRequestException("A aba Geral e reservada para os campos padrao do contato.");
    }
    if (groupName?.toLowerCase() === "dados do contato") {
      throw new BadRequestException(
        "Este agrupamento e reservado para os campos padrao do contato.",
      );
    }
    return {
      label: label || undefined,
      normalizedName: label ? normalizeCatalogName(label) : undefined,
      type,
      required: dto.required,
      mask:
        type === ContactCustomFieldType.NUMBER
          ? (cleanNullable(dto.mask) ?? "0,00")
          : type === ContactCustomFieldType.TEXT ||
              type === ContactCustomFieldType.DATE ||
              type === ContactCustomFieldType.LIST ||
              type === ContactCustomFieldType.CHECKBOX
            ? cleanNullable(dto.mask)
            : null,
      note: nullableUpdate(dto.note),
      tabName,
      groupName,
      options,
    };
  }

  private async findContactCustomFieldOrThrow(id: string, tenantId: string) {
    const field = await this.prisma.contactCustomField.findFirst({
      where: { id, tenantId, archivedAt: null },
    });
    if (!field) throw new NotFoundException("Campo adicional nao encontrado.");
    return field;
  }

  private async resolveInstanceFilterKeys(instance: string, tenantId: string) {
    const value = instance.trim();
    const connection = await this.prisma.messagingConnection.findFirst({
      where: {
        tenantId,
        archivedAt: null,
        OR: [{ id: value }, { externalReference: value }, { name: value }],
      },
      select: { id: true, externalReference: true, name: true },
    });
    return unique(
      [value, connection?.id, connection?.externalReference, connection?.name].filter(
        (item): item is string => Boolean(item),
      ),
    );
  }

  private async saveContactCustomFields(
    tx: Prisma.TransactionClient,
    tenantId: string,
    contactId: string,
    values?: Record<string, string | number | boolean | null>,
  ) {
    if (values === undefined) return;
    const fields = await tx.contactCustomField.findMany({ where: { tenantId, archivedAt: null } });
    for (const field of fields) {
      const raw = values[field.id];
      const value = normalizeContactCustomFieldValue(field, raw);
      if (field.required && !value)
        throw new BadRequestException(`Campo obrigatorio: ${field.label}.`);
      if (
        field.type === ContactCustomFieldType.LIST &&
        value &&
        !validContactListValue(field, value)
      ) {
        throw new BadRequestException(`Opcao invalida para ${field.label}.`);
      }
      await tx.contactCustomFieldValue.upsert({
        where: { contactId_fieldId: { contactId, fieldId: field.id } },
        create: { tenantId, contactId, fieldId: field.id, value },
        update: { value },
      });
    }
  }

  private async saveProvidedContactCustomFields(
    tx: Prisma.TransactionClient,
    tenantId: string,
    contactId: string,
    values: Record<string, string | number | boolean | null>,
  ) {
    const fieldIds = Object.keys(values);
    if (!fieldIds.length) return;
    const fields = await tx.contactCustomField.findMany({
      where: { tenantId, id: { in: fieldIds }, archivedAt: null },
    });
    if (fields.length !== fieldIds.length) {
      throw new BadRequestException("Alguns campos adicionais nao foram encontrados.");
    }
    for (const field of fields) {
      const raw = values[field.id];
      const value = normalizeContactCustomFieldValue(field, raw);
      if (field.required && !value)
        throw new BadRequestException(`Campo obrigatorio: ${field.label}.`);
      if (
        field.type === ContactCustomFieldType.LIST &&
        value &&
        !validContactListValue(field, value)
      ) {
        throw new BadRequestException(`Opcao invalida para ${field.label}.`);
      }
      await tx.contactCustomFieldValue.upsert({
        where: { contactId_fieldId: { contactId, fieldId: field.id } },
        create: { tenantId, contactId, fieldId: field.id, value },
        update: { value },
      });
    }
  }

  private serializeContactCustomField(field: {
    id: string;
    tenantId: string;
    label: string;
    type: ContactCustomFieldType;
    required: boolean;
    mask: string | null;
    note: string | null;
    tabName: string;
    groupName: string;
    options: string[];
    position: number;
    createdAt?: Date;
    updatedAt?: Date;
    archivedAt?: Date | null;
  }) {
    return {
      id: field.id,
      tenantId: field.tenantId,
      label: field.label,
      type: field.type.toLowerCase(),
      required: field.required,
      mask: field.mask,
      note: field.note,
      tabName:
        field.tabName?.toLowerCase() === "geral"
          ? "Dados Adicionais"
          : field.tabName || "Dados Adicionais",
      groupName: field.groupName?.toLowerCase() === "dados do contato" ? "" : field.groupName || "",
      options: field.options,
      position: field.position,
      createdAt: field.createdAt,
      updatedAt: field.updatedAt,
      archivedAt: field.archivedAt,
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
    const instanceIds = contact.instanceIds.length
      ? contact.instanceIds
      : contact.instance
        ? [contact.instance]
        : [];
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
      contactDepartmentId: contact.contactDepartmentId,
      contactDepartment: contact.contactDepartment
        ? {
            id: contact.contactDepartment.id,
            nome: contact.contactDepartment.name,
            cor: contact.contactDepartment.color,
          }
        : null,
      contactProfileId: contact.contactProfileId,
      contactProfile: contact.contactProfile
        ? {
            id: contact.contactProfile.id,
            nome: contact.contactProfile.name,
            cor: contact.contactProfile.color,
          }
        : null,
      nivel_gerencia: roleLabel(contact.companyRole),
      instancia: contact.instance,
      instanceIds,
      customer: contact.customer
        ? { id: contact.customer.id, nome: contact.customer.name, cor: contact.customer.color }
        : null,
      tags: contact.tags.map((item) => this.serializeTag(item.tag)),
      customFields: Object.fromEntries(
        contact.customFieldValues.map((item) => [item.fieldId, item.value]),
      ),
      customFieldValues: contact.customFieldValues.map((item) => ({
        fieldId: item.fieldId,
        label: item.field.label,
        type: item.field.type,
        value: item.value,
      })),
      lifecycle: meta?.lifecycle,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }

  private serializeContactCatalog(item: {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    color: string;
    archivedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: item.id,
      tenantId: item.tenantId,
      nome: item.name,
      descricao: item.description,
      cor: item.color,
      archivedAt: item.archivedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeTag(
    tag: { id: string; name: string; color: string },
    counts?: { conversationCount?: number; customerCount?: number },
  ) {
    return {
      id: tag.id,
      nome: tag.name,
      cor: tag.color,
      conversationCount: counts?.conversationCount,
      customerCount: counts?.customerCount,
    };
  }
}

function parseContactCustomFieldType(value: string) {
  const normalized = value.trim().toUpperCase();
  if (["TEXT", "NUMBER", "CHECKBOX", "LIST", "DATE"].includes(normalized)) {
    return normalized as ContactCustomFieldType;
  }
  throw new BadRequestException("Tipo de campo invalido.");
}

function normalizeContactCustomFieldValue(
  field: { type: ContactCustomFieldType; mask: string | null },
  raw: string | number | boolean | null | undefined,
) {
  const value = raw === undefined || raw === null ? "" : String(raw).trim();
  if (field.type === ContactCustomFieldType.LIST && isMultiListField(field.mask)) {
    const selected = parseMultiListValue(value);
    return selected.length ? JSON.stringify(selected) : "";
  }
  if (!value || field.type !== ContactCustomFieldType.DATE) return value;
  return parseContactCustomDateValue(value, field.mask) ?? value;
}

function validContactListValue(field: { mask: string | null; options: string[] }, value: string) {
  if (!isMultiListField(field.mask)) return field.options.includes(value);
  return parseMultiListValue(value).every((item) => field.options.includes(item));
}

function isMultiListField(mask: string | null) {
  if (!mask?.trim().startsWith("{")) return false;
  try {
    const parsed = JSON.parse(mask) as { list?: { variant?: string } };
    return parsed.list?.variant === "multi";
  } catch {
    return false;
  }
}

function parseMultiListValue(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseContactCustomDateValue(value: string, mask: string | null) {
  const isoDate = new Date(value);
  if (!Number.isNaN(isoDate.getTime())) return isoDate.toISOString();

  const variant = contactDateVariantFromMask(mask);
  const digits = value.replace(/\D/g, "");
  const expectedLength = variant === "datetime" ? 12 : 8;
  if (digits.length < expectedLength) return null;

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const hour = variant === "datetime" ? Number(digits.slice(8, 10)) : 0;
  const minute = variant === "datetime" ? Number(digits.slice(10, 12)) : 0;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;
  return valid ? date.toISOString() : null;
}

function contactDateVariantFromMask(mask: string | null) {
  if (!mask?.trim().startsWith("{")) return "date";
  try {
    const parsed = JSON.parse(mask) as { date?: { variant?: string } };
    return parsed.date?.variant === "datetime" ? "datetime" : "date";
  } catch {
    return "date";
  }
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
function pagination(query: PaginationDto) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25);
  if (!Number.isInteger(page) || page < 1) throw new BadRequestException("Pagina invalida.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 10000) {
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

function compareContactsByDisplayName<T extends { name: string; createdAt: Date }>(a: T, b: T) {
  const aKey = contactNameSortKey(a.name);
  const bKey = contactNameSortKey(b.name);
  if (aKey.symbolOnly !== bKey.symbolOnly) return aKey.symbolOnly ? 1 : -1;
  const nameCompare = aKey.value.localeCompare(bKey.value, "pt-BR", {
    sensitivity: "base",
    numeric: true,
  });
  if (nameCompare !== 0) return nameCompare;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

function contactNameSortKey(name: string) {
  const value = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  const lettersOnly = value.replace(/[^\p{L}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  return {
    symbolOnly: !/\p{L}/u.test(lettersOnly),
    value: lettersOnly,
  };
}

function importedEvolutionContactPhone(item: {
  id?: string | null;
  remoteJid?: string | null;
  number?: string | null;
}) {
  const remoteJid = cleanNullable(item.remoteJid);
  const remoteJidPhone = remoteJid ? phoneFromWhatsappIdentifier(remoteJid) : null;
  if (remoteJidPhone) return remoteJidPhone;
  const id = cleanNullable(item.id);
  const idPhone = id ? phoneFromWhatsappIdentifier(id) : null;
  if (idPhone) return idPhone;
  return phoneFromStandaloneEvolutionNumber(item.number);
}

function importedEvolutionContactRawPhone(item: {
  id?: string | null;
  remoteJid?: string | null;
  number?: string | null;
}) {
  return cleanNullable(item.number) ?? cleanNullable(item.remoteJid) ?? cleanNullable(item.id) ?? "";
}

function importedEvolutionContactName(item: {
  name?: string | null;
  pushName?: string | null;
  verifiedName?: string | null;
  notify?: string | null;
  contactName?: string | null;
  shortName?: string | null;
  displayName?: string | null;
  profileName?: string | null;
}) {
  return (
    cleanNullable(item.name) ??
    cleanNullable(item.pushName) ??
    cleanNullable(item.verifiedName) ??
    cleanNullable(item.notify) ??
    cleanNullable(item.contactName) ??
    cleanNullable(item.shortName) ??
    cleanNullable(item.displayName) ??
    cleanNullable(item.profileName)
  );
}

function phoneFromWhatsappIdentifier(value: string) {
  const lower = value.toLowerCase();
  if (
    lower.includes("@g.us") ||
    lower.includes("broadcast") ||
    lower.includes("status@") ||
    (!lower.includes("@s.whatsapp.net") && !lower.includes("@c.us"))
  ) {
    return null;
  }
  const digits = value.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 && digits.length <= 15 && !digits.startsWith("0")
    ? `+${digits}`
    : null;
}

function phoneFromStandaloneEvolutionNumber(value?: string | null) {
  const raw = cleanNullable(value);
  if (!raw) return "";
  if (raw.includes("@")) return phoneFromWhatsappIdentifier(raw) ?? "";
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return raw;
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    return `+55${digits.slice(1)}`;
  }
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  if (digits.length > 11 && digits.length <= 15 && !digits.startsWith("0")) {
    return `+${digits}`;
  }
  return "";
}

function normalizeCatalogName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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

