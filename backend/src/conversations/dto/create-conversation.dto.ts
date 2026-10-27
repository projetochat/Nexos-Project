import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateConversationDto {
  @IsUUID()
  contactId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  connectionId?: string | null;

  @IsOptional()
  @IsBoolean()
  assignToSelf?: boolean;

  @IsOptional()
  @IsBoolean()
  reuseExistingOpen?: boolean;

  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;

  @IsOptional()
  @IsUUID()
  sourceGroupConversationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  firstMessagePreview?: string | null;
}
