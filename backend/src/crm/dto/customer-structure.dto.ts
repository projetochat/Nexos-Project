import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

const BRANCH_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export class CustomerBranchDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(2, 120)
  @Matches(/\S/, { message: "city must contain visible characters" })
  city!: string;

  @IsString()
  @Length(2, 2)
  state!: string;

  @IsOptional()
  @IsIn(BRANCH_STATUSES)
  status?: (typeof BRANCH_STATUSES)[number];
}

export class CustomerDepartmentDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsUUID()
  managerContactId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
