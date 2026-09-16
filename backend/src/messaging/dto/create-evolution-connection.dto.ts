import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateEvolutionConnectionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  instanceName?: string;

  @IsOptional()
  @IsBoolean()
  importHistoryEnabled?: boolean;

  @IsOptional()
  @IsDateString()
  importHistoryStartDate?: string;

  @IsOptional()
  @IsBoolean()
  importGroupsEnabled?: boolean;

  @IsOptional()
  @IsDateString()
  importGroupsStartDate?: string;
}
