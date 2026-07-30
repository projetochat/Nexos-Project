import { IsString } from "class-validator";

export class AssignDepartmentMemberDto {
  @IsString()
  membershipId!: string;
}
