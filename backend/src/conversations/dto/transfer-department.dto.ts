import { IsString, IsNotEmpty, MaxLength } from "class-validator";

export class TransferDepartmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  departmentId!: string;
}
