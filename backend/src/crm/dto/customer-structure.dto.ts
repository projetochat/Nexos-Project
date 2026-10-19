import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";

const BRANCH_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export class CustomerBranchDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @MaxLength(120)
  city!: string;

  @IsString()
  @MaxLength(2)
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
