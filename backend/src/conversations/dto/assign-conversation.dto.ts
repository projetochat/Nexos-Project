import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AssignConversationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  membershipId?: string | null;

  @IsOptional()
  @IsBoolean()
  self?: boolean;

  @IsOptional()
  @IsBoolean()
  unassign?: boolean;
}
