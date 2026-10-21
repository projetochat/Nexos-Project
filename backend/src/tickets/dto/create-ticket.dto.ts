import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { TicketCategory, TicketPriority } from "../../generated/prisma";

export class CreateTicketDto {
  @IsString() @MinLength(3) @MaxLength(180) title!: string;
  @IsString() @MinLength(1) @MaxLength(15_000_000) descriptionHtml!: string;
  @IsOptional() @IsIn(Object.values(TicketPriority)) priority?: TicketPriority;
  @IsOptional() @IsIn(Object.values(TicketCategory)) category?: TicketCategory;
  @IsOptional() @IsString() requesterUserId?: string;
  @IsOptional() @IsString() requesterContactId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() customerDepartmentId?: string;
  @IsOptional() @IsString() originBranchId?: string;
  @IsOptional() @IsString() conversationId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() assignedMembershipId?: string | null;
}
