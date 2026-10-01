import {
  IsArray,
  IsBoolean,
  IsByteLength,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class PlatformListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: string | number;

  @IsOptional()
  pageSize?: string | number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsISO8601()
  createdAt?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsString()
  period?: string;
}

export class CreatePlatformClientDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateIf((dto: CreatePlatformClientDto) => dto.status !== "PROSPECTING")
  @IsString()
  @Matches(/^\d{14}$/)
  document?: string;

  @IsString()
  @IsNotEmpty()
  responsibleName!: string;

  @IsEmail()
  responsibleEmail!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/)
  state!: string;

  @IsOptional()
  @IsISO8601()
  registeredAt?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED", "CANCELLED", "PROSPECTING"])
  status?: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "PROSPECTING";

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePlatformClientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ValidateIf(
    (dto: UpdatePlatformClientDto) => dto.document !== undefined && dto.status !== "PROSPECTING",
  )
  @IsString()
  @Matches(/^\d{14}$/)
  document?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  responsibleName?: string;

  @IsOptional()
  @IsEmail()
  responsibleEmail?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  state?: string;

  @IsOptional()
  @IsISO8601()
  registeredAt?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED", "CANCELLED", "PROSPECTING"])
  status?: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "PROSPECTING";

  @IsOptional()
  @IsString()
  notes?: string;
}

export class InitialAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  @IsByteLength(1, 72, { message: "A senha deve possuir no máximo 72 bytes." })
  password!: string;
}

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
  slug!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsOptional()
  @IsIn(["TRIAL", "ACTIVE"])
  initialStatus?: "TRIAL" | "ACTIVE";

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialAdminDto)
  admin?: InitialAdminDto;

  @IsOptional()
  @IsString()
  responsibleName?: string;

  @IsOptional()
  @IsEmail()
  responsibleEmail?: string;

  @IsOptional()
  @IsString()
  responsiblePhone?: string;

  @IsOptional()
  @IsString()
  responsibleTitle?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxConnections?: number;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @IsEmail()
  technicalEmail?: string;

  @IsOptional()
  @IsString()
  responsibleName?: string;

  @IsOptional()
  @IsEmail()
  responsibleEmail?: string;

  @IsOptional()
  @IsString()
  responsiblePhone?: string;

  @IsOptional()
  @IsString()
  responsibleTitle?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxConnections?: number;
}

export class UpdateTenantAdministratorCredentialsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  responsibleName!: string;

  @IsEmail()
  @MaxLength(254)
  responsibleEmail!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  @IsByteLength(0, 72, { message: "A senha deve possuir no máximo 72 bytes." })
  newPassword?: string;
}

export class UpdatePlatformSettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  defaultTrialDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  defaultSubscriptionPeriodDays!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency!: string;
}

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class TerminateTenantDto extends ReasonDto {
  @IsString()
  @IsNotEmpty()
  confirmSlug!: string;
}

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED", "INACTIVE"])
  status?: "ACTIVE" | "SUSPENDED" | "INACTIVE";

  @IsOptional()
  @IsIn(["MONTHLY", "YEARLY", "MANUAL"])
  billingPeriod?: "MONTHLY" | "YEARLY" | "MANUAL";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  trialDays?: number;

  @IsObject()
  features!: Record<string, unknown>;

  @IsObject()
  limits!: Record<string, unknown>;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED", "INACTIVE"])
  status?: "ACTIVE" | "SUSPENDED" | "INACTIVE";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  trialDays?: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  limits?: Record<string, unknown>;
}

export class CreateSubscriptionDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsISO8601()
  currentPeriodEnd?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsBoolean()
  indefinite?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyValueCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountCents?: number;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsIn(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "EXPIRED"])
  status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "EXPIRED";

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyValueCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountCents?: number;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelSubscriptionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  subscriptionId!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotalCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountCents?: number;

  @IsISO8601()
  dueAt!: string;

  @IsOptional()
  @IsISO8601()
  referenceDate?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paidCents?: number;

  @IsOptional()
  @IsBoolean()
  released?: boolean;
}

export class InvoiceStatusDto {
  @IsIn(["DRAFT", "OPEN", "PAID", "VOID", "OVERDUE", "RELEASED"])
  status!: "DRAFT" | "OPEN" | "PAID" | "VOID" | "OVERDUE" | "RELEASED";
}

export class UpdateInvoiceDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotalCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paidCents?: number;

  @IsOptional()
  @IsBoolean()
  released?: boolean;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsISO8601()
  referenceDate?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StartImpersonationDto extends ReasonDto {
  @IsString()
  tenantId!: string;

  @IsString()
  membershipId!: string;
}

export class StartImpersonationHandoffDto extends StartImpersonationDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  codeChallenge!: string;
}

export class ExchangeImpersonationHandoffDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  code!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/)
  codeVerifier!: string;
}
