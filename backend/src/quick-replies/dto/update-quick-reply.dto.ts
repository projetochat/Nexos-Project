import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

export class UpdateQuickReplyDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Matches(/^\p{L}+$/u, { message: "O atalho deve conter somente letras." })
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

  @IsOptional()
  @IsString()
  attachmentFileName?: string | null;

  @IsOptional()
  @IsString()
  attachmentMimeType?: string | null;

  @IsOptional()
  attachmentSize?: number | null;

  @IsOptional()
  @IsString()
  attachmentDataUrl?: string | null;
}
