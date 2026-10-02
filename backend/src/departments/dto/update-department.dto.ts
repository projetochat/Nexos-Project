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
import { DEPARTMENT_ICONS } from "./create-department.dto";

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

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

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  connectionIds?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
