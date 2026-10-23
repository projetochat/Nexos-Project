import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
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
import {
  canReadContactAdditionalFields,
  projectContactAdditionalFields,
} from "../auth/contact-additional-fields-access";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequireAnyPermission, RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import {
  ContactCompanyRole,
  ContactCustomFieldType,
  MessagingConnectionStatus,
  MessagingProviderType,
  Prisma,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeRegistrationText } from "../common/registration-case";
import {
  ConfirmDeletionDto,
  type DeletionImpactPreview,
  deletionSnapshot,
} from "../common/deletion-impact";
import {
  isHtmlContactCustomField,
  sanitizeContactCustomFieldHtml,
} from "./contact-custom-field-html";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { ContactProfilePictureSyncService } from "../messaging/contact-profile-picture-sync.service";
import { EvolutionClient } from "../messaging/evolution/evolution.client";
import { CreateContactDto } from "./dto/create-contact.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CustomerBranchDto, CustomerDepartmentDto } from "./dto/customer-structure.dto";
import { ListContactsQueryDto } from "./dto/list-contacts-query.dto";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";
import { PaginationDto } from "./dto/pagination.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import {
  contactPhoneDuplicateCandidates,
  groupContactIdentityFromPhone,
  normalizePhone,
} from "./phone-normalization";
import {
  contactCustomFieldVariableKey,
  isNativeContactFieldName,
  isNativeMessageVariableKey,
  normalizeContactCustomFieldName,
} from "./contact-custom-field-identity";
import { ConversationPurgeService } from "../conversations/conversation-purge.service";
import { LocationsService } from "../locations/locations.service";

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
  @IsUUID()
  customerDepartmentId?: string | null;

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
  branches: { where: { archivedAt: null }, orderBy: { name: "asc" as const } },
  customerDepartments: {
    where: { archivedAt: null },
    orderBy: { name: "asc" as const },
    include: { managerContact: { select: { id: true, name: true } } },
  },
} satisfies Prisma.CustomerInclude;

