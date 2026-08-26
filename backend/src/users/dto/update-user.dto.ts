import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { MembershipStatus, UserStatus } from "../../generated/prisma";

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(MembershipStatus)
  membershipStatus?: MembershipStatus;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  avatarUrl?: string | null;
}
