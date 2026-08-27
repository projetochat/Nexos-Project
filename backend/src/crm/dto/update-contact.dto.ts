import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";
import { CONTACT_COMPANY_ROLES } from "./create-contact.dto";

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

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
  contactDepartmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactProfileId?: string | null;

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
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  instanceIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string | number | boolean | null>;
}

