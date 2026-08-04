import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { TicketCategory, TicketPriority } from "../../generated/prisma";

export class UpdateTicketDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MinLength(1) descriptionHtml?: string;
  @IsOptional() @IsIn(Object.values(TicketPriority)) priority?: TicketPriority;
  @IsOptional() @IsIn(Object.values(TicketCategory)) category?: TicketCategory;
  @IsOptional() @IsString() requesterContactId?: string | null;
  @IsOptional() @IsString() customerId?: string | null;
  @IsOptional() @IsString() conversationId?: string | null;
}
