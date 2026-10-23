import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { CustomerAccessProfile } from "../../generated/prisma";

export class LinkCustomerPortalUserDto {
  @IsString()
  @MinLength(1)
  contactId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[a-z0-9][a-z0-9._-]{2,63})$/i, {
    message: "Informe um e-mail ou login válido.",
  })
  login!: string;

  @IsEnum(CustomerAccessProfile)
  accessProfile!: CustomerAccessProfile;

  @IsOptional()
  @IsUUID()
  customerDepartmentId?: string | null;

  @IsOptional()
  @IsUUID()
  customerBranchId?: string | null;
}

export class UpdateCustomerPortalLoginDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[a-z0-9][a-z0-9._-]{2,63})$/i, {
    message: "Informe um e-mail ou login válido.",
  })
  login!: string;

  @IsEnum(CustomerAccessProfile)
  accessProfile!: CustomerAccessProfile;

  @IsOptional()
  @IsUUID()
  customerDepartmentId?: string | null;

  @IsOptional()
  @IsUUID()
  customerBranchId?: string | null;
}
