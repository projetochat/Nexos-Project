import { IsOptional, IsString } from "class-validator";

export class UpdateTicketAssigneeDto {
  @IsOptional() @IsString() assignedMembershipId?: string | null;
}
