import { IsEmail, IsHexColor, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class CreateCustomerDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibleContactName?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}
