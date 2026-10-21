import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class TicketResponseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(15_000_000)
  bodyHtml!: string;
}

export class TransferTicketDto extends TicketResponseDto {
  @IsString()
  departmentId!: string;

  @IsOptional()
  @IsString()
  assignedMembershipId?: string | null;
}

export class RequestTicketApprovalDto extends TicketResponseDto {
  @IsOptional()
  @IsString()
  approverMembershipId?: string;

  @IsOptional()
  @IsString()
  approverContactId?: string;
}

export class DecideTicketApprovalDto {
  @IsString()
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(15_000_000)
  bodyHtml?: string;
}

export class ValidateTicketSolutionDto {
  @IsString()
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(15_000_000)
  bodyHtml?: string;
}
