import { Type } from "class-transformer";
import { IsArray, IsOptional, IsUUID, ValidateNested } from "class-validator";

export class DepartmentMigrationTargetDto {
  @IsOptional()
  @IsUUID()
  connectionId?: string | null;

  @IsUUID()
  departmentId!: string;
}

export class DeactivateDepartmentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepartmentMigrationTargetDto)
  targets!: DepartmentMigrationTargetDto[];
}
