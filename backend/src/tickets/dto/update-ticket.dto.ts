import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { TicketCategory, TicketPriority, TicketSubstatus } from "../../generated/prisma";

export class UpdateTicketDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MinLength(1) descriptionHtml?: string;
  @IsOptional() @IsIn(Object.values(TicketPriority)) priority?: TicketPriority;
  @IsOptional() @IsIn(Object.values(TicketCategory)) category?: TicketCategory;
  @IsOptional() @IsIn(Object.values(TicketSubstatus)) substatus?: TicketSubstatus | null;
}
