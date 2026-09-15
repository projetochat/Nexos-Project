import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";

export class ListQuickRepliesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  status?: "active" | "archived" | "all";

  @IsOptional()
  @IsIn(["visible", "catalog"])
  scope?: "visible" | "catalog";
}
