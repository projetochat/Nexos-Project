import { IsString, MinLength } from "class-validator";

export class SetFavoriteDepartmentDto {
  @IsString()
  @MinLength(1)
  departmentId!: string;
}
