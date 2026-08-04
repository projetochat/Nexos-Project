import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class CreateTicketCommentDto {
  @IsString() @MinLength(1) bodyHtml!: string;
  @IsOptional() @IsBoolean() internal?: boolean;
}
