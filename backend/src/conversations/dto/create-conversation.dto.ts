import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateConversationDto {
  @IsUUID()
  contactId!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  connectionId?: string | null;

  @IsOptional()
  @IsBoolean()
  assignToSelf?: boolean;

  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  firstMessagePreview?: string | null;
}
