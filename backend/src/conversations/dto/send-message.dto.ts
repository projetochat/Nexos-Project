import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MaxLength(4000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  quotedMessageId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  mentions?: string[];
}
