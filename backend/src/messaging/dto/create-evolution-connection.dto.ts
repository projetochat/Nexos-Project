import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateEvolutionConnectionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  instanceName?: string;
}
