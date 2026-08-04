import {
  IsArray,
  IsBoolean,
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
  Min,
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
}

export class InitialAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
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

  @ValidateNested()
  @Type(() => InitialAdminDto)
  admin!: InitialAdminDto;
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
  @Matches(/^[a-z0-9][a-z0-9-_]{1,62}$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(["DRAFT", "ACTIVE"])
  status?: "DRAFT" | "ACTIVE";

  @IsOptional()
  @IsIn(["MONTHLY", "YEARLY", "MANUAL"])
  billingPeriod?: "MONTHLY" | "YEARLY" | "MANUAL";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

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
  @IsIn(["DRAFT", "ACTIVE"])
  status?: "DRAFT" | "ACTIVE";

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
  @IsIn(["TRIALING", "ACTIVE"])
  status?: "TRIALING" | "ACTIVE";

  @IsOptional()
  @IsISO8601()
  currentPeriodEnd?: string;

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
}

export class CancelSubscriptionDto extends ReasonDto {
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}

export class CreateInvoiceDto {
  @IsString()
  tenantId!: string;

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
}

export class InvoiceStatusDto {
  @IsIn(["DRAFT", "OPEN", "PAID", "VOID", "OVERDUE"])
  status!: "DRAFT" | "OPEN" | "PAID" | "VOID" | "OVERDUE";
}

export class StartImpersonationDto extends ReasonDto {
  @IsString()
  tenantId!: string;

  @IsString()
  membershipId!: string;
}
