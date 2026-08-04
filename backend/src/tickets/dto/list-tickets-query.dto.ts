import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";
import { Transform, Type } from "class-transformer";
import { TicketPriority, TicketStatus } from "../../generated/prisma";

export class ListTicketsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(Object.values(TicketStatus)) status?: TicketStatus;
  @IsOptional() @IsIn(Object.values(TicketPriority)) priority?: TicketPriority;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() assignedMembershipId?: string;
  @IsOptional() @IsString() requesterContactId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() conversationId?: string;
  @IsOptional() @IsISO8601() createdFrom?: string;
  @IsOptional() @IsISO8601() createdTo?: string;
  @IsOptional() @IsString() sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @Transform(({ value }) => value === "true")
  @IsOptional()
  includeArchived?: boolean;
}
