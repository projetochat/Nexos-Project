import { IsOptional, IsString, MaxLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MaxLength(4000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;
}
