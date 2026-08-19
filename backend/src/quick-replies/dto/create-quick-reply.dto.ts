import { IsOptional, IsString, IsUUID, Length } from "class-validator";

export class CreateQuickReplyDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @IsString()
  @Length(1, 40)
  shortcut!: string;

  @IsString()
  @Length(1, 2000)
  content!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;
}
