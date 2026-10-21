import {
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";

export const CUSTOMER_PERSON_TYPES = ["PHYSICAL", "LEGAL"] as const;
export const CUSTOMER_STATUSES = ["ACTIVE", "PROSPECT", "SUSPENDED", "CANCELLED"] as const;

export class CreateCustomerDto {
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsIn(CUSTOMER_PERSON_TYPES)
  personType?: (typeof CUSTOMER_PERSON_TYPES)[number];

  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: (typeof CUSTOMER_STATUSES)[number];

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibleContactName?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  document?: string;

  @IsOptional()
  @IsBoolean()
  addressFullEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressNumber?: string;

  @IsOptional()
  @IsBoolean()
  addressWithoutNumber?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;
}
