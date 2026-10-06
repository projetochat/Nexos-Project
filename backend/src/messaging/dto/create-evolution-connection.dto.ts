import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateEvolutionConnectionDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  idempotencyKey?: string;

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
  serviceEnabled?: boolean;

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
