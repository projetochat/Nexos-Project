import { IsString, MinLength } from "class-validator";

export class ActivateUserDto {
  @IsString()
  @MinLength(6)
  password!: string;
}
