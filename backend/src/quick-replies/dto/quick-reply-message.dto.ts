import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class QuickReplyAttachmentDto {
  @IsString() @Length(1, 255) fileName!: string;
  @IsString() @Length(1, 150) mimeType!: string;
  @IsInt() @Min(0) @Max(10 * 1024 * 1024) size!: number;
  @IsString()
  @Length(1, 14 * 1024 * 1024)
  @Matches(/^data:[^;,]+;base64,[A-Za-z0-9+/]*={0,2}$/)
  dataUrl!: string;
}

export class QuickReplyMessageDto {
  @IsString() @Length(0, 2000) text!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => QuickReplyAttachmentDto)
  attachment?: QuickReplyAttachmentDto | null;
}

export class QuickReplySequenceDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10, { message: "Número máximo de mensagens atingido" })
  @ValidateNested({ each: true })
  @Type(() => QuickReplyMessageDto)
  messages?: QuickReplyMessageDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(60)
  intervalSeconds?: number;
}
