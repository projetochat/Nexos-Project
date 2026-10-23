import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class PortalLoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[a-z0-9][a-z0-9._-]{2,63})$/i)
  login!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
