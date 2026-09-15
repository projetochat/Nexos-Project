import { IsIn, IsOptional, IsString } from "class-validator";
import { PaginationDto } from "./pagination.dto";

export class ListContactsQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(["all", "linked", "unlinked"])
  linked?: "all" | "linked" | "unlinked" = "all";

  @IsOptional()
  @IsString()
  instance?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  tagId?: string;
}
