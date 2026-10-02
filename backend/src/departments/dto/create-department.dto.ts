import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";

export const DEPARTMENT_ICONS = [
  "department",
  "shopping-cart",
  "dollar-sign",
  "credit-card",
  "truck",
  "package",
  "receipt",
  "headset",
  "monitor",
] as const;

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsString()
  @IsIn(DEPARTMENT_ICONS)
  icon?: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  connectionIds!: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
