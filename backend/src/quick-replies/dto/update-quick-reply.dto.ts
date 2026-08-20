import { IsBoolean, IsOptional, IsString, IsUUID, Length } from "class-validator";

export class UpdateQuickReplyDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  shortcut?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  content?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsBoolean()
  closeOnSend?: boolean;
}
