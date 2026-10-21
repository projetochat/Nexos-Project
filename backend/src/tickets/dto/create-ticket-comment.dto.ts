import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTicketCommentDto {
  @IsString() @MinLength(1) @MaxLength(15_000_000) bodyHtml!: string;
  @IsOptional() @IsBoolean() internal?: boolean;
}
