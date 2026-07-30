import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  permissionIds!: string[];

  @IsOptional()
  metadata?: unknown;

  @IsOptional()
  @IsBoolean()
  system?: boolean;
}