const contactInclude = {
  customer: { select: { id: true, name: true, color: true } },
  customerBranch: { select: { id: true, name: true, city: true, state: true } },
  customerDepartment: { select: { id: true, name: true } },
  contactDepartment: { select: { id: true, name: true, color: true } },
  contactProfile: { select: { id: true, name: true, color: true } },
  tags: { include: { tag: true } },
  customFieldValues: {
    where: { field: { archivedAt: null } },
    include: { field: true },
  },
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
    @Inject(ConversationPurgeService) private readonly conversationPurge: ConversationPurgeService,
    @Inject(LocationsService) private readonly locations: LocationsService,
  ) {}

  @Get("customers")
  @RequirePermissions("contacts.read")
  async listCustomers(
    @Query() query: ListCustomersQueryDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const { page, pageSize, skip } = pagination(query);
    const q = query.q?.trim();
    const where: Prisma.CustomerWhereInput = {
      tenantId: current.tenantId,
      archivedAt: null,
      ...(query.personType ? { personType: query.personType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { responsibleContactName: { contains: q, mode: "insensitive" } },
              { document: { contains: q, mode: "insensitive" } },
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
  @RequirePermissions("contacts.read")
  async findCustomer(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const customer = await this.findCustomerOrThrow(id, current.tenantId);
    return this.serializeCustomer(customer);
  }

  @Post("customers")
  @RequirePermissions("contacts.create")
  async createCustomer(@Body() dto: CreateCustomerDto, @CurrentUser() current: AuthenticatedUser) {
    const name = await normalizeRegistrationText(
      this.prisma,
      current.tenantId,
      "contactCompanies",
      dto.name,
    );
    await this.assertCustomerNameAvailable(name, current.tenantId);
    const location = dto.cityId ? await this.locations.resolveCity(dto.cityId) : null;
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: current.tenantId,
        name,
        personType: dto.personType,
        status: dto.status,
        email: normalizeNullableEmail(dto.email),
        phone: cleanNullable(dto.phone),
        notes: cleanNullable(dto.notes),
        responsibleContactName: cleanNullable(dto.responsibleContactName),
        color: dto.color ?? "#3B82F6",
        legalName: cleanNullable(dto.legalName),
        document: cleanNullable(dto.document),
        addressFullEnabled: dto.addressFullEnabled,
        postalCode: cleanNullable(dto.postalCode),
        street: cleanNullable(dto.street),
        addressNumber: cleanNullable(dto.addressNumber),
        addressWithoutNumber: dto.addressWithoutNumber,
        complement: cleanNullable(dto.complement),
        neighborhood: cleanNullable(dto.neighborhood),
        cityId: location?.cityId,
        city: location?.city ?? cleanNullable(dto.city),
        state: location?.state ?? cleanNullable(dto.state)?.toUpperCase(),
        country: location?.country ?? cleanNullable(dto.country),
      },
      include: customerInclude,
    });
    return this.serializeCustomer(customer);
  }

  @Patch("customers/:id")
  @RequirePermissions("contacts.update")
  async updateCustomer(
    @Param("id") id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerOrThrow(id, current.tenantId);
    const name = dto.name
      ? await normalizeRegistrationText(this.prisma, current.tenantId, "contactCompanies", dto.name)
      : undefined;
    if (name) await this.assertCustomerNameAvailable(name, current.tenantId, id);
    const location =
      typeof dto.cityId === "string" ? await this.locations.resolveCity(dto.cityId) : null;
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name,
        personType: dto.personType,
        status: dto.status,
        email: normalizeEmailUpdate(dto.email),
        phone: nullableUpdate(dto.phone),
        notes: nullableUpdate(dto.notes),
        responsibleContactName: nullableUpdate(dto.responsibleContactName),
        color: dto.color,
        legalName: nullableUpdate(dto.legalName),
        document: nullableUpdate(dto.document),
        addressFullEnabled: dto.addressFullEnabled,
        postalCode: nullableUpdate(dto.postalCode),
        street: nullableUpdate(dto.street),
        addressNumber: nullableUpdate(dto.addressNumber),
        addressWithoutNumber: dto.addressWithoutNumber,
        complement: nullableUpdate(dto.complement),
        neighborhood: nullableUpdate(dto.neighborhood),
        cityId: dto.cityId === undefined ? undefined : (location?.cityId ?? null),
        city: location?.city ?? nullableUpdate(dto.city),
        state:
          location?.state ??
          (dto.state === undefined ? undefined : cleanNullable(dto.state)?.toUpperCase()),
        country: location?.country ?? nullableUpdate(dto.country),
      },
      include: customerInclude,
    });
    return this.serializeCustomer(customer);
  }

  @Delete("customers/:id")
  @RequirePermissions("contacts.delete")
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
  @RequirePermissions("contacts.read")
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
    return contacts.map((contact) =>
      this.serializeContact(contact, {
        additionalFieldsViewer: current,
      }),
    );
  }

  @Get("customers/:id/branches")
  @RequirePermissions("contacts.read")
  async listCustomerBranches(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.findCustomerOrThrow(id, current.tenantId);
    return this.prisma.customerBranch.findMany({
      where: { tenantId: current.tenantId, customerId: id, archivedAt: null },
      orderBy: [{ name: "asc" }],
    });
  }

  @Post("customers/:id/branches")
  @RequirePermissions("contacts.create")
  async createCustomerBranch(
    @Param("id") id: string,
    @Body() dto: CustomerBranchDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerOrThrow(id, current.tenantId);
    const city = dto.city?.trim();
    const state = dto.state?.trim().toUpperCase();
    if (!city || !state) {
      throw new BadRequestException("Informe uma cidade válida para a filial.");
    }
    const archived = await this.prisma.customerBranch.findFirst({
      where: {
        tenantId: current.tenantId,
        customerId: id,
        name: dto.name.trim(),
        archivedAt: { not: null },
      },
      select: { id: true },
    });
    if (archived) {
      return this.prisma.customerBranch.update({
        where: { id: archived.id },
        data: {
          city,
          state,
          status: dto.status ?? "ACTIVE",
          archivedAt: null,
        },
      });
    }
    return this.prisma.customerBranch.create({
      data: {
        tenantId: current.tenantId,
        customerId: id,
        name: dto.name.trim(),
        city,
        state,
        status: dto.status,
      },
    });
  }

  @Patch("customers/:id/branches/:branchId")
  @RequirePermissions("contacts.update")
  async updateCustomerBranch(
    @Param("id") id: string,
    @Param("branchId") branchId: string,
    @Body() dto: CustomerBranchDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerBranchOrThrow(id, branchId, current.tenantId);
    const city = dto.city?.trim();
    const state = dto.state?.trim().toUpperCase();
    if (!city || !state) {
      throw new BadRequestException("Informe uma cidade válida para a filial.");
    }
    return this.prisma.customerBranch.update({
      where: { id: branchId },
      data: {
        name: dto.name.trim(),
        city,
        state,
        status: dto.status,
      },
    });
  }

  @Delete("customers/:id/branches/:branchId")
  @RequirePermissions("contacts.delete")
  async deleteCustomerBranch(
    @Param("id") id: string,
    @Param("branchId") branchId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerBranchOrThrow(id, branchId, current.tenantId);
    return this.prisma.customerBranch.update({
      where: { id: branchId },
      data: { archivedAt: new Date() },
    });
  }

  @Get("customers/:id/departments")
  @RequirePermissions("contacts.read")
  async listCustomerDepartments(
    @Param("id") id: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerOrThrow(id, current.tenantId);
    return this.prisma.customerDepartment
      .findMany({
        where: { tenantId: current.tenantId, customerId: id, archivedAt: null },
        include: {
          managerContact: { select: { id: true, name: true } },
          _count: { select: { contacts: true } },
        },
        orderBy: [{ name: "asc" }],
      })
      .then((rows) =>
        rows.map(({ _count, ...department }) => ({
          ...department,
          contactCount: _count.contacts,
        })),
      );
  }

  @Post("customers/:id/departments")
  @RequirePermissions("contacts.create")
  async createCustomerDepartment(
    @Param("id") id: string,
    @Body() dto: CustomerDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerOrThrow(id, current.tenantId);
    await this.assertCustomerManager(dto.managerContactId, id, current.tenantId);
    const name = await normalizeRegistrationText(
      this.prisma,
      current.tenantId,
      "contactDepartments",
      dto.name,
    );
    const archived = await this.prisma.customerDepartment.findFirst({
      where: {
        tenantId: current.tenantId,
        customerId: id,
        name,
        archivedAt: { not: null },
      },
      select: { id: true },
    });
    if (archived) {
      return this.prisma.customerDepartment.update({
        where: { id: archived.id },
        data: {
          name,
          managerContactId: dto.managerContactId ?? null,
          active: dto.active ?? true,
          archivedAt: null,
        },
        include: { managerContact: { select: { id: true, name: true } } },
      });
    }
    return this.prisma.customerDepartment.create({
      data: {
        tenantId: current.tenantId,
        customerId: id,
        name,
        managerContactId: dto.managerContactId ?? null,
        active: dto.active ?? true,
      },
      include: { managerContact: { select: { id: true, name: true } } },
    });
  }

  @Patch("customers/:id/departments/:departmentId")
  @RequirePermissions("contacts.update")
  async updateCustomerDepartment(
    @Param("id") id: string,
    @Param("departmentId") departmentId: string,
    @Body() dto: CustomerDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerDepartmentOrThrow(id, departmentId, current.tenantId);
    await this.assertCustomerManager(dto.managerContactId, id, current.tenantId);
    const name = await normalizeRegistrationText(
      this.prisma,
      current.tenantId,
      "contactDepartments",
      dto.name,
    );
    return this.prisma.customerDepartment.update({
      where: { id: departmentId },
      data: {
        name,
        managerContactId: dto.managerContactId === undefined ? undefined : dto.managerContactId,
        active: dto.active,
      },
      include: { managerContact: { select: { id: true, name: true } } },
    });
  }

  @Delete("customers/:id/departments/:departmentId")
  @RequirePermissions("contacts.delete")
  async deleteCustomerDepartment(
    @Param("id") id: string,
    @Param("departmentId") departmentId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findCustomerDepartmentOrThrow(id, departmentId, current.tenantId);
    return this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { tenantId: current.tenantId, customerDepartmentId: departmentId },
        data: { customerDepartmentId: null },
      });
      return tx.customerDepartment.update({
        where: { id: departmentId },
        data: { archivedAt: new Date() },
      });
    });
  }

  @Get("contacts")
  @RequirePermissions("contacts.read")
  async listContacts(
    @Query() query: ListContactsQueryDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const { page, pageSize, skip } = pagination(query);
    const where = await this.buildContactListWhere(query, current.tenantId);
    const orderBy = contactListOrderBy(query.sortBy);

    if (query.sortBy === "instance") {
      const [orderRows, total, connections] = await this.prisma.$transaction([
        this.prisma.contact.findMany({
          where,
          select: { id: true, name: true, instance: true, instanceIds: true, createdAt: true },
        }),
        this.prisma.contact.count({ where }),
        this.prisma.messagingConnection.findMany({
          where: { tenantId: current.tenantId, archivedAt: null },
          select: { id: true, name: true, externalReference: true },
        }),
      ]);
      const pageIds = orderContactIdsByInstance(orderRows, connections).slice(
        skip,
        skip + pageSize,
      );
      const unorderedItems = pageIds.length
        ? await this.prisma.contact.findMany({
            where: { AND: [where, { id: { in: pageIds } }] },
            include: contactInclude,
          })
        : [];
      const byId = new Map(unorderedItems.map((contact) => [contact.id, contact]));
      const items = pageIds.flatMap((id) => {
        const contact = byId.get(id);
        return contact ? [contact] : [];
      });

      this.profilePictures.enqueueMissing({ tenantId: current.tenantId, contacts: items });
      return paginated(
        items.map((contact) =>
          this.serializeContact(contact, {
            additionalFieldsViewer: current,
          }),
        ),
        total,
        page,
        pageSize,
      );
    }

    if (query.priorityInstance?.trim()) {
      const priorityKeys = await this.resolveInstanceFilterKeys(
        query.priorityInstance,
        current.tenantId,
      );
      const priorityMatch: Prisma.ContactWhereInput = {
        OR: [{ instance: { in: priorityKeys } }, { instanceIds: { hasSome: priorityKeys } }],
      };
      const priorityWhere: Prisma.ContactWhereInput = { AND: [where, priorityMatch] };
      const regularWhere: Prisma.ContactWhereInput = {
        AND: [where, { NOT: priorityMatch }],
      };
      const [priorityTotal, total] = await this.prisma.$transaction([
        this.prisma.contact.count({ where: priorityWhere }),
        this.prisma.contact.count({ where }),
      ]);
      const prioritySkip = Math.min(skip, priorityTotal);
      const priorityTake = Math.min(pageSize, Math.max(0, priorityTotal - prioritySkip));
      const regularSkip = Math.max(0, skip - priorityTotal);
      const regularTake = pageSize - priorityTake;
      const [priorityItems, regularItems] = await this.prisma.$transaction([
        this.prisma.contact.findMany({
          where: priorityWhere,
          orderBy,
          skip: prioritySkip,
          take: priorityTake,
          include: contactInclude,
        }),
        this.prisma.contact.findMany({
          where: regularWhere,
          orderBy,
          skip: regularSkip,
          take: regularTake,
          include: contactInclude,
        }),
      ]);
      const items = [...priorityItems, ...regularItems];

      this.profilePictures.enqueueMissing({
        tenantId: current.tenantId,
        contacts: items,
      });

      return paginated(
        items.map((contact) =>
          this.serializeContact(contact, {
            additionalFieldsViewer: current,
          }),
        ),
        total,
        page,
        pageSize,
      );
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: contactInclude,
      }),
      this.prisma.contact.count({ where }),
    ]);

    this.profilePictures.enqueueMissing({
      tenantId: current.tenantId,
      contacts: items,
    });
    this.profilePictures.enqueuePlaceholderNames({
      tenantId: current.tenantId,
      contacts: items,
    });

    return paginated(
      items.map((contact) =>
        this.serializeContact(contact, {
          additionalFieldsViewer: current,
        }),
      ),
      total,
      page,
      pageSize,
    );
  }

  // Keep this endpoint outside `/contacts/:id`: some router builds resolve dynamic
  // contact routes before nested static paths, treating "picker" as a contact id.
  @Get("group-contact-picker")
  @RequireAnyPermission("contacts.read", "groups.create", "groups.update")
  async listContactsForGroupPicker(
    @Query() query: PaginationDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 50));
    const q = query.q?.trim();
    const digits = q?.replace(/\D/g, "") ?? "";
    const accentInsensitiveContactIds = q
      ? await this.findContactsByAccentInsensitiveText(current.tenantId, q)
      : [];
    const where: Prisma.ContactWhereInput = {
      tenantId: current.tenantId,
      archivedAt: null,
      active: true,
      NOT: { normalizedPhone: { startsWith: "group:" } },
      ...(q
        ? {
            OR: [
              { id: { in: accentInsensitiveContactIds } },
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              ...(digits ? [{ normalizedPhone: { contains: digits } }] : []),
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        select: { id: true, name: true, phone: true, normalizedPhone: true, avatarUrl: true },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return paginated(
      items.map((contact) => ({
        id: contact.id,
        nome: contact.name,
        telefone: contact.phone,
        normalizedPhone: contact.normalizedPhone,
        avatar_url: contact.avatarUrl,
      })),
      total,
      page,
      pageSize,
    );
  }

  @Get("message-contact-picker")
  @RequirePermissions("messages.send")
  async listContactsForMessagePicker(
    @Query() query: ListContactsQueryDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 100));
    const q = query.q?.trim();
    const digits = q?.replace(/\D/g, "") ?? "";
    const accentInsensitiveContactIds = q
      ? await this.findContactsByAccentInsensitiveText(current.tenantId, q)
      : [];
    const where: Prisma.ContactWhereInput = {
      tenantId: current.tenantId,
      archivedAt: null,
      active: true,
      NOT: { normalizedPhone: { startsWith: "group:" } },
      ...(q
        ? {
            OR: [
              { id: { in: accentInsensitiveContactIds } },
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              ...(digits ? [{ normalizedPhone: { contains: digits } }] : []),
            ],
          }
        : {}),
    };
    const priorityInstance = query.priorityInstance?.trim();
    const [items, total, instance] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          normalizedPhone: true,
          avatarUrl: true,
          instance: true,
          instanceIds: true,
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
      this.prisma.messagingConnection.findFirst({
        where: {
          tenantId: current.tenantId,
          archivedAt: null,
          status: { in: ["CONNECTED", "DISCONNECTED"] },
          OR: priorityInstance
            ? [
                { id: priorityInstance },
                { externalReference: priorityInstance },
                { name: priorityInstance },
              ]
            : [{ id: "__no-priority-instance__" }],
        },
        select: { id: true, name: true, ownerPhoneNormalized: true },
      }),
    ]);
    return {
      ...paginated(
        items.map((contact) => ({
          id: contact.id,
          nome: contact.name,
          telefone: contact.phone,
          normalizedPhone: contact.normalizedPhone,
          avatar_url: contact.avatarUrl,
          active: true,
          instancia: contact.instance,
          instanceIds: contact.instanceIds.length
            ? contact.instanceIds
            : contact.instance
              ? [contact.instance]
              : [],
        })),
        total,
        page,
        pageSize,
      ),
      instance: instance
        ? {
            id: instance.id,
            name: instance.name,
            ownerPhone: instance.ownerPhoneNormalized,
          }
        : null,
    };
  }

  @Get("contacts/options")
  @RequirePermissions("contacts.read")
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
      this.prisma.customerDepartment.findMany({
        where: { tenantId: current.tenantId, archivedAt: null },
        orderBy: [{ customer: { name: "asc" } }, { name: "asc" }],
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { contacts: true } },
        },
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
      departments: departments.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        nome: item.name,
        descricao: item.customer.name,
        cor: "#3B82F6",
        customerId: item.customerId,
        customerName: item.customer.name,
        active: item.active,
        contactCount: item._count.contacts,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      profiles: profiles.map((item) => this.serializeContactCatalog(item)),
      tags: tags.map((tag) => this.serializeTag(tag)),
    };
  }

  @Get("contact-custom-fields")
  @RequirePermissions("contacts.additional_fields.read")
  async listContactCustomFields(@CurrentUser() current: AuthenticatedUser) {
    const fields = await this.prisma.contactCustomField.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: [{ position: "asc" }, { label: "asc" }],
    });
    return fields.map((field) => this.serializeContactCustomField(field));
  }

  @Post("contact-custom-fields")
  @RequirePermissions("contacts.create", "contacts.additional_fields.read")
  async createContactCustomField(
    @Body() dto: ContactCustomFieldDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const data = this.prepareContactCustomField(dto);
    await this.assertContactCustomFieldNameAvailable(data.label!, current.tenantId);
    const lastField = await this.prisma.contactCustomField.findFirst({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (lastField?.position ?? -1) + 1;
    const field = await this.createContactCustomFieldWithConflictMapping({
      tenantId: current.tenantId,
      label: data.label!,
      normalizedName: data.normalizedName!,
      variableKey: data.variableKey!,
      type: data.type!,
      required: data.required ?? false,
      mask: data.mask,
      note: data.note,
      tabName: data.tabName!,
      groupName: data.groupName!,
      options: data.options,
      position,
    });
    return this.serializeContactCustomField(field);
  }

  @Patch("contact-custom-fields/reorder")
  @RequirePermissions("contacts.update", "contacts.additional_fields.read")
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
      throw new BadRequestException("Alguns campos adicionais não foram encontrados.");
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
  @RequirePermissions("contacts.update", "contacts.additional_fields.read")
  async updateContactCustomField(
    @Param("id") id: string,
    @Body() dto: ContactCustomFieldDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findContactCustomFieldOrThrow(id, current.tenantId);
    if (dto.label)
      await this.assertContactCustomFieldNameAvailable(dto.label, current.tenantId, id);
    let field;
    try {
      field = await this.prisma.contactCustomField.update({
        where: { id },
        data: this.prepareContactCustomField(dto, true),
      });
    } catch (error) {
      this.rethrowContactCustomFieldUniqueConflict(error);
      throw error;
    }
    return this.serializeContactCustomField(field);
  }

  @Delete("contact-custom-fields/:id")
  @RequirePermissions("contacts.delete", "contacts.additional_fields.read")
  async deleteContactCustomField(
    @Param("id") id: string,
    @Body() dto: ConfirmDeletionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "contact_custom_fields" WHERE id = ${id} AND "tenantId" = ${current.tenantId} FOR UPDATE`,
      );
      const impact = await this.buildCustomFieldDeletionPreview(id, current.tenantId, tx);
      if (impact.snapshotToken !== dto.snapshotToken) {
        return {
          status: "changed" as const,
          impact,
          message: "Os usos deste campo mudaram. Revise os dados antes de confirmar novamente.",
        };
      }
      if (impact.blockedReason) throw new BadRequestException(impact.blockedReason);
      await tx.contactCustomFieldValue.deleteMany({
        where: { tenantId: current.tenantId, fieldId: id },
      });
      await tx.contactCustomField.delete({ where: { id } });
      return { status: "deleted" as const };
    });
  }

  @Get("contact-custom-fields/:id/deletion-preview")
  @RequirePermissions("contacts.delete", "contacts.additional_fields.read")
  customFieldDeletionPreview(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.buildCustomFieldDeletionPreview(id, current.tenantId);
  }

  private async buildCustomFieldDeletionPreview(
    id: string,
    tenantId: string,
    db: Pick<
      Prisma.TransactionClient,
      | "contactCustomField"
      | "contactCustomFieldValue"
      | "quickReply"
      | "campaign"
      | "automationRule"
      | "schedule"
    > = this.prisma,
  ): Promise<DeletionImpactPreview> {
    const field = await db.contactCustomField.findFirst({
      where: { id, tenantId, archivedAt: null },
    });
    if (!field) throw new NotFoundException("Campo adicional não encontrado.");
    const [values, quickReplies, campaigns, automations, schedules] = await Promise.all([
      db.contactCustomFieldValue.findMany({
        where: { tenantId, fieldId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, updatedAt: true, contact: { select: { id: true, name: true } } },
      }),
      db.quickReply.findMany({
        where: { tenantId, archivedAt: null },
        select: { id: true, title: true, content: true, messages: true, updatedAt: true },
      }),
      db.campaign.findMany({
        where: { tenantId, archivedAt: null },
        select: { id: true, name: true, messageText: true, updatedAt: true },
      }),
      db.automationRule.findMany({
        where: { tenantId, archivedAt: null },
        select: { id: true, name: true, matchText: true, responseText: true, updatedAt: true },
      }),
      db.schedule.findMany({
        where: { tenantId },
        select: { id: true, payload: true, updatedAt: true },
      }),
    ]);
    const token = `{{${field.variableKey}}}`;
    const references = [
      ...quickReplies
        .filter((item) => hasDeletionVariableReference([item.content, item.messages], token))
        .map((item) => ({
          id: `quick-reply:${item.id}`,
          label: item.title,
          kind: "Mensagem rápida",
          updatedAt: item.updatedAt,
        })),
      ...campaigns
        .filter((item) => hasDeletionVariableReference(item.messageText, token))
        .map((item) => ({
          id: `campaign:${item.id}`,
          label: item.name,
          kind: "Campanha",
          updatedAt: item.updatedAt,
        })),
      ...automations
        .filter((item) => hasDeletionVariableReference([item.matchText, item.responseText], token))
        .map((item) => ({
          id: `automation:${item.id}`,
          label: item.name,
          kind: "Automação",
          updatedAt: item.updatedAt,
        })),
      ...schedules
        .filter((item) => hasDeletionVariableReference(item.payload, token))
        .map((item) => ({
          id: `schedule:${item.id}`,
          label: item.id,
          kind: "Agendamento",
          updatedAt: item.updatedAt,
        })),
    ];
    const blockedReason = references.length
      ? "Este campo é usado em conteúdos ativos. Remova as variáveis indicadas antes de excluí-lo."
      : undefined;
    return {
      snapshotToken: deletionSnapshot({
        id: field.id,
        updatedAt: field.updatedAt,
        values: values.map((item) => [item.id, item.updatedAt]),
        references: references.map((item) => [item.id, item.updatedAt]),
      }),
      title: "Excluir Campo Adicional?",
      prompt: blockedReason
        ? "A exclusão foi bloqueada para não corromper mensagens ou regras que usam esta variável."
        : "Os valores armazenados para este campo serão excluídos definitivamente.",
      record: {
        name: field.label,
        identifiers: [{ label: "Variável", value: token }],
      },
      dependencies: [
        {
          id: "values",
          label: "Valores preenchidos",
          count: values.length,
          operation: "delete",
          operationLabel: "Os valores serão excluídos; os contatos serão preservados.",
          items: values.slice(0, 10).map((item) => ({
            id: item.id,
            label: item.contact.name,
          })),
          hasMore: values.length > 10,
        },
        {
          id: "templates",
          label: "Conteúdos que usam a variável",
          count: references.length,
          operation: "unlink",
          operationLabel: references.length
            ? "Os conteúdos indicados precisam ser corrigidos antes da exclusão."
            : "Nenhum conteúdo textual será afetado.",
          items: references.slice(0, 10).map((item) => ({
            id: item.id,
            label: item.label,
            description: item.kind,
          })),
          hasMore: references.length > 10,
        },
      ],
      consequences: [
        {
          id: "field-values",
          text: "A definição do campo e todos os seus valores serão excluídos definitivamente.",
          irreversible: true,
        },
      ],
      confirmation: {
        level: "standard",
        confirmLabel: "Confirmar",
      },
      blockedReason,
    };
  }

  @Patch("contacts/bulk")
  @RequirePermissions("contacts.update")
  async bulkUpdateContacts(
    @Body() dto: BulkUpdateContactsDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    this.assertCanWriteContactAdditionalFields(dto.customFields, current);
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
      throw new BadRequestException("Alguns contatos não foram encontrados.");

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
          customerBranchId: dto.customerId === undefined ? undefined : null,
          customerDepartmentId:
            dto.customerId !== undefined || dto.customerDepartmentId !== undefined
              ? links.customerDepartmentId
              : undefined,
          customerAccessProfile: dto.customerId === undefined ? undefined : null,
          contactDepartmentId:
            dto.contactDepartmentId === undefined ? undefined : links.contactDepartmentId,
          contactProfileId: dto.contactProfileId === undefined ? undefined : links.contactProfileId,
          departmentName: dto.contactDepartmentId === undefined ? undefined : links.departmentName,
          email: normalizeEmailUpdate(dto.email),
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
  @RequirePermissions("contacts.read")
  async findContact(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const contact = await this.findContactOrThrow(id, current.tenantId);
    return this.serializeContact(contact, {
      additionalFieldsViewer: current,
    });
  }

  @Post("contacts/import/agenda")
  @RequirePermissions("contacts.create")
  async importContactsFromAgenda(
    @Body() dto: ImportContactsFromAgendaDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.entitlements.assertTenantOperational(current.tenantId);
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
    const activeRegisteredItems = preview.ignoredItems.filter(
      (item) =>
        item.normalizedPhone &&
        ["Contato já cadastrado ativo", "Contato já cadastrado ativo"].includes(item.reason),
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
    const instanceUpdatePhones = new Set(
      activeRegisteredItems
        .map((item) => item.normalizedPhone)
        .filter((phone): phone is string => Boolean(phone)),
    );

    if (!candidates.length && !instanceUpdatePhones.size) {
      throw new BadRequestException("Selecione ao menos um contato para importar.");
    }

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

    for (const normalizedPhone of instanceUpdatePhones) {
      try {
        const existing = await this.prisma.contact.findFirst({
          where: {
            tenantId: current.tenantId,
            archivedAt: null,
            normalizedPhone: { in: contactPhoneDuplicateCandidates(normalizedPhone) },
          },
          select: agendaImportedContactSelect,
        });
        if (!existing) {
          skipped += 1;
          continue;
        }
        if (existing.instanceIds.includes(preview.connection.id)) {
          continue;
        }
        const nextInstanceIds = [...new Set([...existing.instanceIds, preview.connection.id])];
        const contact = await this.prisma.contact.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
          data: {
            instance: existing.instance ?? preview.connection.id,
            instanceIds: nextInstanceIds,
          },
          select: agendaImportedContactSelect,
        });
        importedContacts.push(contact);
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    for (const item of candidates) {
      try {
        const existing = await this.prisma.contact.findFirst({
          where: {
            tenantId: current.tenantId,
            normalizedPhone: { in: contactPhoneDuplicateCandidates(item.normalizedPhone) },
          },
          select: { id: true, archivedAt: true, instance: true, instanceIds: true },
        });
        if (existing?.archivedAt === null) {
          if (!existing.instanceIds.includes(preview.connection.id)) {
            const nextInstanceIds = [...new Set([...existing.instanceIds, preview.connection.id])];
            const contact = await this.prisma.contact.update({
              where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
              data: {
                instance: existing.instance ?? preview.connection.id,
                instanceIds: nextInstanceIds,
              },
              select: agendaImportedContactSelect,
            });
            importedContacts.push(contact);
            imported += 1;
          }
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
    return {
      total: candidates.length + instanceUpdatePhones.size,
      imported,
      skipped: Math.max(preview.skipped - activeRegisteredItems.length, 0) + skipped,
    };
  }

  @Post("contacts/import/agenda/preview")
  @RequirePermissions("contacts.create")
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
    const accentInsensitiveContactIds = q
      ? await this.findContactsByAccentInsensitiveText(tenantId, q)
      : [];
    const instanceKeys = query.instance
      ? await this.resolveInstanceFilterKeys(query.instance, tenantId)
      : [];
    const filterWithoutCustomer = query.customerId === EMPTY_CONTACT_FILTER_VALUE;
    const canonicalDepartmentFilter = query.customerDepartmentId;
    const filterWithoutCanonicalDepartment =
      canonicalDepartmentFilter === EMPTY_CONTACT_FILTER_VALUE;
    const filterWithoutLegacyDepartment = query.department === EMPTY_CONTACT_FILTER_VALUE;
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
      ...(filterWithoutCanonicalDepartment
        ? { customerDepartmentId: null }
        : canonicalDepartmentFilter
          ? { customerDepartmentId: canonicalDepartmentFilter }
          : filterWithoutLegacyDepartment
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
              { id: { in: accentInsensitiveContactIds } },
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

  private async findContactsByAccentInsensitiveText(tenantId: string, query: string) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT contact.id
      FROM "contacts" AS contact
      LEFT JOIN "customers" AS customer ON customer.id = contact."customerId"
      WHERE contact."tenantId" = ${tenantId}
        AND contact."archivedAt" IS NULL
        AND strpos(
          translate(
            lower(concat_ws(' ', contact.name, contact.email, customer.name)),
            'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
            'aaaaaaeeeeiiiiooooouuuucnyy'
          ),
          ${normalizedQuery}
        ) > 0
    `);
    return rows.map((row) => row.id);
  }

  @Get("contact-departments")
  @RequirePermissions("contacts.read")
  async listContactDepartments(@CurrentUser() current: AuthenticatedUser) {
    const rows = await this.prisma.contactDepartment.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { contacts: true } } },
    });
    return rows.map((item) => this.serializeContactCatalog(item));
  }

  @Post("contact-departments")
  @RequirePermissions("contacts.create")
  async createContactDepartment(
    @Body() dto: ContactCatalogDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const name = dto.name
      ? await normalizeRegistrationText(
          this.prisma,
          current.tenantId,
          "contactDepartments",
          dto.name,
        )
      : "";
    if (!name) throw new BadRequestException("Informe o nome.");
    await this.assertContactCatalogNameAvailable("department", name, current.tenantId);
    const normalizedName = normalizeCatalogName(name);
    try {
      const archived = await this.prisma.contactDepartment.findFirst({
        where: {
          tenantId: current.tenantId,
          normalizedName,
          archivedAt: { not: null },
        },
      });
      const item = archived
        ? await this.prisma.contactDepartment.update({
            where: { id: archived.id },
            data: {
              name,
              normalizedName,
              description: cleanNullable(dto.description),
              color: dto.color || "#3B82F6",
              archivedAt: null,
            },
          })
        : await this.prisma.contactDepartment.create({
            data: {
              tenantId: current.tenantId,
              name,
              normalizedName,
              description: cleanNullable(dto.description),
              color: dto.color || "#3B82F6",
            },
          });
      return this.serializeContactCatalog(item);
    } catch (error) {
      handleContactCatalogUniqueError(error, "department", name);
    }
  }

  @Patch("contact-departments/:id")
  @RequirePermissions("contacts.update")
  async updateContactDepartment(
    @Param("id") id: string,
    @Body() dto: ContactCatalogDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.assertContactCatalog("department", id, current.tenantId);
    const name = dto.name
      ? await normalizeRegistrationText(
          this.prisma,
          current.tenantId,
          "contactDepartments",
          dto.name,
        )
      : undefined;
    if (name)
      await this.assertContactCatalogNameAvailable("department", name, current.tenantId, id);
    const item = await this.prisma.contactDepartment.update({
      where: { id },
      data: {
        name,
        normalizedName: name ? normalizeCatalogName(name) : undefined,
        description: nullableUpdate(dto.description),
        color: dto.color,
      },
    });
    return this.serializeContactCatalog(item);
  }

  @Delete("contact-departments/:id")
  @RequirePermissions("contacts.delete")
  async deleteContactDepartment(
    @Param("id") id: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.assertContactCatalog("department", id, current.tenantId);
    const item = await this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { tenantId: current.tenantId, contactDepartmentId: id },
        data: { contactDepartmentId: null },
      });
      return tx.contactDepartment.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
    });
    return this.serializeContactCatalog(item);
  }

  @Get("contact-profiles")
  @RequirePermissions("contacts.read")
  async listContactProfiles(@CurrentUser() current: AuthenticatedUser) {
    const rows = await this.prisma.contactProfile.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { contacts: true } } },
    });
    return rows.map((item) => this.serializeContactCatalog(item));
  }

  @Post("contact-profiles")
  @RequirePermissions("contacts.create")
  async createContactProfile(
    @Body() dto: ContactCatalogDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const name = dto.name
      ? await normalizeRegistrationText(this.prisma, current.tenantId, "contactProfiles", dto.name)
      : "";
    if (!name) throw new BadRequestException("Informe o nome.");
    await this.assertContactCatalogNameAvailable("profile", name, current.tenantId);
    const normalizedName = normalizeCatalogName(name);
    try {
      const archived = await this.prisma.contactProfile.findFirst({
        where: {
          tenantId: current.tenantId,
          normalizedName,
          archivedAt: { not: null },
        },
      });
      const item = archived
        ? await this.prisma.contactProfile.update({
            where: { id: archived.id },
            data: {
              name,
              normalizedName,
              description: cleanNullable(dto.description),
              color: dto.color || "#3B82F6",
              archivedAt: null,
            },
          })
        : await this.prisma.contactProfile.create({
            data: {
              tenantId: current.tenantId,
              name,
              normalizedName,
              description: cleanNullable(dto.description),
              color: dto.color || "#3B82F6",
            },
          });
      return this.serializeContactCatalog(item);
    } catch (error) {
      handleContactCatalogUniqueError(error, "profile", name);
    }
  }

  @Patch("contact-profiles/:id")
  @RequirePermissions("contacts.update")
  async updateContactProfile(
    @Param("id") id: string,
    @Body() dto: ContactCatalogDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.assertContactCatalog("profile", id, current.tenantId);
    const name = dto.name
      ? await normalizeRegistrationText(this.prisma, current.tenantId, "contactProfiles", dto.name)
      : undefined;
    if (name) await this.assertContactCatalogNameAvailable("profile", name, current.tenantId, id);
    const item = await this.prisma.contactProfile.update({
      where: { id },
      data: {
        name,
        normalizedName: name ? normalizeCatalogName(name) : undefined,
        description: nullableUpdate(dto.description),
        color: dto.color,
      },
    });
    return this.serializeContactCatalog(item);
  }

  @Delete("contact-profiles/:id")
  @RequirePermissions("contacts.delete")
  async deleteContactProfile(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.assertContactCatalog("profile", id, current.tenantId);
    const item = await this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { tenantId: current.tenantId, contactProfileId: id },
        data: { contactProfileId: null },
      });
      return tx.contactProfile.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
    });
    return this.serializeContactCatalog(item);
  }

  @Post("contacts")
  @RequirePermissions("contacts.create")
  async createContact(@Body() dto: CreateContactDto, @CurrentUser() current: AuthenticatedUser) {
    this.assertCanWriteContactAdditionalFields(dto.customFields, current);
    await this.entitlements.assertTenantOperational(current.tenantId);
    if (!dto.linkExistingToCustomer) {
      await this.entitlements.assertWithinLimit(
        current.tenantId,
        "maxContacts",
        await this.prisma.contact.count({
          where: { tenantId: current.tenantId, archivedAt: null },
        }),
      );
    }
    const contactName = await normalizeRegistrationText(
      this.prisma,
      current.tenantId,
      "contacts",
      dto.name,
    );
    const links = await this.resolveContactLinks(dto, current.tenantId);
    const normalizedPhone = groupContactIdentityFromPhone(dto.phone) ?? normalizePhone(dto.phone);
    const phoneCandidates = contactPhoneDuplicateCandidates(dto.phone);
    const existing = await this.prisma.contact.findFirst({
      where: { tenantId: current.tenantId, normalizedPhone: { in: phoneCandidates } },
      include: contactInclude,
    });
    if (existing?.archivedAt === null) {
      if (dto.linkExistingToCustomer && links.customerId) {
        if (!current.permissions?.includes("contacts.update")) {
          throw new ForbiddenException("Permissão insuficiente para vincular o contato existente.");
        }
        const requiresCustomerTransfer = Boolean(
          existing.customerId && existing.customerId !== links.customerId,
        );
        if (
          requiresCustomerTransfer &&
          (!dto.confirmCustomerTransfer || dto.expectedCustomerId !== existing.customerId)
        ) {
          await this.throwContactCustomerTransferRequired(
            existing,
            links.customerId,
            current.tenantId,
          );
        }
        const linked = await this.prisma.contact.updateMany({
          where: {
            id: existing.id,
            tenantId: current.tenantId,
            archivedAt: null,
            customerId: existing.customerId,
          },
          data: {
            customerId: links.customerId,
            customerBranchId: links.customerBranchId,
            customerDepartmentId: links.customerDepartmentId,
            customerAccessProfile: dto.customerAccessProfile ?? null,
            active: dto.active,
          },
        });
        if (linked.count !== 1) {
          throw new ConflictException({
            code: "CONTACT_CUSTOMER_LINK_CHANGED",
            message: "O vínculo deste contato foi alterado. Revise os dados e tente novamente.",
          });
        }
        const contact = await this.prisma.contact.findFirstOrThrow({
          where: { id: existing.id, tenantId: current.tenantId, archivedAt: null },
          include: contactInclude,
        });
        this.realtime.publishContactUpdated({
          tenantId: current.tenantId,
          contactId: contact.id,
        });
        return this.serializeContact(contact, {
          lifecycle: "linked",
          additionalFieldsViewer: current,
        });
      }
      if (links.instanceIds.length) {
        const nextInstanceIds = [...new Set([...existing.instanceIds, ...links.instanceIds])];
        const shouldUpdateInstances = nextInstanceIds.length !== existing.instanceIds.length;
        if (shouldUpdateInstances) {
          const contact = await this.prisma.contact.update({
            where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
            data: {
              instance: existing.instance ?? links.instance,
              instanceIds: nextInstanceIds,
            },
            include: contactInclude,
          });
          return this.serializeContact(contact, {
            additionalFieldsViewer: current,
          });
        }
      }
      throw new ConflictException({
        code: "CONTACT_ALREADY_EXISTS",
        message: "Já existe um contato ativo com este telefone.",
      });
    }
    if (dto.linkExistingToCustomer) {
      await this.entitlements.assertWithinLimit(
        current.tenantId,
        "maxContacts",
        await this.prisma.contact.count({
          where: { tenantId: current.tenantId, archivedAt: null },
        }),
      );
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
            name: contactName,
            phone: dto.phone.trim(),
            normalizedPhone,
            email: normalizeNullableEmail(dto.email),
            avatarUrl: cleanNullable(dto.avatarUrl),
            customerId: links.customerId,
            customerBranchId: links.customerBranchId,
            customerDepartmentId: links.customerDepartmentId,
            customerAccessProfile: dto.customerAccessProfile ?? null,
            departmentId: links.departmentId,
            contactDepartmentId: links.contactDepartmentId,
            contactProfileId: links.contactProfileId,
            departmentName: links.departmentName,
            companyRole: dto.companyRole ?? null,
            instance: links.instance,
            instanceIds: links.instanceIds,
            active: dto.active ?? true,
            archivedAt: null,
          },
          include: contactInclude,
        });
      });
      return this.serializeContact(contact, {
        lifecycle: "restored",
        additionalFieldsViewer: current,
      });
    }
    try {
      const contact = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contact.create({
          data: {
            tenantId: current.tenantId,
            name: contactName,
            phone: dto.phone.trim(),
            normalizedPhone,
            email: normalizeNullableEmail(dto.email),
            avatarUrl: cleanNullable(dto.avatarUrl),
            customerId: links.customerId,
            customerBranchId: links.customerBranchId,
            customerDepartmentId: links.customerDepartmentId,
            customerAccessProfile: dto.customerAccessProfile ?? null,
            departmentId: links.departmentId,
            contactDepartmentId: links.contactDepartmentId,
            contactProfileId: links.contactProfileId,
            departmentName: links.departmentName,
            companyRole: dto.companyRole ?? null,
            instance: links.instance,
            instanceIds: links.instanceIds,
            active: dto.active ?? true,
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
      return this.serializeContact(contact, {
        lifecycle: "created",
        additionalFieldsViewer: current,
      });
    } catch (error) {
      handlePrismaError(error);
    }
  }

  @Patch("contacts/:id")
  @RequirePermissions("contacts.update")
  async updateContact(
    @Param("id") id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    this.assertCanWriteContactAdditionalFields(dto.customFields, current);
    const currentContact = await this.findContactOrThrow(id, current.tenantId);
    const nextEmail = normalizeEmailUpdate(dto.email);
    const currentEmail = currentContact.email?.toLowerCase().trim() ?? null;
    if (dto.email !== undefined && nextEmail !== currentEmail) {
      const protectedPortalAccess = await this.prisma.customerPortalAccess.findFirst({
        where: {
          tenantId: current.tenantId,
          contactId: id,
          OR: [
            { active: true },
            { invitations: { some: { status: "PENDING" } } },
          ],
        },
        select: { id: true },
      });
      if (protectedPortalAccess) {
        throw new ConflictException({
          code: "CONTACT_EMAIL_PORTAL_ACCESS_ACTIVE",
          message:
            "Revogue o acesso ao Portal do Cliente antes de alterar o e-mail deste contato.",
        });
      }
    }
    const contactName = dto.name
      ? await normalizeRegistrationText(this.prisma, current.tenantId, "contacts", dto.name)
      : undefined;
    if (
      dto.customerId !== undefined &&
      dto.customerId !== currentContact.customerId &&
      !current.permissions?.includes("contacts.update")
    ) {
      throw new ForbiddenException("Permissão insuficiente para alterar o cliente vinculado.");
    }
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
    const links = await this.resolveContactLinks(dto, current.tenantId, currentContact.customerId);
    const customerChanged =
      dto.customerId !== undefined && dto.customerId !== currentContact.customerId;
    try {
      const contact = await this.prisma.$transaction(async (tx) => {
        if (dto.active === false && currentContact.active) {
          const revokedAt = new Date();
          const portalAccessIds = (
            await tx.customerPortalAccess.findMany({
              where: { tenantId: current.tenantId, contactId: id },
              select: { id: true },
            })
          ).map((access) => access.id);
          if (portalAccessIds.length) {
            await tx.userInvitation.updateMany({
              where: {
                tenantId: current.tenantId,
                portalAccessId: { in: portalAccessIds },
                status: "PENDING",
              },
              data: { status: "REVOKED", revokedAt },
            });
            await tx.authSession.updateMany({
              where: {
                tenantId: current.tenantId,
                portalAccessId: { in: portalAccessIds },
                revokedAt: null,
              },
              data: { revokedAt },
            });
            await tx.customerPortalAccess.updateMany({
              where: { tenantId: current.tenantId, id: { in: portalAccessIds } },
              data: { active: false },
            });
          }
          if (currentContact.portalMembershipId) {
            await tx.userInvitation.updateMany({
              where: {
                tenantId: current.tenantId,
                contactId: id,
                portalAccessId: null,
                status: "PENDING",
              },
              data: { status: "REVOKED", revokedAt },
            });
            const disabledMembership = await tx.tenantMembership.updateMany({
              where: {
                id: currentContact.portalMembershipId,
                tenantId: current.tenantId,
                role: { key: "customer_portal" },
              },
              data: { status: "DISABLED" },
            });
            if (disabledMembership.count) {
              await tx.authSession.updateMany({
                where: {
                  tenantId: current.tenantId,
                  membershipId: currentContact.portalMembershipId,
                  portalAccessId: null,
                  revokedAt: null,
                },
                data: { revokedAt },
              });
            }
          }
        }
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
        if (dto.customFields !== undefined) {
          await this.saveProvidedContactCustomFields(tx, current.tenantId, id, dto.customFields);
        }
        return tx.contact.update({
          where: { id },
          data: {
            name: contactName,
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
            email: nextEmail,
            avatarUrl: nullableUpdate(dto.avatarUrl),
            customerId: dto.customerId === undefined ? undefined : links.customerId,
            customerBranchId: customerChanged
              ? links.customerBranchId
              : dto.customerBranchId === undefined
                ? undefined
                : links.customerBranchId,
            customerDepartmentId: customerChanged
              ? links.customerDepartmentId
              : dto.customerDepartmentId === undefined
                ? undefined
                : links.customerDepartmentId,
            customerAccessProfile: customerChanged
              ? (dto.customerAccessProfile ?? null)
              : dto.customerAccessProfile === undefined
                ? undefined
                : dto.customerAccessProfile,
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
            active: dto.active,
            portalAccessActive: dto.active === false ? false : undefined,
          },
          include: contactInclude,
        });
      });
      this.realtime.publishContactUpdated({
        tenantId: current.tenantId,
        contactId: contact.id,
      });
      return this.serializeContact(contact, {
        additionalFieldsViewer: current,
      });
    } catch (error) {
      handlePrismaError(error);
    }
  }

  @Patch("contacts/:id/customer")
  @RequirePermissions("contacts.update")
  async updateContactCustomer(
    @Param("id") id: string,
    @Body() dto: { customerId?: string | null },
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const existing = await this.findContactOrThrow(id, current.tenantId);
    let customerId: string | null = null;
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId: current.tenantId, archivedAt: null },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException("Cliente inexistente para esta organização.");
      customerId = customer.id;
    }
    const customerChanged = existing.customerId !== customerId;
    const contact = await this.prisma.contact.update({
      where: { tenantId_id: { tenantId: current.tenantId, id } },
      data: {
        customerId,
        customerBranchId: customerChanged ? null : undefined,
        customerDepartmentId: customerChanged ? null : undefined,
        customerAccessProfile: customerChanged ? null : undefined,
      },
      include: contactInclude,
    });
    const serialized = this.serializeContact(contact, {
      additionalFieldsViewer: current,
    });
    this.realtime.publishContactUpdated({
      tenantId: current.tenantId,
      contactId: contact.id,
    });
    return serialized;
  }

  @Get("contacts/:id/deletion-impact")
  @RequirePermissions("contacts.delete")
  contactDeletionImpact(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.conversationPurge.contactImpact(id, current.tenantId);
  }

  @Delete("contacts/:id")
  @RequirePermissions("contacts.delete")
  deleteContact(
    @Param("id") id: string,
    @Body() dto: ConfirmDeletionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.conversationPurge.purgeContact(id, dto.snapshotToken, current.tenantId);
  }

  @Get("tags")
  @RequirePermissions("chat.tags.read")
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
    if (!customer) throw new NotFoundException("Cliente não encontrado.");
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

  private async findCustomerBranchOrThrow(customerId: string, branchId: string, tenantId: string) {
    const branch = await this.prisma.customerBranch.findFirst({
      where: { id: branchId, customerId, tenantId, archivedAt: null },
    });
    if (!branch) throw new NotFoundException("Filial do cliente não encontrada.");
    return branch;
  }

  private async findCustomerDepartmentOrThrow(
    customerId: string,
    departmentId: string,
    tenantId: string,
  ) {
    const department = await this.prisma.customerDepartment.findFirst({
      where: { id: departmentId, customerId, tenantId, archivedAt: null },
    });
    if (!department) throw new NotFoundException("Departamento do cliente não encontrado.");
    return department;
  }

  private async assertCustomerManager(
    managerContactId: string | null | undefined,
    customerId: string,
    tenantId: string,
  ) {
    if (!managerContactId) return;
    const contact = await this.prisma.contact.findFirst({
      where: { id: managerContactId, customerId, tenantId, archivedAt: null },
      select: { id: true },
    });
    if (!contact) {
      throw new BadRequestException("O gestor deve ser um contato ativo deste cliente.");
    }
  }

  private async findContactOrThrow(id: string, tenantId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: contactInclude,
    });
    if (!contact) throw new NotFoundException("Contato não encontrado.");
    return contact;
  }

  private async throwContactCustomerTransferRequired(
    existing: {
      id: string;
      name: string;
      customerId: string | null;
      customer?: { id: string; name: string } | null;
    },
    targetCustomerId: string,
    tenantId: string,
  ): Promise<never> {
    const targetCustomer = await this.prisma.customer.findFirst({
      where: { id: targetCustomerId, tenantId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!targetCustomer) {
      throw new BadRequestException("Cliente inexistente para este tenant.");
    }
    throw new ConflictException({
      code: "CONTACT_CUSTOMER_TRANSFER_REQUIRED",
      message: "Este contato já está vinculado a outro cliente.",
      details: {
        contact: { id: existing.id, name: existing.name },
        currentCustomer: existing.customer
          ? { id: existing.customer.id, name: existing.customer.name }
          : { id: existing.customerId, name: "Cliente atual" },
        targetCustomer,
      },
    });
  }

  private async resolveContactLinks(
    dto: {
      customerId?: string | null;
      customerBranchId?: string | null;
      customerDepartmentId?: string | null;
      departmentId?: string | null;
      contactDepartmentId?: string | null;
      contactProfileId?: string | null;
      departmentName?: string | null;
      instance?: string | null;
      instanceIds?: string[];
      tagIds?: string[];
    },
    tenantId: string,
    currentCustomerId?: string | null,
  ) {
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId, archivedAt: null },
      });
      if (!customer) throw new BadRequestException("Cliente inexistente para este tenant.");
    }

    const effectiveCustomerId = dto.customerId === undefined ? currentCustomerId : dto.customerId;
    const customerBranchId = dto.customerBranchId || null;
    if (customerBranchId) {
      if (!effectiveCustomerId) {
        throw new BadRequestException("Selecione o cliente antes de vincular uma filial.");
      }
      const branch = await this.prisma.customerBranch.findFirst({
        where: { id: customerBranchId, tenantId, status: "ACTIVE", archivedAt: null },
        select: { customerId: true },
      });
      if (!branch || (effectiveCustomerId && branch.customerId !== effectiveCustomerId)) {
        throw new BadRequestException("Filial inexistente para este cliente.");
      }
    }
    const customerDepartmentId = dto.customerDepartmentId || null;
    if (customerDepartmentId) {
      if (!effectiveCustomerId) {
        throw new BadRequestException("Selecione o cliente antes de vincular um departamento.");
      }
      const department = await this.prisma.customerDepartment.findFirst({
        where: { id: customerDepartmentId, tenantId, active: true, archivedAt: null },
        select: { customerId: true },
      });
      if (!department || (effectiveCustomerId && department.customerId !== effectiveCustomerId)) {
        throw new BadRequestException("Departamento inexistente para este cliente.");
      }
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId, active: true },
      });
      if (!department) throw new BadRequestException("Departamento inexistente para este tenant.");
    }

    if (dto.contactDepartmentId || dto.departmentName?.trim()) {
      throw new BadRequestException(
        "Selecione uma empresa e use um departamento cadastrado para esse cliente.",
      );
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
      if (missing) throw new BadRequestException("Instância inexistente para este tenant.");
    }
    const instance = instanceIds[0] ?? fallbackInstance;

    const tagIds = [...new Set(dto.tagIds ?? [])];
    if (tagIds.length) {
      const count = await this.prisma.tag.count({
        where: { tenantId, id: { in: tagIds }, active: true, archivedAt: null },
      });
      if (count !== tagIds.length)
        throw new BadRequestException("Etiqueta inexistente para este tenant.");
    }

    return {
      customerId: dto.customerId || null,
      customerBranchId,
      customerDepartmentId,
      departmentId: dto.departmentId || null,
      contactDepartmentId: dto.contactDepartmentId || null,
      contactProfileId: dto.contactProfileId || null,
      departmentName: cleanNullable(dto.departmentName),
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
          reason: "Telefone inválido",
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
        ? { ...item, reason: "Contato já cadastrado ativo", importable: false }
        : item,
    );
    ignoredItems.push(
      ...candidates
        .filter((item) => activePhones.has(item.normalizedPhone))
        .map((item) => ({
          name: item.name,
          phone: item.normalizedPhone,
          normalizedPhone: item.normalizedPhone,
          reason: "Contato já cadastrado ativo",
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
          ? "Instância WhatsApp conectada não encontrada."
          : "Nenhuma instância WhatsApp conectada para importar agenda.",
      );
    }
    if (!connectionKey && connections.length > 1) {
      throw new BadRequestException("Selecione uma instância WhatsApp para importar agenda.");
    }

    const connection = connections[0];
    if (!connection.externalReference) {
      throw new BadRequestException("Instância WhatsApp sem referencia Evolution.");
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
    if (!item) throw new NotFoundException("Item não encontrado.");
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
    const cleanLabel = label.normalize("NFKC").trim().replace(/\s+/gu, " ");
    const variableKey = contactCustomFieldVariableKey(cleanLabel);
    if (
      !variableKey ||
      isNativeContactFieldName(cleanLabel) ||
      isNativeMessageVariableKey(variableKey)
    ) {
      this.throwContactCustomFieldConflict();
    }
    const duplicate = await this.prisma.contactCustomField.findFirst({
      where: {
        tenantId,
        OR: [
          { normalizedName: normalizeContactCustomFieldName(cleanLabel) },
          ...(!ignoreId ? [{ variableKey }] : []),
        ],
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) this.throwContactCustomFieldConflict();
  }

  private prepareContactCustomField(dto: ContactCustomFieldDto, partial = false) {
    const label = dto.label?.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!partial && !label) throw new BadRequestException("Informe o nome do campo.");
    const type = dto.type
      ? parseContactCustomFieldType(dto.type)
      : partial
        ? undefined
        : ContactCustomFieldType.TEXT;
    const rawOptions = type === ContactCustomFieldType.LIST ? (dto.options ?? []) : [];
    const normalizedOptions = rawOptions.map((item) => item.trim());
    if (type === ContactCustomFieldType.LIST && normalizedOptions.some((item) => !item)) {
      throw new BadRequestException("Preencha ou remova as opcoes vazias da lista.");
    }
    const options = type === ContactCustomFieldType.LIST ? unique(normalizedOptions) : [];
    if (type === ContactCustomFieldType.LIST && options.length !== normalizedOptions.length) {
      throw new BadRequestException("Nao e permitido repetir opcoes da lista.");
    }
    if (type === ContactCustomFieldType.LIST && options.length === 0) {
      throw new BadRequestException("Informe ao menos uma opcao para a lista.");
    }
    const tabName =
      dto.tabName === undefined ? (partial ? undefined : "Dados Adicionais") : dto.tabName.trim();
    if (dto.tabName !== undefined && !tabName) {
      throw new BadRequestException("Informe a aba do campo.");
    }
    const groupName =
      dto.groupName === undefined ? (partial ? undefined : "") : dto.groupName.trim();
    if (tabName?.toLowerCase() === "geral") {
      throw new BadRequestException("A aba Geral é reservada para os campos padrão do contato.");
    }
    if (groupName?.toLowerCase() === "dados do contato") {
      throw new BadRequestException(
        "Este agrupamento é reservado para os campos padrão do contato.",
      );
    }
    const mask =
      type === ContactCustomFieldType.NUMBER
        ? (cleanNullable(dto.mask) ?? "0,00")
        : type === ContactCustomFieldType.TEXT ||
            type === ContactCustomFieldType.DATE ||
            type === ContactCustomFieldType.LIST ||
            type === ContactCustomFieldType.CHECKBOX
          ? cleanNullable(dto.mask)
          : null;
    if (type === ContactCustomFieldType.TEXT && mask) {
      assertSupportedContactCustomFieldFormat(mask);
    }
    return {
      label: label || undefined,
      normalizedName: label ? normalizeContactCustomFieldName(label) : undefined,
      variableKey: !partial && label ? contactCustomFieldVariableKey(label) : undefined,
      type,
      required: dto.required,
      mask,
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
    if (!field) throw new NotFoundException("Campo adicional não encontrado.");
    return field;
  }

  private async createContactCustomFieldWithConflictMapping(
    data: Prisma.ContactCustomFieldUncheckedCreateInput,
  ) {
    try {
      return await this.prisma.contactCustomField.create({ data });
    } catch (error) {
      this.rethrowContactCustomFieldUniqueConflict(error);
      throw error;
    }
  }

  private rethrowContactCustomFieldUniqueConflict(error: unknown): never | void {
    if ((error as { code?: string } | null)?.code === "P2002") {
      this.throwContactCustomFieldConflict();
    }
  }

  private throwContactCustomFieldConflict(): never {
    throw new ConflictException({
      code: "CONTACT_CUSTOM_FIELD_ALREADY_EXISTS",
      message: "Já existe um campo com este nome. Informe um nome diferente.",
    });
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
      if (value && isCityContactCustomField(field.mask)) {
        await this.locations.resolveCity(value);
      }
      await tx.contactCustomFieldValue.upsert({
        where: { contactId_fieldId: { contactId, fieldId: field.id } },
        create: { tenantId, contactId, fieldId: field.id, value },
        update: { value },
      });
    }
  }

  private assertCanWriteContactAdditionalFields(
    values: Record<string, string | number | boolean | null> | undefined,
    current: Pick<AuthenticatedUser, "roleKey" | "permissions">,
  ) {
    if (values !== undefined && !canReadContactAdditionalFields(current)) {
      throw new ForbiddenException(
        "Permissão de Campos Adicionais necessária para alterar estes valores.",
      );
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
      throw new BadRequestException("Alguns campos adicionais não foram encontrados.");
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
      if (value && isCityContactCustomField(field.mask)) {
        await this.locations.resolveCity(value);
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
    variableKey: string;
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
      variableKey: field.variableKey,
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
      personType: customer.personType,
      status: customer.status,
      legalName: customer.legalName,
      document: customer.document,
      addressFullEnabled: customer.addressFullEnabled,
      postalCode: customer.postalCode,
      street: customer.street,
      addressNumber: customer.addressNumber,
      addressWithoutNumber: customer.addressWithoutNumber,
      complement: customer.complement,
      neighborhood: customer.neighborhood,
      cityId: customer.cityId,
      city: customer.city,
      state: customer.state,
      country: customer.country,
      contactCount: customer.contacts.length,
      branchCount: customer.branches.length,
      departmentCount: customer.customerDepartments.length,
      branches: customer.branches,
      departments: customer.customerDepartments.map((department) => ({
        ...department,
        manager: department.managerContact,
      })),
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  private serializeContact(
    contact: Prisma.ContactGetPayload<{ include: typeof contactInclude }>,
    meta?: {
      lifecycle?: "created" | "restored" | "linked";
      additionalFieldsViewer?: Pick<AuthenticatedUser, "roleKey" | "permissions">;
    },
  ) {
    const customFieldValues = contact.customFieldValues.filter(
      (item) => item.tenantId === contact.tenantId && item.field.tenantId === contact.tenantId,
    );
    const instanceIds = contact.instanceIds.length
      ? contact.instanceIds
      : contact.instance
        ? [contact.instance]
        : [];
    const effectiveDepartment = contact.customerDepartment
      ? {
          id: contact.customerDepartment.id,
          name: contact.customerDepartment.name,
          source: "CUSTOMER" as const,
        }
      : null;
    return {
      id: contact.id,
      tenantId: contact.tenantId,
      nome: contact.name,
      telefone: contact.phone,
      normalizedPhone: contact.normalizedPhone,
      avatar_url: contact.avatarUrl,
      customer_id: contact.customerId,
      customerBranchId: contact.customerBranchId,
      customerBranch: contact.customerBranch,
      customerDepartmentId: contact.customerDepartmentId,
      customerDepartment: contact.customerDepartment,
      effectiveDepartment,
      effectiveDepartmentId: effectiveDepartment?.id ?? null,
      customerAccessProfile: contact.customerAccessProfile,
      portalLogin: contact.portalLogin,
      portalAccessActive: contact.portalAccessActive,
      active: contact.active,
      email: contact.email,
      departamento: effectiveDepartment?.name ?? null,
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
      ...projectContactAdditionalFields(
        contact.tenantId,
        customFieldValues,
        meta?.additionalFieldsViewer ?? { roleKey: "", permissions: [] },
      ),
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
    _count?: { contacts: number };
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
      contactCount: item._count?.contacts,
    };
  }

  private serializeTag(
    tag: { id: string; name: string; color: string; createdAt?: Date; updatedAt?: Date },
    counts?: { conversationCount?: number; customerCount?: number },
  ) {
    return {
      id: tag.id,
      nome: tag.name,
      cor: tag.color,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
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
  throw new BadRequestException("Tipo de campo inválido.");
}

export function normalizeContactCustomFieldValue(
  field: { type: ContactCustomFieldType; mask: string | null },
  raw: string | number | boolean | null | undefined,
) {
  const value = raw === undefined || raw === null ? "" : String(raw).trim();
  if (field.type === ContactCustomFieldType.LIST && isMultiListField(field.mask)) {
    const selected = parseMultiListValue(value);
    return selected.length ? JSON.stringify(selected) : "";
  }
  if (field.type === ContactCustomFieldType.TEXT && isHtmlContactCustomField(field.mask)) {
    return sanitizeContactCustomFieldHtml(value);
  }
  if (field.type === ContactCustomFieldType.TEXT && isEmailContactCustomField(field.mask)) {
    return value.toLowerCase();
  }
  if (!value || field.type !== ContactCustomFieldType.DATE) return value;
  return parseContactCustomDateValue(value, field.mask) ?? value;
}

function isEmailContactCustomField(mask: string | null) {
  if (!mask?.trim().startsWith("{")) return false;
  try {
    const parsed = JSON.parse(mask) as { custom?: { format?: string } };
    return parsed.custom?.format === "email";
  } catch {
    return false;
  }
}

const SUPPORTED_CONTACT_CUSTOM_FIELD_FORMATS = new Set([
  "cpf_cnpj",
  "cep",
  "phone",
  "email",
  "city",
]);

function assertSupportedContactCustomFieldFormat(mask: string) {
  if (!mask.trim().startsWith("{")) return;
  try {
    const parsed = JSON.parse(mask) as { custom?: { format?: unknown } };
    const format = parsed.custom?.format;
    if (format !== undefined && !SUPPORTED_CONTACT_CUSTOM_FIELD_FORMATS.has(String(format))) {
      throw new BadRequestException("Formato de campo personalizado inválido.");
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
  }
}

function isCityContactCustomField(mask: string | null) {
  if (!mask?.trim().startsWith("{")) return false;
  try {
    const parsed = JSON.parse(mask) as { custom?: { format?: string } };
    return parsed.custom?.format === "city";
  } catch {
    return false;
  }
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
  if (!Number.isInteger(page) || page < 1) throw new BadRequestException("Página invalida.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 10000) {
    throw new BadRequestException("Tamanho de página inválido.");
  }
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function contactListOrderBy(
  sortBy: ListContactsQueryDto["sortBy"],
): Prisma.ContactOrderByWithRelationInput[] {
  if (sortBy === "customer") {
    return [{ customer: { name: "asc" } }, { name: "asc" }, { createdAt: "desc" }];
  }
  return [{ name: "asc" }, { createdAt: "desc" }];
}

export function orderContactIdsByInstance(
  contacts: Array<{
    id: string;
    name: string;
    instance: string | null;
    instanceIds: string[];
    createdAt: Date;
  }>,
  connections: Array<{ id: string; name: string; externalReference: string | null }>,
) {
  const labels = new Map<string, string>();
  for (const connection of connections) {
    labels.set(connection.id, connection.name);
    labels.set(connection.name, connection.name);
    if (connection.externalReference) labels.set(connection.externalReference, connection.name);
  }
  const instanceLabel = (contact: (typeof contacts)[number]) => {
    const candidates = [...contact.instanceIds, contact.instance].filter((value): value is string =>
      Boolean(value),
    );
    return candidates
      .map((candidate) => labels.get(candidate) ?? candidate)
      .sort((left, right) =>
        left.localeCompare(right, "pt-BR", { sensitivity: "base", numeric: true }),
      )[0];
  };
  return [...contacts]
    .sort((left, right) => {
      const leftInstance = instanceLabel(left);
      const rightInstance = instanceLabel(right);
      if (!leftInstance && rightInstance) return 1;
      if (leftInstance && !rightInstance) return -1;
      const instanceOrder = (leftInstance ?? "").localeCompare(rightInstance ?? "", "pt-BR", {
        sensitivity: "base",
        numeric: true,
      });
      return (
        instanceOrder ||
        left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base", numeric: true }) ||
        right.createdAt.getTime() - left.createdAt.getTime()
      );
    })
    .map((contact) => contact.id);
}

function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function cleanNullable(value?: string | null) {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

export function normalizeNullableEmail(value?: string | null) {
  return cleanNullable(value)?.toLocaleLowerCase("en-US") ?? null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
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
  return (
    cleanNullable(item.number) ?? cleanNullable(item.remoteJid) ?? cleanNullable(item.id) ?? ""
  );
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

function hasDeletionVariableReference(value: unknown, token: string) {
  if (value === null || value === undefined) return false;
  const searchable = typeof value === "string" ? value : JSON.stringify(value);
  return searchable.includes(token);
}

function nullableUpdate(value?: string | null) {
  if (value === undefined) return undefined;
  return cleanNullable(value);
}

function normalizeEmailUpdate(value?: string | null) {
  if (value === undefined) return undefined;
  return normalizeNullableEmail(value);
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
      message: "Já existe um contato ativo com este telefone.",
    });
  }
  throw error;
}

function handleContactCatalogUniqueError(
  error: unknown,
  kind: "department" | "profile",
  name: string,
): never {
  if (isPrismaError(error, "P2002")) {
    throw new ConflictException({
      code:
        kind === "department"
          ? "CONTACT_DEPARTMENT_ALREADY_EXISTS"
          : "CONTACT_PROFILE_ALREADY_EXISTS",
      message:
        kind === "department"
          ? `Departamento do Contato "${name}" já existente.`
          : `Perfil do Contato "${name}" já existente.`,
    });
  }
  throw error;
}

function isPrismaError(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
