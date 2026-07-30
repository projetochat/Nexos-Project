import { IsBoolean, IsOptional, IsUUID } from "class-validator";

export class AssignConversationDto {
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
