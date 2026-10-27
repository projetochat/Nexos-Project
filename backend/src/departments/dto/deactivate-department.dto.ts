import { Type } from "class-transformer";
import {
  IsArray,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class DepartmentMigrationTargetDto {
  @IsOptional()
  @IsUUID()
  connectionId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  departmentId!: string;
}

export class DeactivateDepartmentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepartmentMigrationTargetDto)
  targets!: DepartmentMigrationTargetDto[];
}
