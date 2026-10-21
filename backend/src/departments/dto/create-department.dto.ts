import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsOptional,
  IsInt,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  Max,
  Min,
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
  description?: string | null;

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

  @IsOptional()
  @IsBoolean()
  inactivityClosureEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_080)
  inactivityTimeoutMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  inactivityClosureMessage?: string | null;
}
