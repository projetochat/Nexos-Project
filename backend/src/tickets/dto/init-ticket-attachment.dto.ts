import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class InitTicketAttachmentDto {
  @IsString() originalName!: string;
  @IsString() mimeType!: string;
  @IsInt() @Min(1) @Max(100 * 1024 * 1024) sizeBytes!: number;
  @IsOptional() @IsString() commentId?: string;
}
