import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ServiceHoursDto } from "./service-hours.dto";
import { QuickReplyAttachmentDto } from "../../quick-replies/dto/quick-reply-message.dto";

export class UpdateMessagingConnectionDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => ServiceHoursDto)
  serviceHours?: ServiceHoursDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  welcomeEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  welcomeNewMessage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  welcomeExistingMessage?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuickReplyAttachmentDto)
  welcomeNewAttachment?: QuickReplyAttachmentDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuickReplyAttachmentDto)
  welcomeExistingAttachment?: QuickReplyAttachmentDto | null;

  @IsOptional()
  @IsBoolean()
  absenceEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  absenceMessage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
