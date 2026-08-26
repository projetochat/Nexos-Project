import { IsArray, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  avatarUrl?: string | null;
}
