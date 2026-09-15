import { IsIn } from "class-validator";
import { TicketStatus } from "../../generated/prisma";

export class UpdateTicketStatusDto {
  @IsIn(Object.values(TicketStatus))
  status!: TicketStatus;
}
