import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateMessagingConnectionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  welcomeEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  welcomeNewMessage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  welcomeExistingMessage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
