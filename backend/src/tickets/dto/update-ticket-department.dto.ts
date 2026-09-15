import { IsString } from "class-validator";

export class UpdateTicketDepartmentDto {
  @IsString()
  departmentId!: string;
}
