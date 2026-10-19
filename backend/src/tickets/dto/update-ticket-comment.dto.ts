import { IsString, MinLength } from "class-validator";

export class UpdateTicketCommentDto {
  @IsString()
  @MinLength(1)
  bodyHtml!: string;
}
