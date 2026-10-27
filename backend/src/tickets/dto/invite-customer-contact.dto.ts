import { IsOptional, IsString, IsUUID } from "class-validator";

export class InviteCustomerContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
