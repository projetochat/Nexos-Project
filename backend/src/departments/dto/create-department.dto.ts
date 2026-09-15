import { IsBoolean, IsHexColor, IsOptional, IsString, MinLength } from "class-validator";

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
  @IsBoolean()
  active?: boolean;
}
