import { IsUUID } from "class-validator";

export class TransferDepartmentDto {
  @IsUUID()
  departmentId!: string;
}
