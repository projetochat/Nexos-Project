import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";

export const CONTACT_COMPANY_ROLES = ["COLABORADOR", "SUPERVISOR", "GERENTE", "DIRETORIA"] as const;

export class CreateContactDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  departmentName?: string;

  @IsOptional()
  @IsIn(CONTACT_COMPANY_ROLES)
  companyRole?: (typeof CONTACT_COMPANY_ROLES)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  instance?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  tagIds?: string[];
}
