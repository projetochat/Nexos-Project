import { IsString, MaxLength, MinLength } from "class-validator";

export class UpdateTicketCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(15_000_000)
  bodyHtml!: string;
}
