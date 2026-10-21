import { IsOptional, IsString } from "class-validator";

export class InviteCustomerContactDto {
  @IsOptional()
  @IsString()
  name?: string;
}
